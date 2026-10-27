import {createServer} from 'node:net';
import {ensureBrowser} from '@remotion/renderer';

export async function browser(browserExecutable?: string, download = false) {
  const status = await ensureBrowser({browserExecutable, onBrowserDownload: () => {
    if (!download) throw new Error('Chromium is not installed. With approval, run animation-maker doctor --download-browser, or pass --browser-executable <path>.');
    return {onProgress: () => {}, version: null};
  }});
  if (status.type === 'no-browser') throw new Error('Chromium setup failed');
  return status.path;
}

export async function checkBinding() {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(new Error(`Local server binding failed: ${error.message}. Request host permission for rendering; do not disable security controls.`)));
    server.listen(0, () => server.close(error => error ? reject(error) : resolve()));
  });
}
