import {readFile, realpath, lstat} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {validateAnimation} from '../packages/animation-runtime/src/schemas';
import {
  sceneSchema,
  validateScene,
} from '../packages/animation-runtime/src/scene';
const tags = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);
const attributes = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'transform',
]);
export function safeSvg(source: string): string {
  if (/<!|<\?/.test(source))
    throw new Error(
      'SVG declarations, entities and processing instructions are forbidden',
    );
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {
        throw new Error('Malformed SVG');
      },
      error: () => {
        throw new Error('Malformed SVG');
      },
      fatalError: () => {
        throw new Error('Malformed SVG');
      },
    },
  }).parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg' || !root.hasAttribute('viewBox'))
    throw new Error('SVG requires root svg and viewBox');
  const box = root
    .getAttribute('viewBox')!
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box.length !== 4 ||
    box[0] !== 0 ||
    box[1] !== 0 ||
    !box.every(Number.isFinite) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw new Error('SVG viewBox must be 0 0 width height');
  function visit(node: any) {
    if (node.nodeType === 1) {
      if (!tags.has(node.tagName))
        throw new Error(`Forbidden SVG element ${node.tagName}`);
      for (const attr of Array.from(node.attributes) as any[]) {
        if (!attributes.has(attr.name))
          throw new Error(`Forbidden SVG attribute ${attr.name}`);
        if (
          /url\s*\(|[&<>\\]|javascript|data:|https?:/i.test(attr.value) &&
          !(
            attr.name === 'xmlns' && attr.value === 'http://www.w3.org/2000/svg'
          )
        )
          throw new Error(`Forbidden SVG value in ${attr.name}`);
        if (
          ['fill', 'stroke'].includes(attr.name) &&
          !/^(none|#[\da-f]{3,8}|[a-z]+|(?:rgb|rgba)\([\d\s.,%]+\))$/i.test(
            attr.value,
          )
        )
          throw new Error(`Unsupported SVG paint ${attr.value}`);
        if (
          attr.name === 'xmlns' &&
          attr.value !== 'http://www.w3.org/2000/svg'
        )
          throw new Error('Invalid SVG namespace');
      }
    } else if (node.nodeType !== 3 || node.textContent.trim())
      throw new Error('Only SVG elements and whitespace are allowed');
    for (const child of Array.from(node.childNodes)) visit(child);
  }
  for (const node of Array.from(doc.childNodes)) visit(node);
  // Preserve intrinsic SVG units without introducing a nested viewport.
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.removeAttribute('viewBox');
  root.removeAttribute('xmlns');
  const serializer = new XMLSerializer();
  return serializer
    .serializeToString(root)
    .replace(/^<svg/, '<g')
    .replace(/<\/svg>$/, '</g>');
}
export async function confined(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.includes('\\'))
    throw new Error(`Asset path must be relative: ${relative}`);
  const resolved = await realpath(path.resolve(root, relative));
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    throw new Error(`Path escapes project: ${relative}`);
  return resolved;
}
export async function loadProject(project: string) {
  const root = await realpath(project);
  const json = async (name: string) =>
    JSON.parse(await readFile(await confined(root, name), 'utf8'));
  let isScene = false;
  try {
    await lstat(path.join(root, 'scene.json'));
    isScene = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (isScene) {
    const scene = sceneSchema.parse(await json('scene.json'));
    const inputs: Record<string, unknown> = Object.create(null);
    const assets: Record<string, Record<string, string>> = Object.create(null);
    for (const object of scene.objects) {
      if (Object.hasOwn(inputs, object.rig)) continue;
      const rigFile = await confined(root, object.rig);
      inputs[object.rig] = JSON.parse(await readFile(rigFile, 'utf8'));
    }
    const validated = validateScene(scene, await json('timeline.json'), inputs);
    for (const [reference, rig] of Object.entries(validated.rigs)) {
      const parts: Record<string, string> = Object.create(null);
      for (const part of rig.parts) {
        if (path.isAbsolute(part.asset) || part.asset.includes('\\'))
          throw new Error(`Invalid asset path ${part.asset}`);
        const file = await confined(
          root,
          path.join(path.dirname(reference), part.asset),
        );
        parts[part.id] = safeSvg(await readFile(file, 'utf8'));
      }
      assets[reference] = parts;
    }
    return {...validated, assets};
  }
  const {rig: character, timeline} = validateAnimation(
    await json('character/rig.json'),
    await json('timeline.json'),
  );
  const assets: Record<string, string> = Object.create(null);
  for (const part of character.parts) {
    try {
      if (path.isAbsolute(part.asset))
        throw new Error('Asset path must be relative');
      const file = await confined(root, `character/${part.asset}`);
      assets[part.id] = safeSvg(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(
        `Part ${part.id} (${part.asset}): ${(error as Error).message}`,
      );
    }
  }
  return {character, timeline, assets};
}
export function cli(render = false) {
  const {values} = parseArgs({
    options: {
      project: {type: 'string'},
      ...(render
        ? {
            output: {type: 'string' as const},
            'browser-executable': {type: 'string' as const},
          }
        : {}),
    },
    strict: true,
  });
  if (!values.project || (render && !values.output))
    throw new Error(
      `Usage: --project <directory>${render ? ' --output <file.mp4>' : ''}`,
    );
  return {
    project: values.project,
    output: values.output as string,
    browserExecutable: values['browser-executable'] as string | undefined,
  };
}
