import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ensureBrowser} from '@remotion/renderer';
import {browser} from '../scripts/environment';

vi.mock('@remotion/renderer', () => ({ensureBrowser: vi.fn()}));
const ensure = vi.mocked(ensureBrowser);
const dirs: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})),
  );
});

async function executable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'animation-browser-test-'));
  dirs.push(dir);
  const file = path.join(dir, 'chromium');
  await writeFile(file, 'test fixture');
  await chmod(file, 0o755);
  return file;
}

describe('Chromium bootstrap', () => {
  it('blocks a missing browser download unless explicitly requested', async () => {
    ensure.mockImplementation(async (options) => {
      options!.onBrowserDownload!({chromeMode: 'headless-shell'});
      throw new Error('download should have been blocked');
    });
    await expect(browser()).rejects.toThrow('Chromium is not installed');
    await expect(browser()).rejects.toThrow('doctor --download-browser');
  });

  it('uses public default download/progress handling and returns the installed executable', async () => {
    const file = await executable();
    ensure.mockResolvedValue({type: 'local-puppeteer-browser', path: file});
    expect(await browser(undefined, true)).toBe(file);
    expect(ensure).toHaveBeenCalledWith({browserExecutable: undefined});
    expect(ensure.mock.calls[0][0]).not.toHaveProperty('onBrowserDownload');
  });

  it('resolves an existing executable without enabling downloads', async () => {
    const file = await executable();
    ensure.mockResolvedValue({type: 'user-defined-path', path: file});
    expect(await browser(file)).toBe(file);
    expect(ensure.mock.calls[0][0]?.onBrowserDownload).toBeTypeOf('function');
  });

  it('preserves download failure details and gives network/path remediation', async () => {
    const cause = new Error('ENOTFOUND storage.googleapis.com');
    ensure.mockRejectedValue(cause);
    await expect(browser(undefined, true)).rejects.toMatchObject({
      cause,
      message: expect.stringMatching(
        /ENOTFOUND.*network access.*--browser-executable/,
      ),
    });
  });

  it('explains incomplete-cache installation failures rather than reporting success', async () => {
    ensure.mockResolvedValue({type: 'no-browser'});
    await expect(browser(undefined, true)).rejects.toThrow(
      /incomplete.*cache.*doctor --download-browser/,
    );
  });

  it('reports an unresolved browser version mismatch rather than returning a missing path', async () => {
    ensure.mockResolvedValue({
      type: 'version-mismatch',
      actualVersion: '134.0.0.0',
    });
    await expect(browser(undefined, true)).rejects.toThrow(
      'no compatible executable',
    );
  });

  it('rejects a reported executable that is missing or a directory', async () => {
    const file = await executable();
    for (const invalid of [
      path.join(path.dirname(file), 'missing'),
      path.dirname(file),
    ]) {
      ensure.mockResolvedValue({type: 'user-defined-path', path: invalid});
      await expect(browser(invalid)).rejects.toThrow(
        'Chromium executable is not usable',
      );
    }
  });
});
