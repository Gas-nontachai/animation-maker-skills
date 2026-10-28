import {describe, expect, it, vi} from 'vitest';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Release tooling is dependency-free JavaScript, also used before npm ci.
import {latestVersion, nextVersion, resolvePlan, registryJSON, publishAndTag, verifyReleaseBase, finishRelease, verifyBootstrapRecovery, ensureTag} from '../scripts/release.mjs';
// @ts-expect-error Security tooling is dependency-free JavaScript.
import {rejectLocalPaths, verifyManifests} from '../scripts/security-gate.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {...actual, execFileSync: vi.fn(actual.execFileSync), spawnSync: vi.fn(actual.spawnSync)};
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {...actual, readFile: vi.fn(actual.readFile)};
});

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const runtime = (message: string) => ({message, files: ['scripts/render.ts']});
const metadata = {name: '@gasnonthachai/animation-maker', version: '1.2.0', gitHead: head, dist: {integrity: 'sha512-tested'}};
const plan = {name: metadata.name, version: metadata.version, head, integrity: metadata.dist.integrity, action: 'publish'};
const bootstrap = {
  repository: 'Gas-nontachai/animation-maker-skills', version: '1.2.0', commit: base,
  integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
};
const externalMetadata = {name: metadata.name, version: bootstrap.version, dist: {integrity: bootstrap.integrity}};
const externalInput = {head, initialVersion: '1.1.0', versions: {'1.2.0': externalMetadata}, tags: {}, commits: []};

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
    expect(nextVersion('1.2.3', [{message: 'chore: pipeline', files: ['.github/workflows/release.yml', 'scripts/release.mjs']}])).toBeNull();
    expect(nextVersion('1.2.3', [{message: 'new helper', files: ['scripts/new-runtime-helper.mjs']}])).toBe('1.2.4');
  });

  it('chooses the greatest stable registry version rather than a moved latest dist-tag', () => {
    expect(latestVersion({'1.9.0': {}, '1.10.0': {}, '2.0.0-beta.1': {}})).toBe('1.10.0');
  });

  it('uses the checked-in version for a first release and skips an empty first release', () => {
    const input = {head, initialVersion: '1.1.0', versions: {}, tags: {}, commits: [runtime('feat: initial runtime')]};
    expect(resolvePlan(input)).toMatchObject({action: 'publish', version: '1.1.0', baseline: null});
    expect(resolvePlan({...input, commits: []}).action).toBe('skip');
    expect(() => resolvePlan({...input, tags: {'v1.1.0': base}})).toThrow('already exists');
  });

  it('releases accumulated changes from the registry baseline, then skips a duplicate run', () => {
    const versions = {'1.2.0': {gitHead: base, dist: {integrity: 'sha512-old'}}};
    const input = {head, initialVersion: '1.1.0', versions, tags: {'v1.2.0': base}, commits: [runtime('feat: not just the last commit'), {message: 'docs: final commit', files: ['README.md']}]};
    expect(resolvePlan(input)).toMatchObject({action: 'publish', baseline: base, version: '1.3.0'});
    expect(resolvePlan({...input, commits: []}).action).toBe('skip');
    expect(() => resolvePlan({...input, tags: {...input.tags, 'v1.3.0': head}})).toThrow('already exists');
  });

  it('recovers the published commit before considering newer commits', () => {
    expect(resolvePlan({head, initialVersion: '1.1.0', versions: {'1.2.0': {gitHead: base, dist: {integrity: 'sha512-old'}}}, tags: {}, commits: [runtime('feat: newer')]})).toMatchObject({action: 'recover', version: '1.2.0', head: base});
  });

  it('fails closed for missing provenance baseline or a conflicting tag', () => {
    const input = {head, initialVersion: '1.1.0', versions: {'1.2.0': {gitHead: base}}, tags: {}, commits: []};
    expect(() => resolvePlan({...input, versions: {'1.2.0': {}}})).toThrow('baseline');
    expect(() => resolvePlan({...input, tags: {'v1.2.0': head}})).toThrow('different commit');
  });

  it('accepts a legacy matching tag without gitHead and continues normal versioning', () => {
    expect(resolvePlan({...externalInput, tags: {'v1.2.0': base}, commits: [runtime('fix: next release')]}))
      .toMatchObject({action: 'publish', baseline: base, version: '1.2.1'});
  });

  it('requires explicit bootstrap evidence when neither gitHead nor tag exists', () => {
    expect(() => resolvePlan(externalInput)).toThrow('NPM_BOOTSTRAP_RECOVERY');
    expect(resolvePlan({...externalInput, bootstrap})).toMatchObject({
      action: 'recover', version: '1.2.0', head: base, integrity: bootstrap.integrity, bootstrap,
    });
  });

  it.each([
    [{...bootstrap, repository: 'someone/other'}, 'repository mismatch'],
    [{...bootstrap, version: '1.1.0'}, 'version mismatch'],
    [{...bootstrap, commit: 'prod'}, 'explicit full source commit'],
    [{...bootstrap, integrity: 'sha512-truncated'}, 'complete SHA-512'],
    [{...bootstrap, integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`}, 'integrity mismatch'],
  ])('rejects incomplete or conflicting bootstrap evidence %j', (evidence, error) => {
    expect(() => resolvePlan({...externalInput, bootstrap: evidence})).toThrow(error);
  });

  it('rejects bootstrap conflicts with gitHead, tags, or an established stable history', () => {
    expect(() => resolvePlan({...externalInput, bootstrap, versions: {'1.2.0': {...externalMetadata, gitHead: head}}})).toThrow('gitHead conflict');
    expect(() => resolvePlan({...externalInput, bootstrap, tags: {'v1.2.0': head}})).toThrow('conflicts');
    expect(() => resolvePlan({...externalInput, bootstrap, versions: {'1.1.0': {}, ...externalInput.versions}})).toThrow('initial stable release');
  });

  it.each([
    ['fix: patch', '1.2.1'], ['feat: minor', '1.3.0'], ['feat!: major', '2.0.0'],
  ])('continues automatic releases after bootstrap: %s', (message, version) => {
    const recovered = {...externalInput, bootstrap, tags: {'v1.2.0': base}};
    expect(resolvePlan(recovered).action).toBe('skip');
    expect(resolvePlan({...recovered, commits: [runtime(message)]})).toMatchObject({action: 'publish', version, baseline: base});
  });

  it('only treats HTTP 404 as an unpublished package', async () => {
    expect(await registryJSON('package', async () => new Response('', {status: 404}))).toBeNull();
    for (const status of [401,403,429,500]) await expect(registryJSON('package', async () => new Response('', {status}))).rejects.toThrow(`HTTP ${status}`);
  });

  it('rejects a stale plan if another publisher advances the registry during approval', () => {
    expect(() => verifyReleaseBase({previousVersion: '1.1.0'}, {'1.1.0': {}})).not.toThrow();
    expect(() => verifyReleaseBase({previousVersion: '1.1.0'}, {'1.1.0': {}, '1.1.1': {}})).toThrow('advanced');
    expect(() => verifyReleaseBase({previousVersion: null}, {})).not.toThrow();
    expect(() => verifyReleaseBase({previousVersion: null}, {'1.1.0': {}})).toThrow('advanced');
  });
});

describe('bootstrap source verification (local git and npm pack, no publication)', () => {
  async function fixture() {
    const dir = await mkdtemp(resolve(tmpdir(), 'animation-bootstrap-test-'));
    const runGit = (...args: string[]) => execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
    runGit('init', '--quiet');
    runGit('config', 'user.name', 'Release test');
    runGit('config', 'user.email', 'release@example.invalid');
    await writeFile(resolve(dir, 'package.json'), JSON.stringify({
      name: metadata.name, version: '1.2.0', files: ['index.js'], scripts: {prepack: 'node -e "throw new Error(\'must not run hooks\')"'},
    }));
    await writeFile(resolve(dir, 'index.js'), 'export const value = 1;\n');
    runGit('add', '.');
    runGit('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Initial source');
    const commit = runGit('rev-parse', 'HEAD');
    execFileSync('npm', ['pack', '--ignore-scripts', '--offline', '--workspaces=false', '--pack-destination', dir, '--cache', resolve(dir, 'cache')], {cwd: dir, stdio: 'pipe'});
    const bytes = await readFile(resolve(dir, 'gasnonthachai-animation-maker-1.2.0.tgz'));
    const evidence = {...bootstrap, commit, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`};
    const published = {...externalMetadata, dist: {integrity: evidence.integrity}};
    const recovery = resolvePlan({...externalInput, versions: {'1.2.0': published}, bootstrap: evidence});
    return {dir, runGit, evidence, published, recovery};
  }

  it('reproduces the complete registry integrity from an authorized ancestor, ignoring dirty files and hooks', async () => {
    const f = await fixture();
    vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(f.evidence));
    try {
      await writeFile(resolve(f.dir, 'index.js'), 'dirty worktree is not published source\n');
      await expect(verifyBootstrapRecovery(f.recovery, f.published, f.dir)).resolves.toBeUndefined();
      await expect(verifyBootstrapRecovery(f.recovery, f.published, f.dir)).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      await rm(f.dir, {recursive: true, force: true});
    }
  });

  it('fails closed for absent/changed authorization, wrong artifact, wrong version, and unrelated history', async () => {
    const f = await fixture();
    try {
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', '');
      await expect(verifyBootstrapRecovery(f.recovery, f.published, f.dir)).rejects.toThrow('explicit');
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify({...f.evidence, commit: head}));
      await expect(verifyBootstrapRecovery(f.recovery, f.published, f.dir)).rejects.toThrow('authorization changed');
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(f.evidence));
      await expect(verifyBootstrapRecovery(f.recovery, {...f.published, gitHead: head}, f.dir)).rejects.toThrow('gitHead conflict');
      const wrongArtifact = {...f.evidence, integrity: bootstrap.integrity};
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(wrongArtifact));
      await expect(verifyBootstrapRecovery({...f.recovery, bootstrap: wrongArtifact, integrity: wrongArtifact.integrity},
        {...f.published, dist: {integrity: wrongArtifact.integrity}}, f.dir)).rejects.toThrow('source artifact integrity mismatch');
      const wrongVersion = {...f.evidence, version: '1.2.1'};
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(wrongVersion));
      await expect(verifyBootstrapRecovery({...f.recovery, version: wrongVersion.version, bootstrap: wrongVersion},
        {...f.published, version: wrongVersion.version}, f.dir)).rejects.toThrow('source version mismatch');
      const unrelated = {...f.evidence, commit: f.runGit('commit-tree', 'HEAD^{tree}', '-m', 'Unrelated root')};
      vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(unrelated));
      await expect(verifyBootstrapRecovery({...f.recovery, head: unrelated.commit, bootstrap: unrelated}, f.published, f.dir)).rejects.toThrow('ancestor');
    } finally {
      vi.unstubAllEnvs();
      await rm(f.dir, {recursive: true, force: true});
    }
  });
});

