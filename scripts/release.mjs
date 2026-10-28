import assert from 'node:assert/strict';
import {appendFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const registry = 'https://registry.npmjs.org';
export const packageName = '@gasnonthachai/animation-maker';
const repository = 'Gas-nontachai/animation-maker-skills';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const shaPattern = /^[a-f0-9]{40}$/;
const integrityPattern = /^sha512-[A-Za-z0-9+/]{86}==$/;
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();
const missingBaseline = 'Missing published release baseline: npm has neither gitHead nor a matching tag. ' +
  'Do not guess a commit. For an external initial release, authorize NPM_BOOTSTRAP_RECOVERY with ' +
  '{repository, version, commit, integrity}; the unchanged source must reproduce the full npm SHA-512. ' +
  'See docs/release-pipeline.md. If the original source cannot be verified, recovery is blocked.';

function verifyRebaselineAuthorization(authorization, head) {
  assert.match(authorization?.commit || '', shaPattern, 'Rebaseline requires an explicit full prod commit');
  assert.deepEqual(authorization, {
    repository, existingVersion: '1.1.0', targetVersion: '1.1.1', commit: head,
  }, 'Rebaseline requires exact repository, versions and current prod commit authorization');
}

function verifyBootstrapEvidence(evidence, version, metadata) {
  assert.ok(evidence, missingBaseline);
  assert.equal(evidence.repository, repository, 'Bootstrap repository mismatch');
  assert.equal(evidence.version, version, 'Bootstrap version mismatch');
  assert.match(evidence.commit || '', shaPattern, 'Bootstrap requires an explicit full source commit');
  assert.match(evidence.integrity || '', integrityPattern, 'Bootstrap requires a complete SHA-512 integrity');
  assert.equal(evidence.integrity, metadata.dist?.integrity, 'Bootstrap registry artifact integrity mismatch');
  if (metadata.gitHead !== undefined) assert.equal(metadata.gitHead, evidence.commit, 'Bootstrap gitHead conflict');
}

export async function verifyBootstrapRecovery(plan, metadata, cwd = process.cwd()) {
  assert.equal(plan.action, 'recover', 'Bootstrap is recovery only, never a publish');
  assert.ok(process.env.NPM_BOOTSTRAP_RECOVERY, 'Bootstrap requires explicit NPM_BOOTSTRAP_RECOVERY authorization');
  const authorized = JSON.parse(process.env.NPM_BOOTSTRAP_RECOVERY);
  assert.deepEqual(plan.bootstrap, authorized, 'Bootstrap authorization changed since planning');
  verifyBootstrapEvidence(authorized, plan.version, metadata);
  assert.equal(plan.name, packageName);
  assert.equal(metadata.name, packageName, 'Bootstrap registry package mismatch');
  assert.equal(metadata.version, plan.version, 'Bootstrap registry version mismatch');
  assert.equal(plan.head, authorized.commit, 'Bootstrap source commit mismatch');
  assert.equal(plan.integrity, authorized.integrity, 'Bootstrap plan integrity mismatch');
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', authorized.commit, 'HEAD'], {cwd, encoding: 'utf8'});
  if (ancestor.error) throw ancestor.error;
  assert.equal(ancestor.status, 0,
    `Bootstrap source must exist in this repository's prod history and be an ancestor of the checkout; verify the original commit and fetch full history. ${ancestor.stderr.trim()}`);

  const dir = await mkdtemp(resolve(tmpdir(), 'animation-bootstrap-'));
  try {
    const source = resolve(dir, 'source');
    await mkdir(source);
    const archive = execFileSync('git', ['archive', '--format=tar', authorized.commit], {cwd, maxBuffer: 64 * 1024 * 1024});
    execFileSync('tar', ['-xf', '-', '-C', source], {input: archive, stdio: ['pipe', 'pipe', 'pipe']});
    const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
    assert.equal(manifest.name, packageName, 'Bootstrap source package mismatch');
    assert.equal(manifest.version, plan.version, 'Bootstrap source version mismatch; source must pack unchanged');
    // No hooks, installs, builds, or manifest edits: only bytes from the authorized commit.
    execFileSync('npm', ['pack', '--ignore-scripts', '--offline', '--workspaces=false', '--pack-destination', dir, '--cache', resolve(dir, 'cache')], {cwd: source, stdio: 'pipe'});
    const tarball = await readFile(resolve(dir, `gasnonthachai-animation-maker-${plan.version}.tgz`));
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
    assert.equal(integrity, authorized.integrity,
      'Bootstrap source artifact integrity mismatch: unchanged source does not reproduce npm. Obtain the original source/toolchain; do not substitute a CI artifact or guess a baseline');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

export function parts(version) {
  assert.match(version, versionPattern, 'Only stable semantic versions are released');
  const result = version.split('.').map(Number);
  assert.ok(result.every(Number.isSafeInteger), 'Version exceeds safe integer range');
  return result;
}

export function latestVersion(versions) {
  return Object.keys(versions).filter(v => versionPattern.test(v)).sort((a, b) => {
    const x = parts(a), y = parts(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  }).at(-1);
}

export function runtimeFile(file) {
  return /^(bin|packages|renderer|examples)\//.test(file) ||
    file.startsWith('scripts/') && !/^scripts\/(release\.mjs|security-gate\.mjs|package-smoke\.ts|release-smoke\.ts|smoke\.ts)$/.test(file) ||
    ['package.json', 'package-lock.json', 'tsconfig.json'].includes(file);
}

export function nextVersion(current, commits) {
  const messages = commits.filter(c => c.files.some(runtimeFile)).map(c => c.message);
  if (!messages.length) return null;
  const breaking = messages.some(m => /^[\w-]+(?:\([^\r\n)]*\))?!:/.test(m) || /^BREAKING[ -]CHANGE:/m.test(m));
  const feature = messages.some(m => /^feat(?:\([^\r\n)]*\))?:/.test(m));
  const [major, minor, patch] = parts(current);
  return breaking ? `${major + 1}.0.0` : feature ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

export function resolvePlan({head, initialVersion, versions, tags, commits, bootstrap, rebaseline}) {
  assert.match(head, shaPattern);
  const latest = latestVersion(versions);
  const common = {name: packageName, head};
  if (rebaseline && !versions['1.1.1']) {
    verifyRebaselineAuthorization(rebaseline, head);
    assert.ok(!bootstrap, 'Rebaseline cannot be combined with bootstrap recovery');
    assert.equal(latest, '1.1.0', 'Rebaseline requires 1.1.0 as the only stable registry release');
    assert.equal(Object.keys(versions).filter(v => versionPattern.test(v)).length, 1, 'Rebaseline requires only one stable registry release');
    assert.equal(versions['1.1.0'].name, packageName, 'Rebaseline registry package mismatch');
    assert.equal(versions['1.1.0'].version, '1.1.0', 'Rebaseline registry version mismatch');
    assert.ok(!versions['1.1.0'].gitHead && !tags['v1.1.0'], 'Rebaseline is only for the unverified legacy release');
    assert.ok(!tags['v1.1.1'], 'Rebaseline target tag already exists');
    return {...common, action: 'rebaseline', version: '1.1.1', baseline: null, previousVersion: '1.1.0', rebaseline};
  }
  if (latest) {
    const published = versions[latest];
    const tagged = tags[`v${latest}`];
    let baseline = published.gitHead || tagged;
    if (!baseline || bootstrap?.version === latest) {
      verifyBootstrapEvidence(bootstrap, latest, published);
      assert.equal(Object.keys(versions).filter(v => versionPattern.test(v)).length, 1, 'Bootstrap is only for the initial stable release');
      if (baseline) assert.equal(bootstrap.commit, baseline, 'Bootstrap conflicts with the published baseline');
      else baseline = bootstrap.commit;
    }
    assert.match(baseline, shaPattern, missingBaseline);
    if (tagged) assert.equal(tagged, baseline, 'Published release tag points to a different commit');
    if (!tagged) {
      assert.ok(published.dist?.integrity, 'Recovery requires the published artifact integrity');
      return {...common, action: 'recover', version: latest, head: baseline, integrity: published.dist.integrity,
        ...(!published.gitHead ? {bootstrap} : {})};
    }
    const version = nextVersion(latest, commits);
    if (!version) return {...common, action: 'skip', reason: 'No runtime changes since the published release', baseline};
    assert.ok(!versions[version] && !tags[`v${version}`], 'Release version already exists');
    return {...common, action: 'publish', version, baseline, previousVersion: latest};
  }
  parts(initialVersion);
  if (!commits.some(c => c.files.some(runtimeFile))) return {...common, action: 'skip', reason: 'No runtime changes for first release'};
  assert.ok(!tags[`v${initialVersion}`], 'First release tag already exists without a registry release');
  return {...common, action: 'publish', version: initialVersion, baseline: null, previousVersion: null};
}

export function verifyReleaseBase(plan, versions) {
  assert.equal(latestVersion(versions) || null, plan.previousVersion, 'Registry advanced since planning; rerun all release jobs');
}

export async function registryJSON(path, request = fetch) {
  const response = await request(`${registry}/${path}`, {headers: {'cache-control': 'no-cache'}, signal: AbortSignal.timeout(20000)});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry HTTP ${response.status}; refusing to guess release state`);
  return response.json();
}

export async function verifyPublished(plan, metadata) {
  assert.ok(metadata, 'Published version is not visible in the registry');
  assert.equal(metadata.name, plan.name, 'Registry package mismatch');
  assert.equal(metadata.version, plan.version, 'Registry version mismatch');
  assert.equal(metadata.dist?.integrity, plan.integrity, 'Registry artifact integrity mismatch');
  if (plan.bootstrap) await verifyBootstrapRecovery(plan, metadata);
  else assert.equal(metadata.gitHead, plan.head, 'Registry gitHead mismatch');
}

export async function publishAndTag(plan, {lookup, publish, tag, wait}) {
  const existing = await lookup();
  if (existing) await verifyPublished(plan, existing);
  else {
    assert.ok(['publish', 'rebaseline'].includes(plan.action), 'Cannot recover a version absent from npm');
    await publish();
  }
  // Registry propagation can lag a successful npm publish; never tag an unverified artifact.
  for (let attempt = 0; attempt < 6; attempt++) {
    const metadata = await lookup();
    if (metadata) {
      await verifyPublished(plan, metadata);
      await tag();
      return;
    }
    await wait();
  }
  throw new Error('Published version not visible after retries; rerun the workflow to recover, do not bump manually');
}

async function planRelease() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.name, packageName);
  const packument = await registryJSON(encodeURIComponent(packageName));
  if (packument) assert.equal(packument.name, packageName);
  const versions = packument?.versions || {};
  if (packument) assert.ok(latestVersion(versions), 'Registry package exists but has no stable release; review manually');
  const tags = Object.fromEntries(git('tag', '--list', 'v*').split('\n').filter(t => versionPattern.test(t.slice(1))).map(t => [t, git('rev-parse', `${t}^{commit}`)]));
  const latest = latestVersion(versions);
  const bootstrap = process.env.NPM_BOOTSTRAP_RECOVERY ? JSON.parse(process.env.NPM_BOOTSTRAP_RECOVERY) : undefined;
  const rebaseline = process.env.NPM_RELEASE_REBASELINE ? JSON.parse(process.env.NPM_RELEASE_REBASELINE) : undefined;
  const input = {head: git('rev-parse', 'HEAD'), initialVersion: manifest.version, versions, tags, commits: [], bootstrap, rebaseline};
  const preliminary = resolvePlan(input);
  const baseline = preliminary.action === 'recover' ? preliminary.head : preliminary.baseline;
  if (preliminary.bootstrap) await verifyBootstrapRecovery(preliminary, versions[latest]);
  else if (baseline) {
    git('merge-base', '--is-ancestor', baseline, 'HEAD');
  }
  const commits = ['recover', 'rebaseline'].includes(preliminary.action) ? [] : git('log', '--format=%H', ...(baseline ? [`${baseline}..HEAD`] : ['HEAD'])).split('\n').filter(Boolean).map(sha => ({
    message: git('show', '-s', '--format=%B', sha),
    files: git('diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', sha).split('\n'),
  }));
  const plan = resolvePlan({...input, commits});
  await mkdir('output', {recursive: true});
  await writeFile('output/release-plan.json', JSON.stringify(plan, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `action=${plan.action}\nversion=${plan.version || ''}\n`);
  console.log(JSON.stringify(plan, null, 2));
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {...options, headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...options.headers,
  }, signal: AbortSignal.timeout(20000)});
  if (response.status === 404 && !options.method) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status} for ${path}; rerun release recovery`);
  return response.json();
}

export async function ensureTag(plan) {
  const ref = `tags/v${plan.version}`;
  const existing = await github(`git/ref/${ref}`);
  if (existing) {
    let object = existing.object;
    for (let depth = 0; object.type === 'tag' && depth < 10; depth++) object = (await github(`git/tags/${object.sha}`)).object;
    assert.equal(object.type, 'commit');
    assert.equal(object.sha, plan.head, 'Existing release tag targets another commit');
    return;
  }
  await github('git/refs', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ref: `refs/${ref}`, sha: plan.head})});
}

