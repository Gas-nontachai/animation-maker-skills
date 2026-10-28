import {afterEach, describe, expect, it, vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-expect-error Shared standalone smoke checks are dependency-free JavaScript.
import {checkSkill, checkInstalledRuntime, compatibleRuntime} from './check-skills.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {...actual, execFileSync: vi.fn(actual.execFileSync)};
});

const directories: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(directories.splice(0).map(directory => rm(directory, {recursive: true, force: true})));
});

describe('Skills runtime compatibility', () => {
  it.each(['animate', 'create-character', 'render-video'])('%s uses the shared range and preserves setup safeguards', async skill => {
    const source = await readFile(`skills/${skill}/SKILL.md`, 'utf8');
    expect(() => checkSkill(source)).not.toThrow();
    expect(source).toContain('`>=1.1.1 <2.0.0`, excluding prereleases');
    expect(source).toContain('Both must report the same version');
    expect(source).toContain('Reuse a compatible installation without reinstalling, upgrading, querying npm or changing package.json/package-lock.json');
    expect(source).toContain('Request permission to run');
    expect(source).toContain('"@gasnonthachai/animation-maker": {"zod": "4.6.7"}');
    expect(source).toContain('report the conflict for review rather than overwriting it');
    expect(source).toContain('Preserve the project lockfile');
    expect(source).toContain('run `npm audit` afterward');
    expect(source).toContain('npx --no-install animation-maker');
    expect(source).toMatch(/browser.*(?:approved|approval|permissions)/);
  });

  it.each([
    ['1.1.0', false], ['1.1.1', true], ['1.1.2', true], ['1.2.0', true], ['1.10.0', true], ['2.0.0', false],
    ['1.0.99', false], ['0.9.9', false], ['10.0.0', false],
    ['1.1.1-beta.1', false], ['1.2.0-rc.1', false], ['2.0.0-beta.1', false],
    ['1.1.1+build.123', true], ['1.01.1', false], ['1.1', false], ['garbage', false],
  ])('checks SemVer %s: %s', (version, expected) => {
    expect(compatibleRuntime(version)).toBe(expected);
  });

  it.each(['1.1.0', '1.1.1', '1.1.2', '1.2.0', '2.0.0'])('checks an installed %s without modifying or reinstalling it', async version => {
    const directory = await mkdtemp(path.join(tmpdir(), 'animation-skills-test-'));
    directories.push(directory);
    await mkdir(path.join(directory, 'node_modules/@gasnonthachai/animation-maker'), {recursive: true});
    await mkdir(path.join(directory, 'node_modules/.bin'), {recursive: true});
    const files = {
      'package.json': JSON.stringify({private: true, devDependencies: {'@gasnonthachai/animation-maker': '^1.1.1'}, overrides: {'@gasnonthachai/animation-maker': {zod: '4.6.7'}}}),
      'package-lock.json': JSON.stringify({lockfileVersion: 3, packages: {'node_modules/@gasnonthachai/animation-maker': {version}}}),
      'node_modules/@gasnonthachai/animation-maker/package.json': JSON.stringify({version}),
      'node_modules/.bin/animation-maker': `console.log(${JSON.stringify(version)});\n`,
    };
    for (const [file, contents] of Object.entries(files)) await writeFile(path.join(directory, file), contents);
    if (['1.1.0', '2.0.0'].includes(version)) {
      expect(() => checkInstalledRuntime(directory)).toThrow('does not satisfy ^1.1.1');
    } else {
      expect(checkInstalledRuntime(directory)).toBe(version);
      expect(checkInstalledRuntime(directory)).toBe(version);
    }
    expect(vi.mocked(execFileSync).mock.calls.every(([command, args]) =>
      command === process.execPath && args?.[1] === '--version')).toBe(true);
    for (const [file, contents] of Object.entries(files)) expect(await readFile(path.join(directory, file), 'utf8')).toBe(contents);
    await writeFile(path.join(directory, 'node_modules/.bin/animation-maker'), 'console.log("1.2.1");\n');
    expect(() => checkInstalledRuntime(directory)).toThrow('versions differ');
  });
});