describe('publish verification and recovery (mocked, no publication)', () => {
  it('publishes the verified tarball as an absolute local path, not GitHub shorthand', async () => {
    const tarball = Buffer.from('tested release artifact');
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
    const releasePlan = {...plan, previousVersion: null, tarball: 'output/gasnonthachai-animation-maker-1.2.0.tgz', integrity};
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_REPOSITORY', 'Gas-nontachai/animation-maker-skills');
    vi.stubEnv('GITHUB_REF', 'refs/heads/prod');
    vi.stubEnv('RELEASE_AUTHORIZED', 'true');
    vi.stubEnv('NODE_AUTH_TOKEN', '');
    vi.stubEnv('NPM_TOKEN', '');
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('', {status: 404}))
      .mockResolvedValueOnce(new Response('', {status: 404}))
      .mockResolvedValueOnce(Response.json({...metadata, dist: {integrity}}))
      .mockResolvedValueOnce(Response.json({object: {type: 'commit', sha: head}}));
    vi.stubGlobal('fetch', request);
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(releasePlan)).mockResolvedValueOnce(tarball);
    const execute = vi.mocked(execFileSync)
      .mockReturnValueOnce(head)
      .mockReturnValueOnce('')
      .mockReturnValueOnce('11.5.1')
      .mockReturnValueOnce('');
    try {
      await finishRelease();
      expect(readFile).toHaveBeenLastCalledWith(releasePlan.tarball);
      expect(execute).toHaveBeenLastCalledWith('npm', [
        'publish', resolve(releasePlan.tarball), '--access', 'public', '--provenance',
        '--ignore-scripts', '--registry', 'https://registry.npmjs.org',
      ], {stdio: 'inherit'});
      expect(request).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('blocks the real finish command locally before any publish or tag operation', () => {
    const result = spawnSync(process.execPath, ['scripts/release.mjs', 'finish'], {env: {...process.env, GITHUB_ACTIONS: 'false'}, encoding: 'utf8'});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Publishing is GitHub Actions only');
  });
  it('tags only after the exact published version, gitHead and integrity are visible', async () => {
    const calls: string[] = [];
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(metadata);
    await publishAndTag(plan, {lookup, publish: async () => {calls.push('publish');}, tag: async () => {calls.push('tag');}, wait: async () => {calls.push('wait');}});
    expect(calls).toEqual(['publish', 'wait', 'tag']);
  });

  it('never tags a failed publish', async () => {
    const tag = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => null, publish: async () => {throw new Error('publish denied');}, tag, wait: vi.fn()})).rejects.toThrow('publish denied');
    expect(tag).not.toHaveBeenCalled();
  });

  it('recovers a publish followed by tag failure without a second npm publish', async () => {
    const publish = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => metadata, publish, tag: async () => {throw new Error('tag denied');}, wait: vi.fn()})).rejects.toThrow('tag denied');
    const tag = vi.fn();
    await publishAndTag({...plan, action: 'recover'}, {lookup: async () => metadata, publish, tag, wait: vi.fn()});
    expect(publish).not.toHaveBeenCalled();
    expect(tag).toHaveBeenCalledOnce();
  });

  it('rejects an existing duplicate version owned by another commit/artifact', async () => {
    for (const changed of [{...metadata, gitHead: base}, {...metadata, dist: {integrity: 'sha512-other'}}]) {
      const publish = vi.fn(), tag = vi.fn();
      await expect(publishAndTag(plan, {lookup: async () => changed, publish, tag, wait: vi.fn()})).rejects.toThrow('mismatch');
      expect(publish).not.toHaveBeenCalled(); expect(tag).not.toHaveBeenCalled();
    }
  });

  it('does not trust bootstrap markers or publish/tag when source evidence is unverified', async () => {
    vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', '');
    const publish = vi.fn(), tag = vi.fn();
    const recovery = resolvePlan({...externalInput, bootstrap});
    try {
      await expect(publishAndTag(recovery, {lookup: async () => externalMetadata, publish, tag, wait: vi.fn()})).rejects.toThrow('authorization');
      await expect(publishAndTag(recovery, {lookup: async () => null, publish, tag, wait: vi.fn()})).rejects.toThrow('absent from npm');
      expect(publish).not.toHaveBeenCalled();
      expect(tag).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reverifies bootstrap proof after interrupted tagging and remains idempotent without publishing', async () => {
    const bytes = Buffer.from('exact reproducible source tarball');
    const evidence = {...bootstrap, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`};
    const published = {...externalMetadata, dist: {integrity: evidence.integrity}};
    const recovery = resolvePlan({...externalInput, versions: {'1.2.0': published}, bootstrap: evidence});
    const execute = vi.mocked(execFileSync), read = vi.mocked(readFile);
    const originalExecute = execute.getMockImplementation()!, originalRead = read.getMockImplementation()!;
    const spawn = vi.mocked(spawnSync), originalSpawn = spawn.getMockImplementation()!;
    const publish = vi.fn(), tag = vi.fn().mockRejectedValueOnce(new Error('tag interrupted')).mockResolvedValue(undefined);
    vi.stubEnv('NPM_BOOTSTRAP_RECOVERY', JSON.stringify(evidence));
    try {
      execute.mockClear();
      // Each attempt verifies at lookup and again immediately before tagging.
      for (let verification = 0; verification < 6; verification++) {
        spawn.mockReturnValueOnce({pid: 1, output: [], stdout: '', stderr: '', status: 0, signal: null});
        read.mockResolvedValueOnce(JSON.stringify({name: metadata.name, version: evidence.version})).mockResolvedValueOnce(bytes);
        for (let command = 0; command < 3; command++) execute.mockReturnValueOnce('');
      }
      const operations = {lookup: async () => published, publish, tag, wait: vi.fn()};
      await expect(publishAndTag(recovery, operations)).rejects.toThrow('tag interrupted');
      await publishAndTag(recovery, operations);
      await publishAndTag(recovery, operations);
      expect(publish).not.toHaveBeenCalled();
      expect(tag).toHaveBeenCalledTimes(3);
      expect(execute.mock.calls.filter(([command]) => command === 'npm')).toHaveLength(6);
      expect(execute.mock.calls.filter(([command]) => command === 'npm').every(([, args]) => args?.[0] === 'pack')).toBe(true);
    } finally {
      execute.mockReset().mockImplementation(originalExecute);
      spawn.mockReset().mockImplementation(originalSpawn);
      read.mockReset().mockImplementation(originalRead);
      vi.unstubAllEnvs();
    }
  });

  it('uses the GitHub API idempotently and never moves conflicting lightweight or annotated tags', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    try {
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
        .mockResolvedValueOnce(Response.json({ref: 'refs/tags/v1.2.0'}));
      await ensureTag(plan);
      expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/git/refs'), expect.objectContaining({
        method: 'POST', body: JSON.stringify({ref: 'refs/tags/v1.2.0', sha: head}),
      }));
      expect(request.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not tag a registry version that remains invisible after publishing', async () => {
    const tag = vi.fn();
    await expect(publishAndTag(plan, {lookup: async () => null, publish: vi.fn(), tag, wait: vi.fn()})).rejects.toThrow('not visible');
    expect(tag).not.toHaveBeenCalled();
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
