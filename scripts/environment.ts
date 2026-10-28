import {createServer} from 'node:net';
import {access, stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {ensureBrowser} from '@remotion/renderer';

export async function browser(browserExecutable?: string, download = false) {
  let status: Awaited<ReturnType<typeof ensureBrowser>>;
  try {
    status = await ensureBrowser({browserExecutable, ...(download ? {} : {onBrowserDownload: () => {
      throw new Error('Chromium is not installed. With approval, run animation-maker doctor --download-browser, or pass --browser-executable <path>.');
    }})});
  } catch (error) {
    throw new Error(`Chromium ${download ? 'installation' : 'resolution'} failed: ${(error as Error).message}. Check the browser path and cache permissions${download ? ', and network access for the download' : ''}; alternatively pass --browser-executable <path> to an installed Chromium.`, {cause: error});
  }
  if (status.type === 'no-browser' || status.type === 'version-mismatch') throw new Error('Chromium installation produced no compatible executable. An incomplete Remotion browser cache may be present: move aside this project\'s node_modules/.remotion/chrome-headless-shell cache, then retry animation-maker doctor --download-browser with approval. Alternatively pass --browser-executable <path>.');
  try {
    if (!(await stat(status.path)).isFile()) throw new Error('path is not a file');
    await access(status.path, constants.X_OK);
  } catch (error) {
    throw new Error(`Chromium executable is not usable at ${status.path}: ${(error as Error).message}. Check file permissions or pass --browser-executable <path> to an executable Chromium.`, {cause: error});
  }
  return status.path;
}

export async function checkBinding() {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(new Error(`Local server binding failed: ${error.message}. Request host permission for rendering; do not disable security controls.`)));
    server.listen(0, () => server.close(error => error ? reject(error) : resolve()));
  });
}
