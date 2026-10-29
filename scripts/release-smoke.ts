import {execFileSync} from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  checkSkill,
  checkInstalledRuntime,
  runtimeRange,
  // @ts-expect-error Shared standalone smoke checks are dependency-free JavaScript.
} from '../tests/check-skills.mjs';

const root = await realpath('.');
const {name} = JSON.parse(await readFile('package.json', 'utf8'));
const dir = await mkdtemp(path.join(tmpdir(), 'animation-release-'));
const cache = path.join(dir, '.npm-cache');
let stage = 'github-skills';
console.log(`Clean registry release project (no runtime or tarball): ${dir}`);
await mkdir('output', {recursive: true});
try {
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
      'Gas-nontachai/animation-maker-skills',
      '--agent',
      'codex',
      '--yes',
      '--copy',
    ],
    {cwd: dir, stdio: 'inherit'},
  );
  for (const skill of ['animate', 'create-character', 'render-video']) {
    const source = await readFile(
      path.join(dir, '.agents/skills', skill, 'SKILL.md'),
      'utf8',
    );
    checkSkill(source);
  }
  stage = 'registry-runtime';
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'animation-registry-test',
      private: true,
      type: 'module',
      overrides: {[name]: {zod: '4.6.7'}},
    }),
  );
  execFileSync(
    'npm',
    [
      'install',
      '--save-dev',
      `${name}@${runtimeRange}`,
      '--ignore-scripts',
      '--no-fund',
      '--cache',
      cache,
    ],
    {cwd: dir, stdio: 'inherit'},
  );
  const version = checkInstalledRuntime(dir);
  const installed = path.join(
    dir,
    'node_modules/@gasnonthachai/animation-maker',
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
  stage = 'standalone-browser-render';
  if (process.platform !== 'darwin')
    throw new Error(
      'Use equivalent checkout-denial isolation on this OS; current release harness requires macOS.',
    );
  const profile = `(version 1)(allow default)(deny file-read* (subpath ${JSON.stringify(root)}))`;
  execFileSync(
    'sandbox-exec',
    ['-p', profile, process.execPath, 'installed-package.mjs', root],
    {cwd: dir, stdio: 'inherit'},
  );
  await writeFile(
    'output/phase1.7-release-evidence.json',
    JSON.stringify(
      {
        result: 'PASS',
        project: dir,
        runtime: `${name}@${version}`,
        source: 'GitHub Skills + npm registry only',
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  await writeFile(
    'output/phase1.7-release-evidence.json',
    JSON.stringify(
      {result: 'FAIL', stage, project: dir, error: String(error)},
      null,
      2,
    ) + '\n',
  );
  console.error(String(error));
  process.exitCode = 1;
}
