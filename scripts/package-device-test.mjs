import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { arch } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const buildDirectory = resolve(root, 'work/device-test');
const hostBinary = resolve(root, 'native-host/target/release/paperflow-host');
const stage = resolve(root, 'work/device-test-package');
const bundleName = 'PaperFlow-AI';
const bundle = resolve(stage, bundleName);
const outputName = `paperflow-ai-device-test-${packageJson.version}-macos-${arch}.zip`;
const output = resolve(root, outputName);

const manifest = JSON.parse(await readFile(resolve(buildDirectory, 'manifest.json'), 'utf8'));
if (!manifest.key || !manifest.oauth2?.client_id) {
  throw new Error('Device-test manifest must contain both the stable key and Google OAuth client ID.');
}

await rm(stage, { recursive: true, force: true });
await rm(output, { force: true });
await mkdir(resolve(bundle, 'native-host-macos'), { recursive: true });
await cp(buildDirectory, resolve(bundle, 'extension'), { recursive: true });
await cp(hostBinary, resolve(bundle, 'native-host-macos/paperflow-host'));
await cp(
  resolve(root, 'native-host/install/install-macos.sh'),
  resolve(bundle, 'native-host-macos/install-macos.sh'),
);
await cp(
  resolve(root, 'docs/device-test-macos.zh-CN.md'),
  resolve(bundle, '安装说明.md'),
);

execFileSync('chmod', ['755', resolve(bundle, 'native-host-macos/paperflow-host')]);
execFileSync('chmod', ['755', resolve(bundle, 'native-host-macos/install-macos.sh')]);
execFileSync('zip', ['-qry', output, bundleName], { cwd: stage });
console.log(outputName);
