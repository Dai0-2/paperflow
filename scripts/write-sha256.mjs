import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const paths = process.argv.slice(2);
if (!paths.length) {
  throw new Error('Pass at least one file to checksum.');
}

for (const path of paths) {
  const absolutePath = resolve(path);
  const hash = createHash('sha256').update(await readFile(absolutePath)).digest('hex');
  const outputPath = `${absolutePath}.sha256`;
  await writeFile(outputPath, `${hash}  ${basename(path)}\n`, 'ascii');
  console.log(`${hash}  ${path}`);
}
