import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
const errors = [];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

if (manifest.version !== packageJson.version) {
  errors.push(`manifest version ${manifest.version} does not match package ${packageJson.version}`);
}
if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
if (manifest.oauth2?.scopes?.some((scope) => scope !== 'https://www.googleapis.com/auth/drive.file')) {
  errors.push('OAuth scope must be limited to drive.file');
}
if (typeof manifest.key !== 'string' || !manifest.key) {
  errors.push('manifest key is required for a stable extension ID');
} else {
  const digest = createHash('sha256')
    .update(Buffer.from(manifest.key, 'base64'))
    .digest()
    .subarray(0, 16);
  const extensionId = [...digest]
    .map((byte) => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
    .join('');
  const nativeManifestPaths = [
    'native-host/manifests/com.paperflow.ai.macos.json',
    'native-host/manifests/com.paperflow.ai.windows.json',
    'native-host/manifests/com.paperflow.ai.linux.json',
  ];
  for (const nativeManifestPath of nativeManifestPaths) {
    const nativeManifest = JSON.parse(await readFile(resolve(root, nativeManifestPath), 'utf8'));
    const expectedOrigin = `chrome-extension://${extensionId}/`;
    if (nativeManifest.allowed_origins?.length !== 1
        || nativeManifest.allowed_origins[0] !== expectedOrigin) {
      errors.push(`${nativeManifestPath}: allowed origin does not match manifest key`);
    }
  }
}

const forbiddenExtensions = new Set(['.map', '.log', '.pem', '.key', '.p12', '.pfx']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.xml']);
const files = await filesUnder(dist);
for (const path of files) {
  const name = relative(dist, path).split(sep).join('/');
  const extension = extname(path).toLowerCase();
  const size = (await stat(path)).size;
  if (forbiddenExtensions.has(extension)) errors.push(`${name}: forbidden release file`);
  if (/(^|\/)(?:test-results|playwright-report|tests?|fixtures?|logs?)(\/|$)/iu.test(name)) {
    errors.push(`${name}: test or log data in release`);
  }
  if (!textExtensions.has(extension) || size > 20_000_000) continue;

  const text = await readFile(path, 'utf8');
  if (/\b(?:eval|Function)\s*\(/u.test(text)) errors.push(`${name}: dynamic code execution`);
  if (/cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare/u.test(text)) {
    errors.push(`${name}: remote code or dependency URL`);
  }
  if (/<script[^>]+src\s*=\s*["']https?:/iu.test(text)
      || /\bimport\s*\(\s*["']https?:/u.test(text)
      || /\bimportScripts\s*\(\s*["']https?:/u.test(text)) {
    errors.push(`${name}: remote executable resource`);
  }
  if (/\/Users\/[^/]+\/|[A-Z]:\\Users\\[^\\]+\\/u.test(text)) {
    errors.push(`${name}: local absolute path`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(text)
      || /\bsk-[A-Za-z0-9_-]{20,}\b/u.test(text)
      || /\bAIza[0-9A-Za-z_-]{30,}\b/u.test(text)) {
    errors.push(`${name}: credential-like content`);
  }
}

if (errors.length) {
  console.error(`Release audit failed:\n${errors.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Release audit passed for ${files.length} files (${packageJson.version}).`);
