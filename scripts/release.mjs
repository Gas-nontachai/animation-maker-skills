import assert from 'node:assert/strict';
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const registry = 'https://registry.npmjs.org';
export const packageName = '@gasnonthachai/animation-maker';
const repository = 'Gas-nontachai/animation-maker-skills';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const shaPattern = /^[a-f0-9]{40}$/;
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();

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

export function resolvePlan({head, initialVersion, versions, tags, commits}) {
  assert.match(head, shaPattern);
  const latest = latestVersion(versions);
  const common = {name: packageName, head};
  if (latest) {
    const published = versions[latest];
    const tagged = tags[`v${latest}`];
    const baseline = published.gitHead;
    assert.match(baseline || '', shaPattern, 'Missing or invalid published gitHead baseline; review release provenance manually');
    if (tagged) assert.equal(tagged, baseline, 'Published release tag points to a different commit');
    if (!tagged) {
      assert.ok(published.dist?.integrity, 'Recovery requires the published artifact integrity');
      return {...common, action: 'recover', version: latest, head: baseline, integrity: published.dist.integrity};
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

export async function registryJSON(path, request = fetch, timeout = 20000) {
  const response = await request(`${registry}/${path}`, {headers: {'cache-control': 'no-cache'}, signal: AbortSignal.timeout(timeout)});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry HTTP ${response.status}; refusing to guess release state`);
  return response.json();
}

export async function verifyPublished(plan, metadata) {
  assert.ok(metadata, 'Published version is not visible in the registry');
  assert.equal(metadata.name, plan.name, 'Registry package mismatch');
  assert.equal(metadata.version, plan.version, 'Registry version mismatch');
  assert.ok(plan.integrity, 'Release plan is missing artifact integrity');
  assert.equal(metadata.dist?.integrity, plan.integrity, 'Registry artifact integrity mismatch');
  assert.equal(metadata.gitHead, plan.head, 'Registry gitHead mismatch');
}

export async function publishAndTag(plan, {lookup, publish, tag, wait = sleep, now = () => performance.now()}) {
  const existing = await lookup();
  if (existing) await verifyPublished(plan, existing);
  else {
    assert.equal(plan.action, 'publish', 'Cannot recover a version absent from npm');
    await publish();
  }
  // Registry propagation can lag a successful npm publish; never tag an unverified artifact.
  const deadline = now() + 8 * 60 * 1000;
  let delay = 5000;
  while (now() < deadline) {
    const metadata = await lookup(Math.max(1, Math.ceil(Math.min(20000, deadline - now()))));
    if (metadata) {
      await verifyPublished(plan, metadata);
      await tag();
      return;
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await wait(Math.min(delay, remaining));
    delay = Math.min(delay * 2, 30000);
  }
  throw new Error('Published version not visible within 8 minutes; rerun all workflow jobs to recover, do not bump manually');
}

async function planRelease() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.name, packageName);
  const packument = await registryJSON(encodeURIComponent(packageName));
  if (packument) assert.equal(packument.name, packageName);
  const versions = packument?.versions || {};
  if (packument) assert.ok(latestVersion(versions), 'Registry package exists but has no stable release; review manually');
  const tags = Object.fromEntries(git('tag', '--list', 'v*').split('\n').filter(t => versionPattern.test(t.slice(1))).map(t => [t, git('rev-parse', `${t}^{commit}`)]));
  const input = {head: git('rev-parse', 'HEAD'), initialVersion: manifest.version, versions, tags, commits: []};
  const preliminary = resolvePlan(input);
  const baseline = preliminary.action === 'recover' ? preliminary.head : preliminary.baseline;
  if (baseline) {
    git('merge-base', '--is-ancestor', baseline, 'HEAD');
  }
  const commits = preliminary.action === 'recover' ? [] : git('log', '--format=%H', ...(baseline ? [`${baseline}..HEAD`] : ['HEAD'])).split('\n').filter(Boolean).map(sha => ({
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
  assert.ok(['publish', 'recover'].includes(plan.action));
  const current = git('rev-parse', 'HEAD');
  git('merge-base', '--is-ancestor', plan.head, current);
  if (plan.action === 'publish') assert.equal(plan.head, current);
  await publishAndTag(plan, {
    lookup: timeout => registryJSON(`${encodeURIComponent(plan.name)}/${plan.version}`, fetch, timeout),
    publish: async () => {
      const fresh = await registryJSON(encodeURIComponent(plan.name));
      verifyReleaseBase(plan, fresh?.versions || {});
      const npmVersion = parts(execFileSync('npm', ['--version'], {encoding: 'utf8'}).trim());
      assert.ok(npmVersion[0] > 11 || (npmVersion[0] === 11 && (npmVersion[1] > 5 || npmVersion[1] === 5 && npmVersion[2] >= 1)), 'OIDC requires npm >=11.5.1');
      assert.equal(plan.tarball, `output/gasnonthachai-animation-maker-${plan.version}.tgz`);
      const integrity = `sha512-${createHash('sha512').update(await readFile(plan.tarball)).digest('base64')}`;
      assert.equal(integrity, plan.integrity, 'Tested tarball was changed before publishing');
      execFileSync('npm', ['publish', resolve(plan.tarball), '--access', 'public', '--provenance', '--ignore-scripts', '--registry', registry], {stdio: 'inherit'});
    },
    tag: () => ensureTag(plan),
  });
}

async function attachArtifact() {
  const plan = JSON.parse(await readFile('output/release-plan.json', 'utf8'));
  const evidence = JSON.parse(await readFile('output/phase1.7-package-evidence.json', 'utf8'));
  assert.equal(plan.action, 'publish');
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
