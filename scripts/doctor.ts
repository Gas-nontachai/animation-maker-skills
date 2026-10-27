import {parseArgs} from 'node:util';
import {RenderInternals} from '@remotion/renderer';
import {browser, checkBinding} from './environment';

try {
  const {values} = parseArgs({options: {'browser-executable': {type: 'string'}, 'download-browser': {type: 'boolean'}}, strict: true});
  console.log(`Node ${process.version}; ${process.platform} ${process.arch}`);
  for (const bin of ['ffmpeg', 'ffprobe'] as const) {
    const result = await RenderInternals.callFf({bin, args: ['-version'], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal: undefined});
    console.log(result.stdout.split('\n')[0]);
  }
  console.log(`Chromium: ${await browser(values['browser-executable'], values['download-browser'])}`);
  await checkBinding();
  console.log('Doctor passed: bundled binaries, Chromium and local server binding available. Rendering also requires browser process permission and OS libraries.');
} catch (error) {console.error(String(error)); process.exitCode = 1;}
