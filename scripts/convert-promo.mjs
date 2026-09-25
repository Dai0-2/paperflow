import { access, stat } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const input = path.join(root, 'artifacts', 'paperflow-promo.webm');
const output = path.join(root, 'artifacts', 'paperflow-promo.mp4');

function executableWorks(executable) {
  if (!executable) return false;
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

function findOnPath(name) {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [name], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim().split(/\r?\n/)[0] || '';
}

function findPythonFfmpeg() {
  for (const python of ['python3', 'python']) {
    const result = spawnSync(
      python,
      ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
      { encoding: 'utf8' },
    );
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return '';
}

function findBundledFfmpeg() {
  try {
    const toolsRoot = path.resolve(path.dirname(process.execPath), '../../..');
    const ffmpegRoot = path.join(toolsRoot, 'ffmpeg');
    const versions = readdirSync(ffmpegRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    return versions.length
      ? path.join(ffmpegRoot, versions[0], 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
      : '';
  } catch {
    return '';
  }
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    findOnPath('ffmpeg'),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    findBundledFfmpeg(),
    findPythonFfmpeg(),
  ];
  return candidates.find(executableWorks) || '';
}

function mediaDetails(ffmpeg, file) {
  const siblingFfprobe = path.join(
    path.dirname(ffmpeg),
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  );
  const ffprobe = process.env.FFPROBE_PATH || findOnPath('ffprobe') || siblingFfprobe;
  if (ffprobe && executableWorks(ffprobe)) {
    const result = spawnSync(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration',
      '-of', 'default=noprint_wrappers=1',
      file,
    ], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }

  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return (result.stderr || result.stdout)
    .split(/\r?\n/)
    .filter((line) => /Duration:|Video:/.test(line))
    .join('\n')
    .trim();
}

async function main() {
  await access(input);
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    throw new Error(
      'ffmpeg was not found. Install ffmpeg or set FFMPEG_PATH, then run `npm run promo:mp4` again.',
    );
  }

  const conversion = spawnSync(ffmpeg, [
    '-y',
    '-i', input,
    '-an',
    '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (conversion.status !== 0) {
    throw new Error(`ffmpeg conversion failed:\n${conversion.stderr.trim()}`);
  }

  const outputStat = await stat(output);
  if (outputStat.size < 100_000) {
    throw new Error(`Converted MP4 is unexpectedly small (${outputStat.size} bytes).`);
  }

  console.log(`Converted ${output} (${(outputStat.size / 1_048_576).toFixed(1)} MiB)`);
  console.log(mediaDetails(ffmpeg, output));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
