import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, realpath, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = await realpath('.');
if (process.platform !== 'darwin')
  throw new Error(
    'Checkout-denial test currently requires macOS sandbox-exec; run equivalent filesystem isolation on other platforms.',
  );
const dir = await mkdtemp(path.join(tmpdir(), 'animation-package-'));
console.log(`Standalone test project: ${dir}`);
const cache = path.join(dir, '.npm-cache');
await mkdir('output', {recursive: true});
const [packed] = JSON.parse(
  execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', 'output', '--cache', cache],
    {encoding: 'utf8'},
  ),
);
for (const required of [
  'bin/animation-maker.mjs',
  'renderer/src/index.ts',
  'packages/animation-runtime/src/schemas/index.ts',
  'scripts/environment.ts',
  'docs/asset-contract.md',
  'docs/m3-1-phase2.md',
  'packages/animation-runtime/src/motion/pose-contracts.ts',
]) {
  assert.ok(
    packed.files.some((file: {path: string}) => file.path === required),
    `Missing package file: ${required}`,
  );
}
await writeFile(
  path.join(dir, 'package.json'),
  JSON.stringify({
    name: 'standalone-animation-test',
    private: true,
    type: 'module',
    overrides: {'@gasnonthachai/animation-maker': {zod: '4.6.7'}},
  }),
);
execFileSync(
  'npm',
  [
    'install',
    '--save-dev',
    path.join(root, 'output', packed.filename),
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--cache',
    cache,
  ],
  {cwd: dir, stdio: 'inherit'},
);
const auditResult = spawnSync('npm', ['audit', '--json', '--cache', cache], {
  cwd: dir,
  encoding: 'utf8',
});
const audit = JSON.parse(auditResult.stdout);
await writeFile(
  'output/audit-consumer.json',
  JSON.stringify(audit, null, 2) + '\n',
);
assert.equal(
  auditResult.status,
  0,
  'Clean consumer audit returned a failure (see output/audit-consumer.json)',
);
assert.equal(
  audit.metadata.vulnerabilities.total,
  0,
  `Consumer audit: ${JSON.stringify(audit.metadata.vulnerabilities)}`,
);
const installed = path.join(dir, 'node_modules/@gasnonthachai/animation-maker');
assert.ok(!(await realpath(installed)).startsWith(root + path.sep));
const cli = path.join(dir, 'node_modules/.bin/animation-maker');
const missing = spawnSync(process.execPath, [cli, 'doctor'], {
  cwd: dir,
  encoding: 'utf8',
});
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /Chromium is not installed/);
console.log(
  'Clean installation: doctor reports missing Chromium without downloading it.',
);
execFileSync(
  'npm',
  [
    'exec',
    '--yes',
    '--package=skills@1.7.4',
    '--cache',
    cache,
    '--',
    'skills',
    'add',
    installed,
    '--agent',
    'codex',
    '--yes',
    '--copy',
  ],
  {cwd: dir, stdio: 'inherit'},
);
await cp(
  path.join(installed, 'examples/waving-character'),
  path.join(dir, 'example'),
  {recursive: true},
);
await cp('tests/check-video.mjs', path.join(dir, 'check-video.mjs'));
await cp(
  'tests/installed-package.mjs',
  path.join(dir, 'installed-package.mjs'),
);
await cp('tests/check-skills.mjs', path.join(dir, 'check-skills.mjs'));
const profile = `(version 1)(allow default)(deny file-read* (subpath ${JSON.stringify(root)}))`;
const env = {...process.env};
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
execFileSync(
  'sandbox-exec',
  ['-p', profile, process.execPath, 'installed-package.mjs', root],
  {cwd: dir, env, stdio: 'inherit'},
);
await cp(path.join(dir, 'wave.mp4'), 'output/wave-standalone.mp4');
await cp(path.join(dir, 'generated-wave.mp4'), 'output/wave-generated.mp4');
await cp(path.join(dir, 'generated-wave'), 'output/generated-wave', {
  recursive: true,
});
const evidence = {
  package: packed.filename,
  integrity: packed.integrity,
  isolatedProject: dir,
  checkoutDenied: true,
  skills: ['animate', 'create-character', 'render-video'],
  distribution: 'local tarball pre-release test; not npm registry release',
  vulnerabilities: audit.metadata.vulnerabilities,
  result: 'PASS',
};
await writeFile(
  'output/phase1.7-package-evidence.json',
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(
  `Package test PASS. Evidence: output/phase1.7-package-evidence.json; video: output/wave-standalone.mp4. Temporary project retained at ${dir}`,
);
