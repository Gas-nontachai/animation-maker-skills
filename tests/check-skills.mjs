import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';

export const runtimeRange = '^1.1.1';

export function compatibleRuntime(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  return Boolean(match && match[1] === '1' && (Number(match[2]) > 1 || match[2] === '1' && Number(match[3]) >= 1));
}

export function checkSkill(source) {
  assert.ok(source.includes(`The compatible runtime is \`@gasnonthachai/animation-maker@${runtimeRange}\``), 'Skill runtime range mismatch');
  assert.ok(source.includes(`npm install --save-dev '@gasnonthachai/animation-maker@${runtimeRange}'`), 'Skill install range mismatch');
  assert.doesNotMatch(source, /--save-exact|release candidate|@gasnonthachai\/animation-maker@1\.1\.0/);
}

export function checkInstalledRuntime(directory) {
  const {version} = JSON.parse(readFileSync(path.join(directory, 'node_modules/@gasnonthachai/animation-maker/package.json'), 'utf8'));
  const cliVersion = execFileSync(process.execPath, [path.join(directory, 'node_modules/.bin/animation-maker'), '--version'], {encoding: 'utf8'}).trim();
  assert.equal(cliVersion, version, 'Installed manifest and CLI versions differ');
  assert.ok(compatibleRuntime(version), `Installed runtime ${version} does not satisfy ${runtimeRange}`);
  return version;
}
