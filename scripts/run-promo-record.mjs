import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'record-promo.ts');
const runtimeDir = path.join(root, 'artifacts', '.promo-runtime');
const runtimePath = path.join(runtimeDir, 'record-promo.js');

function runProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Promo recorder exited after signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

async function run() {
  await mkdir(runtimeDir, { recursive: true });
  const tsc = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
  const compileCode = await runProcess(tsc, [
    '--ignoreConfig',
    sourcePath,
    '--outDir', runtimeDir,
    '--module', 'esnext',
    '--target', 'es2022',
    '--moduleResolution', 'bundler',
    '--skipLibCheck',
    '--types', 'node',
  ]);
  if (compileCode !== 0) {
    throw new Error(`Promo recorder compilation exited with code ${compileCode}.`);
  }

  const recorderCode = await runProcess(process.execPath, [runtimePath]);
  if (recorderCode !== 0) {
    throw new Error(`Promo recorder exited with code ${recorderCode}.`);
  }
}

run()
  .finally(() => rm(runtimeDir, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
