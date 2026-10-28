import {cli, loadProject} from './project';
try {
  const {project} = cli();
  console.log(`Validating ${project}`);
  const result = await loadProject(project);
  const {timeline} = result;
  console.log(`Valid: ${"scene" in result ? `${result.scene.objects.length} objects` : `${result.character.id}, ${result.character.parts.length} parts`}, ${timeline.duration * timeline.fps} frames`);
} catch (error) {console.error(String(error)); process.exitCode = 1;}
