import assert from 'node:assert/strict';
import {readFileSync, realpathSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {checkVideo} from './check-video.mjs';

assert.throws(() => readFileSync(`${process.argv[2]}/package.json`), {code: 'EPERM'});
console.log('Original checkout read denied by OS policy.');
for (const skill of ['animate', 'create-character', 'render-video']) {
  const file = `.agents/skills/${skill}/SKILL.md`;
  assert.match(readFileSync(file, 'utf8'), new RegExp(`^---\\nname: ${skill}\\n`));
  assert.ok(realpathSync(file).startsWith(realpathSync('.')));
}
assert.ok(readFileSync('.agents/skills/animate/references/timeline-spec.md', 'utf8').includes('Timeline v1.0'));
const cli = 'node_modules/.bin/animation-maker';
const run = (...args) => execFileSync(process.execPath, [cli, ...args], {stdio: 'inherit'});
run('doctor');
run('validate', '--project', './example');
run('render', '--project', './example', '--output', './wave.mp4');
checkVideo('wave.mp4');
const originalVideo = readFileSync('wave.mp4');
const overwrite = spawnSync(process.execPath, [cli, 'render', '--project', './example', '--output', './wave.mp4'], {encoding: 'utf8'});
assert.equal(overwrite.status, 1);
assert.match(overwrite.stderr, /Output already exists/);
assert.deepEqual(readFileSync('wave.mp4'), originalVideo);
console.log('Standalone PASS: three installed Skills, CLI, doctor, validation, render, metadata, pixels and overwrite protection; checkout unavailable.');
