import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {loadProject, confined} from './project';
import {compileMotion} from '../packages/animation-runtime/src/motion';
const {values} = parseArgs({
  options: {project: {type: 'string'}, output: {type: 'string'}},
  strict: true,
});
if (!values.project || !values.output)
  throw new Error(
    'Usage: plan --project <directory> --output <new timeline.json path>',
  );
const project = await loadProject(values.project);
if (!('scene' in project))
  throw new Error('Motion planning requires an M2 scene project');
const input = JSON.parse(
  await readFile(
    await confined(path.resolve(values.project), 'motion.json'),
    'utf8',
  ),
);
const timeline = compileMotion(project.scene, project.rigs, input);
await mkdir(path.dirname(path.resolve(values.output)), {recursive: true});
await writeFile(values.output, JSON.stringify(timeline, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  `Compiled ${input.actions.length} actions to ${values.output}; sources preserved`,
);
