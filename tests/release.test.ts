import {describe, expect, it, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
// @ts-expect-error Release tooling is dependency-free JavaScript, also used before npm ci.
import {latestVersion, nextVersion, resolvePlan, registryJSON, publishAndTag, verifyReleaseBase} from '../scripts/release.mjs';
// @ts-expect-error Security tooling is dependency-free JavaScript.
import {rejectLocalPaths, verifyManifests} from '../scripts/security-gate.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const runtime = (message: string) => ({message, files: ['scripts/render.ts']});
const metadata = {name: '@gasnonthachai/animation-maker', version: '1.2.0', gitHead: head, dist: {integrity: 'sha512-tested'}};
const plan = {name: metadata.name, version: metadata.version, head, integrity: metadata.dist.integrity, action: 'publish'};

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

describe('publish verification and recovery (mocked, no publication)', () => {
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
