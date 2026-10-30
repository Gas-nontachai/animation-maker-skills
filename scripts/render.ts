import {mkdir, mkdtemp, rm, link, access} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {cli, loadProject} from './project';
import {browser, checkBinding} from './environment';
let bundleDir: string | undefined;
let stagingDir: string | undefined;
try {
  const {project, output, browserExecutable: preferredBrowser} = cli(true);
  if (path.extname(output).toLowerCase() !== '.mp4')
    throw new Error('Output must end in .mp4');
  try {
    await access(output);
    throw new Error(`Output already exists: ${output}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  console.log(`Validating ${project}`);
  const inputProps = await loadProject(project);
  await checkBinding();
  const browserExecutable = await browser(preferredBrowser);
  console.log('Validation passed. Bundling renderer');
  bundleDir = await mkdtemp(path.join(tmpdir(), 'animation-bundle-'));
  const serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL('../renderer/src/index.ts', import.meta.url),
    ),
    outDir: bundleDir,
  });
  const composition = await selectComposition({
    serveUrl,
    id: 'Animation',
    inputProps,
    browserExecutable,
  });
  await mkdir(path.dirname(path.resolve(output)), {recursive: true});
  stagingDir = await mkdtemp(
    path.join(path.dirname(path.resolve(output)), '.animation-render-'),
  );
  const staged = path.join(stagingDir, 'video.mp4');
  console.log(
    `Rendering ${composition.durationInFrames} frames (${composition.width}×${composition.height}, ${composition.fps} FPS)`,
  );
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    outputLocation: staged,
    muted: true,
  });
  await link(staged, path.resolve(output));
  console.log(`Rendered ${output}`);
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
} finally {
  if (bundleDir) await rm(bundleDir, {recursive: true, force: true});
  if (stagingDir) await rm(stagingDir, {recursive: true, force: true});
}
