import {cli} from './project';
import {createWave} from './wave';

try {
  const {project} = cli();
  await createWave(project);
  console.log(`Created ${project}: new SVG robot, rig and 3-second wave timeline. Source assets preserved.`);
} catch (error) {console.error(String(error)); process.exitCode = 1;}