export async function finishRelease() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Publishing is GitHub Actions only');
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/prod', 'Only prod may release');
  assert.equal(process.env.RELEASE_AUTHORIZED, 'true', 'Explicit release enablement and protected environment approval required');
  assert.ok(!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN, 'Do not use npm token secrets');
  const plan = JSON.parse(await readFile('output/release-plan.json', 'utf8'));
  assert.equal(plan.name, packageName);
  parts(plan.version);
  assert.match(plan.head, shaPattern);
  assert.ok(['publish', 'recover', 'rebaseline'].includes(plan.action));
  if (plan.bootstrap) assert.equal(plan.action, 'recover', 'Bootstrap is recovery only, never a publish');
  const current = git('rev-parse', 'HEAD');
  git('merge-base', '--is-ancestor', plan.head, current);
  if (['publish', 'rebaseline'].includes(plan.action)) assert.equal(plan.head, current);
  if (plan.action === 'rebaseline') {
    assert.ok(process.env.NPM_RELEASE_REBASELINE, 'Rebaseline requires explicit NPM_RELEASE_REBASELINE authorization');
    assert.deepEqual(plan.rebaseline, JSON.parse(process.env.NPM_RELEASE_REBASELINE), 'Rebaseline authorization changed since planning');
    verifyRebaselineAuthorization(plan.rebaseline, current);
    assert.equal(plan.version, plan.rebaseline.targetVersion, 'Rebaseline target version mismatch');
    assert.equal(plan.previousVersion, plan.rebaseline.existingVersion, 'Rebaseline existing version mismatch');
  }
  await publishAndTag(plan, {
    lookup: () => registryJSON(`${encodeURIComponent(plan.name)}/${plan.version}`),
    publish: async () => {
      const fresh = await registryJSON(encodeURIComponent(plan.name));
      verifyReleaseBase(plan, fresh?.versions || {});
      if (plan.action === 'rebaseline') {
        resolvePlan({head: current, versions: fresh.versions, tags: {}, rebaseline: plan.rebaseline});
      }
      const npmVersion = parts(execFileSync('npm', ['--version'], {encoding: 'utf8'}).trim());
      assert.ok(npmVersion[0] > 11 || (npmVersion[0] === 11 && (npmVersion[1] > 5 || npmVersion[1] === 5 && npmVersion[2] >= 1)), 'OIDC requires npm >=11.5.1');
      assert.equal(plan.tarball, `output/gasnonthachai-animation-maker-${plan.version}.tgz`);
      const integrity = `sha512-${createHash('sha512').update(await readFile(plan.tarball)).digest('base64')}`;
      assert.equal(integrity, plan.integrity, 'Tested tarball was changed before publishing');
      execFileSync('npm', ['publish', resolve(plan.tarball), '--access', 'public', '--provenance', '--ignore-scripts', '--registry', registry], {stdio: 'inherit'});
    },
    tag: () => ensureTag(plan),
    wait: () => new Promise(resolve => setTimeout(resolve, 5000)),
  });
}

async function attachArtifact() {
  const plan = JSON.parse(await readFile('output/release-plan.json', 'utf8'));
  const evidence = JSON.parse(await readFile('output/phase1.7-package-evidence.json', 'utf8'));
  assert.ok(['publish', 'rebaseline'].includes(plan.action));
  assert.equal(evidence.result, 'PASS');
  assert.equal(evidence.vulnerabilities.total, 0);
  assert.equal(evidence.package, `gasnonthachai-animation-maker-${plan.version}.tgz`);
  plan.tarball = `output/${evidence.package}`;
  plan.integrity = evidence.integrity;
  await writeFile('output/release-plan.json', JSON.stringify(plan, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    assert.ok(['plan', 'artifact', 'finish'].includes(command), 'Usage: release.mjs <plan|artifact|finish>');
    await ({plan: planRelease, artifact: attachArtifact, finish: finishRelease})[command]();
  } catch (error) {console.error(error); process.exitCode = 1;}
}
