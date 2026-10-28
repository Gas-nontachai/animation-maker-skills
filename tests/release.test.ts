import {afterEach, describe, expect, it, vi} from 'vitest';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
// @ts-expect-error Release tooling is dependency-free JavaScript, also used before npm ci.
import {latestVersion, nextVersion, resolvePlan, registryJSON, publishAndTag, verifyReleaseBase, finishRelease, ensureTag} from '../scripts/release.mjs';
// @ts-expect-error Security tooling is dependency-free JavaScript.
import {rejectLocalPaths, verifyManifests} from '../scripts/security-gate.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {...actual, execFileSync: vi.fn()};
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {...actual, readFile: vi.fn()};
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const runtime = (message: string) => ({message, files: ['scripts/render.ts']});
const metadata = {name: '@gasnonthachai/animation-maker', version: '1.1.2', gitHead: head, dist: {integrity: 'sha512-tested'}};
const plan = {name: metadata.name, version: metadata.version, head, integrity: metadata.dist.integrity, action: 'publish'};
const versions = {
  '0.0.0-stage': {},
  '1.1.0': {name: metadata.name, version: '1.1.0'},
  '1.1.1': {...metadata, version: '1.1.1', gitHead: base},
};
const input = {head, initialVersion: '1.1.0', versions, tags: {'v1.1.1': base}, commits: []};

describe('version planning', () => {
  it.each([
    ['fix: handle browser extraction', '1.2.4'],
    ['feat(wave): add preset', '1.3.0'],
    ['fix!: change contract', '2.0.0'],
    ['refactor(runtime): change\n\nBREAKING CHANGE: schema', '2.0.0'],
    ['chore: runtime maintenance', '1.2.4'],
    ['unclassified change', '1.2.4'],
  ])('%s resolves to %s', (message, expected) => expect(nextVersion('1.2.3', [runtime(message)])).toBe(expected));

  it('uses the largest bump across accumulated runtime commits, ignoring docs-only breaking commits', () => {
    expect(nextVersion('1.2.3', [runtime('feat: earlier un-released feature'), {message: 'docs!: docs only', files: ['README.md']}, runtime('fix: last commit')])).toBe('1.3.0');
    expect(nextVersion('1.2.3', [{message: 'feat: skills', files: ['skills/animate/SKILL.md', 'docs/release.md']}])).toBeNull();
    expect(nextVersion('1.2.3', [{message: 'chore: pipeline', files: ['.github/workflows/release.yml', 'scripts/release.mjs', 'tests/release.test.ts']}])).toBeNull();
    expect(nextVersion('1.2.3', [{message: 'new helper', files: ['scripts/new-runtime-helper.mjs']}])).toBe('1.2.4');
  });

  it('chooses the greatest stable registry version rather than a moved latest dist-tag', () => {
    expect(latestVersion({'1.9.0': {}, '1.10.0': {}, '2.0.0-beta.1': {}})).toBe('1.10.0');
  });

  it('uses the checked-in version for a first release and skips an empty first release', () => {
    const first = {...input, versions: {}, tags: {}, commits: [runtime('feat: initial runtime')]};
    expect(resolvePlan(first)).toMatchObject({action: 'publish', version: '1.1.0', baseline: null});
    expect(resolvePlan({...first, commits: []}).action).toBe('skip');
    expect(() => resolvePlan({...first, tags: {'v1.1.0': base}})).toThrow('already exists');
  });

  it.each([
    ['fix: patch', '1.1.2'], ['feat: minor', '1.2.0'], ['feat!: major', '2.0.0'],
  ])('versions from verified 1.1.1, not the legacy release or manifest: %s', (message, version) => {
    expect(resolvePlan({...input, commits: [runtime(message)]})).toMatchObject({
      action: 'publish', version, baseline: base, previousVersion: '1.1.1',
    });
    expect(resolvePlan(input)).toMatchObject({action: 'skip', baseline: base});
  });

  it('rejects release version collisions', () => {
    expect(() => resolvePlan({...input, commits: [runtime('fix: next')], tags: {...input.tags, 'v1.1.2': head}})).toThrow('already exists');
  });

  it('recovers the published commit before considering newer commits', () => {
    expect(resolvePlan({...input, tags: {}, commits: [runtime('feat: newer')]})).toEqual({
      name: metadata.name, action: 'recover', version: '1.1.1', head: base, integrity: metadata.dist.integrity,
    });
  });

  it.each([undefined, '', 'prod', 'a'.repeat(39)])('rejects missing/invalid gitHead even with an existing tag: %s', gitHead => {
    expect(() => resolvePlan({...input, versions: {'1.1.1': {...versions['1.1.1'], gitHead}}})).toThrow('gitHead baseline');
  });

  it('rejects a conflicting baseline tag or recovery without integrity', () => {
    expect(() => resolvePlan({...input, tags: {'v1.1.1': head}})).toThrow('different commit');
    expect(() => resolvePlan({...input, tags: {}, versions: {'1.1.1': {gitHead: base}}})).toThrow('integrity');
  });

  it('only treats HTTP 404 as an unpublished package', async () => {
    expect(await registryJSON('package', async () => new Response('', {status: 404}))).toBeNull();
    for (const status of [401,403,429,500]) await expect(registryJSON('package', async () => new Response('', {status}))).rejects.toThrow(`HTTP ${status}`);
    await expect(registryJSON('package', async () => {throw new Error('network unavailable');})).rejects.toThrow('network unavailable');
  });

  it('rejects a stale plan if another publisher advances the registry during approval', () => {
    expect(() => verifyReleaseBase({previousVersion: '1.1.1'}, versions)).not.toThrow();
    expect(() => verifyReleaseBase({previousVersion: '1.1.1'}, {...versions, '1.1.2': metadata})).toThrow('advanced');
    expect(() => verifyReleaseBase({previousVersion: null}, {})).not.toThrow();
    expect(() => verifyReleaseBase({previousVersion: null}, versions)).toThrow('advanced');
  });
});

