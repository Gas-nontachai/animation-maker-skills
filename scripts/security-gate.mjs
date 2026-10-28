import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function rejectLocalPaths(value) {
  if (typeof value === 'string') assert.ok(!/^(?:(?:git\+)?file:|link:|workspace:|\/|~[\\/]|[a-z]:[\\/]|\\\\)/i.test(value), `Local dependency/path rejected: ${value}`);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) rejectLocalPaths(child);
}

export function verifyManifests(manifest, lock) {
  assert.equal(manifest.name, '@gasnonthachai/animation-maker');
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].name, manifest.name);
  assert.equal(lock.packages[''].version, manifest.version);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides']) rejectLocalPaths(manifest[section]);
  for (const field of ['bin', 'main', 'types', 'files', 'exports']) rejectLocalPaths(manifest[field]);
  assert.ok(!/(?:\/Users\/|\/home\/[^/]+\/|[a-z]:\\Users\\|\/private\/var\/folders\/)/i.test(JSON.stringify(manifest)), 'Machine-specific path in package manifest');
  for (const [location, item] of Object.entries(lock.packages)) {
    rejectLocalPaths(location);
    assert.ok(!item.link, 'Linked package in lockfile');
    rejectLocalPaths(item.resolved);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) rejectLocalPaths(item[section]);
  }
}

async function checkManifests() {
  verifyManifests(JSON.parse(await readFile('package.json', 'utf8')), JSON.parse(await readFile('package-lock.json', 'utf8')));
}

export async function securityGate() {
  await checkManifests();
  await mkdir('output', {recursive: true});
  const failures = [];
  for (const [name, args] of [['production', ['--omit=dev']], ['full', []]]) {
    const result = spawnSync('npm', ['audit', '--json', ...args], {encoding: 'utf8'});
    await writeFile(`output/audit-ci-${name}.json`, result.stdout || result.stderr || String(result.error));
    console.log(result.stdout || result.stderr || result.error);
    let audit;
    try {audit = JSON.parse(result.stdout);} catch {failures.push(`${name}: audit did not return JSON`); continue;}
    if (result.status !== 0 || audit.error || audit.metadata?.vulnerabilities?.total !== 0) failures.push(`${name}: audit failed or vulnerabilities remain`);
  }
  assert.equal(failures.length, 0, failures.join('; '));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(!process.argv[2] || process.argv[2] === 'manifest', 'Usage: security-gate.mjs [manifest]');
    if (process.argv[2] === 'manifest') await checkManifests();
    else await securityGate();
  } catch (error) {console.error(error); process.exitCode = 1;}
}
