import {parseArgs} from 'node:util';
import path from 'node:path';
import {RenderInternals} from '@remotion/renderer';

try {
  const {values} = parseArgs({
    options: {input: {type: 'string'}},
    strict: true,
  });
  if (!values.input)
    throw new Error('Usage: animation-maker inspect --input <video.mp4>');
  const result = await RenderInternals.callFf({
    bin: 'ffprobe',
    args: [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      path.resolve(values.input),
    ],
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
  });
  console.log(result.stdout);
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