describe('finish gates (mocked publication and GitHub API)', () => {
  it.each(['publish', 'wrong checkout', 'divergent history', 'registry advanced', 'artifact changed'])(
    'enforces the real finish gates: %s', async scenario => {
      const bytes = Buffer.from('tested release artifact');
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      const releasePlan = {...plan, previousVersion: '1.1.1', tarball: 'output/gasnonthachai-animation-maker-1.1.2.tgz', integrity};
      const published = {...metadata, dist: {integrity}};
      for (const [key, value] of Object.entries({
        GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Gas-nontachai/animation-maker-skills',
        GITHUB_REF: 'refs/heads/prod', RELEASE_AUTHORIZED: 'true', NODE_AUTH_TOKEN: '', NPM_TOKEN: '',
      })) vi.stubEnv(key, value);
      const request = vi.fn()
        .mockResolvedValueOnce(new Response('', {status: 404}))
        .mockResolvedValueOnce(Response.json({versions: scenario === 'registry advanced' ? {...versions, '1.1.2': metadata} : versions}))
        .mockResolvedValueOnce(Response.json(published))
        .mockResolvedValueOnce(new Response('', {status: 404}))
        .mockResolvedValueOnce(Response.json({ref: 'refs/tags/v1.1.2'}));
      vi.stubGlobal('fetch', request);
      const execute = vi.mocked(execFileSync).mockImplementation((_command, args) => {
        if (args?.[0] === 'rev-parse') return scenario === 'wrong checkout' ? base : head;
        if (args?.[0] === 'merge-base' && scenario === 'divergent history') throw new Error('divergent history');
        if (args?.[0] === '--version') return '11.5.1';
        return '';
      });
      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(releasePlan))
        .mockResolvedValueOnce(scenario === 'artifact changed' ? Buffer.from('changed') : bytes);
      if (scenario === 'publish') {
        await finishRelease();
        expect(execute.mock.calls.filter(([, args]) => args?.[0] === 'publish')).toEqual([[
          'npm', ['publish', resolve(releasePlan.tarball), '--access', 'public', '--provenance',
            '--ignore-scripts', '--registry', 'https://registry.npmjs.org'], {stdio: 'inherit'},
        ]]);
        expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/git/refs'), expect.objectContaining({
          method: 'POST', body: JSON.stringify({ref: 'refs/tags/v1.1.2', sha: head}),
        }));
      } else {
        await expect(finishRelease()).rejects.toThrow();
        expect(execute.mock.calls.some(([, args]) => args?.[0] === 'publish')).toBe(false);
        expect(request.mock.calls.some(([, options]) => options?.method)).toBe(false);
      }
    });

  it('blocks the real finish command locally before any publish or tag operation', () => {
    const result = spawnSync(process.execPath, ['scripts/release.mjs', 'finish'], {env: {...process.env, GITHUB_ACTIONS: 'false'}, encoding: 'utf8'});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Publishing is GitHub Actions only');
  });

  it('finishes recovery at an ancestor without a tarball or another publish', async () => {
    const recovery = resolvePlan({...input, tags: {}});
    for (const [key, value] of Object.entries({
      GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Gas-nontachai/animation-maker-skills',
      GITHUB_REF: 'refs/heads/prod', RELEASE_AUTHORIZED: 'true', NODE_AUTH_TOKEN: '', NPM_TOKEN: '',
    })) vi.stubEnv(key, value);
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(recovery));
    const execute = vi.mocked(execFileSync).mockReturnValueOnce(head).mockReturnValueOnce('');
    const request = vi.fn().mockResolvedValueOnce(Response.json(versions['1.1.1']))
      .mockResolvedValueOnce(Response.json(versions['1.1.1']))
      .mockResolvedValueOnce(new Response('', {status: 404}))
      .mockResolvedValueOnce(Response.json({ref: 'refs/tags/v1.1.1'}));
    vi.stubGlobal('fetch', request);
    await finishRelease();
    expect(execute.mock.calls).toEqual([
      ['git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}],
      ['git', ['merge-base', '--is-ancestor', base, head], {encoding: 'utf8'}],
    ]);
    expect(readFile).toHaveBeenCalledOnce();
    expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/git/refs'), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ref: 'refs/tags/v1.1.1', sha: base}),
    }));
  });
});

