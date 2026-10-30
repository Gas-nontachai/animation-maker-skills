import {parseArgs} from 'node:util';
import {RenderInternals, openBrowser} from '@remotion/renderer';
import {browser, checkBinding} from './environment';

try {
  const {values} = parseArgs({
    options: {
      'browser-executable': {type: 'string'},
      'download-browser': {type: 'boolean'},
      '3d': {type: 'boolean'},
    },
    strict: true,
  });
  console.log(`Node ${process.version}; ${process.platform} ${process.arch}`);
  for (const bin of ['ffmpeg', 'ffprobe'] as const) {
    const result = await RenderInternals.callFf({
      bin,
      args: ['-version'],
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
      cancelSignal: undefined,
    });
    console.log(result.stdout.split('\n')[0]);
  }
  const browserExecutable = await browser(
    values['browser-executable'],
    values['download-browser'],
  );
  console.log(`Chromium: ${browserExecutable}`);
  await checkBinding();
  if (values['3d']) {
    await import('three');
    await import('@react-three/fiber');
    await import('@remotion/three');
    const chrome = await openBrowser('chrome', {browserExecutable});
    try {
      const page = await chrome.newPage({
        context: () => null,
        logLevel: 'error',
        indent: false,
        pageIndex: 0,
        onBrowserLog: null,
        onLog: () => {},
      });
      const webgl = await page.evaluate(() =>
        Boolean(document.createElement('canvas').getContext('webgl2')),
      );
      if (!webgl)
        throw new Error('3D rendering requires WebGL2 in the selected browser');
      console.log(
        '3D prerequisites passed: Three.js, React Three Fiber, @remotion/three and WebGL2.',
      );
    } finally {
      await chrome.close({silent: true});
    }
  }
  console.log(
    'Doctor passed: bundled binaries, Chromium and local server binding available. Rendering also requires browser process permission and OS libraries.',
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
