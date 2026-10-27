import {cli, loadProject} from './project';
try {
  const {project} = cli();
  console.log(`Validating ${project}`);
  const {character, timeline} = await loadProject(project);
  console.log(`Valid: ${character.id}, ${character.parts.length} parts, ${timeline.duration * timeline.fps} frames`);
} catch (error) {console.error(String(error)); process.exitCode = 1;}