describe('publish verification and recovery (mocked, no publication)', () => {
  it('tags only after the exact published version, gitHead and integrity are visible', async () => {
    const calls: string[] = [];
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(metadata);
    await publishAndTag(plan, {lookup, publish: async () => {calls.push('publish');}, tag: async () => {calls.push('tag');}, wait: async () => {calls.push('wait');}});
    expect(calls).toEqual(['publish', 'wait', 'tag']);
  });

  it('tolerates over five minutes of propagation with capped exponential backoff', async () => {
    let elapsed = 0, published = false;
    const publish = vi.fn(() => {published = true;});
    const wait = vi.fn(async (delay: number) => {elapsed += delay;});
    const tag = vi.fn();
    await publishAndTag(plan, {
      lookup: async () => published && elapsed >= 5 * 60 * 1000 ? metadata : null,
      publish, tag, wait, now: () => elapsed,
    });
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([5000, 10000, 20000, ...Array(9).fill(30000)]);
    expect(publish).toHaveBeenCalledOnce();
    expect(tag).toHaveBeenCalledOnce();
  });

  it('times out at eight minutes without tagging and recovers without republishing', async () => {
    let elapsed = 0;
    const publish = vi.fn(), tag = vi.fn();
    const wait = vi.fn(async (delay: number) => {elapsed += delay;});
    await expect(publishAndTag(plan, {lookup: async () => null, publish, tag, wait, now: () => elapsed})).rejects.toThrow('within 8 minutes');
    expect(elapsed).toBe(8 * 60 * 1000);
    expect(wait).toHaveBeenLastCalledWith(25000);
    expect(tag).not.toHaveBeenCalled();
    await publishAndTag({...plan, action: 'recover'}, {lookup: async () => metadata, publish, tag});
    expect(publish).toHaveBeenCalledOnce();
    expect(tag).toHaveBeenCalledOnce();
  });

  it('includes registry request time in the deadline and caps the final request timeout', async () => {
    let elapsed = 0;
    const lookup = vi.fn(async (timeout?: number) => {
      if (timeout !== undefined) elapsed += Math.min(5000, timeout);
      return null;
    });
    const tag = vi.fn();
    await expect(publishAndTag(plan, {
      lookup, publish: vi.fn(), tag, now: () => elapsed,
      wait: async (delay: number) => {elapsed += delay;},
    })).rejects.toThrow('within 8 minutes');
    expect(elapsed).toBe(8 * 60 * 1000);
    expect(lookup).toHaveBeenLastCalledWith(10000);
    expect(tag).not.toHaveBeenCalled();
  });

  it('never tags a failed publish or republishes an absent recovery version', async () => {
    const tag = vi.fn(), publish = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => null, publish: async () => {throw new Error('publish denied');}, tag})).rejects.toThrow('publish denied');
    await expect(publishAndTag({...plan, action: 'recover'}, {lookup: async () => null, publish, tag})).rejects.toThrow('absent from npm');
    expect(publish).not.toHaveBeenCalled();
    expect(tag).not.toHaveBeenCalled();
  });

  it('recovers a publish followed by tag failure without a second npm publish', async () => {
    const publish = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => metadata, publish, tag: async () => {throw new Error('tag denied');}})).rejects.toThrow('tag denied');
    const tag = vi.fn();
    await publishAndTag({...plan, action: 'recover'}, {lookup: async () => metadata, publish, tag});
    expect(publish).not.toHaveBeenCalled();
    expect(tag).toHaveBeenCalledOnce();
  });

  it.each([
    {...metadata, name: 'another-package'}, {...metadata, version: '1.1.0'},
    {...metadata, gitHead: base}, {...metadata, gitHead: undefined},
    {...metadata, dist: {integrity: 'sha512-other'}}, {...metadata, dist: {}},
  ])('rejects conflicting/incomplete metadata both before and after publishing: %j', async changed => {
    const publish = vi.fn(), tag = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => changed, publish, tag})).rejects.toThrow('mismatch');
    expect(publish).not.toHaveBeenCalled();
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(changed);
    await expect(publishAndTag(plan, {lookup, publish, tag})).rejects.toThrow('mismatch');
    expect(publish).toHaveBeenCalledOnce();
    expect(tag).not.toHaveBeenCalled();
  });

  it('fails closed on a registry outage after publishing rather than treating it as propagation', async () => {
    const publish = vi.fn(), tag = vi.fn(), wait = vi.fn();
    const lookup = vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('npm registry HTTP 500'));
    await expect(publishAndTag(plan, {lookup, publish, tag, wait})).rejects.toThrow('HTTP 500');
    expect(publish).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
    expect(tag).not.toHaveBeenCalled();
  });

  it('uses the GitHub API idempotently and never moves conflicting lightweight or annotated tags', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    request.mockResolvedValueOnce(Response.json({object: {type: 'commit', sha: head}}));
    await ensureTag(plan);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(Response.json({object: {type: 'commit', sha: base}}));
    await expect(ensureTag(plan)).rejects.toThrow('another commit');
    request.mockResolvedValueOnce(Response.json({object: {type: 'tag', sha: base}}))
      .mockResolvedValueOnce(Response.json({object: {type: 'commit', sha: head}}));
    await ensureTag(plan);
    request.mockResolvedValueOnce(Response.json({object: {type: 'tag', sha: base}}))
      .mockResolvedValueOnce(Response.json({object: {type: 'commit', sha: base}}));
    await expect(ensureTag(plan)).rejects.toThrow('another commit');
    request.mockResolvedValueOnce(new Response('', {status: 404}))
      .mockResolvedValueOnce(Response.json({ref: 'refs/tags/v1.1.2'}));
    await ensureTag(plan);
    expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/git/refs'), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ref: 'refs/tags/v1.1.2', sha: head}),
    }));
    expect(request.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
  });
});

describe('dependency and path gate', () => {
  it.each(['file:../runtime.tgz', 'git+file:///tmp/package', 'link:../runtime', 'workspace:*', '/Users/dev/runtime', 'C:\\Users\\dev\\runtime'])('rejects %s', spec => expect(() => rejectLocalPaths({dependency: spec})).toThrow('rejected'));
  it('checks lockfile links and permits registry dependencies', () => {
    const manifest = {name: '@gasnonthachai/animation-maker', version: '1.1.0', dependencies: {zod: '4.6.7'}};
    const lock = {name: manifest.name, version: manifest.version, packages: {'': {name: manifest.name, version: manifest.version}, 'node_modules/zod': {resolved: 'https://registry.npmjs.org/zod/-/zod-4.6.7.tgz'}}};
    expect(() => verifyManifests(manifest, lock)).not.toThrow();
    expect(() => verifyManifests(manifest, {...lock, packages: {...lock.packages, linked: {link: true}}})).toThrow('Linked');
  });
});
