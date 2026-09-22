import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'node_modules/tesseract.js/dist/worker.min.js');
const outputPath = resolve(root, 'public/ocr/worker.min.js');

const replacements = [
  [
    '"object"===("undefined"==typeof globalThis?"undefined":n(globalThis))?globalThis.regeneratorRuntime=i:Function("r","regeneratorRuntime = r")(i)',
    'globalThis.regeneratorRuntime=i',
  ],
  [
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/',
    'paperflow-local-required://ocr-language/',
  ],
  [
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@v',
    'paperflow-local-required://ocr-core/',
  ],
  [
    'r.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(t){if("object"==typeof window)return window}}()',
    'r.g=globalThis',
  ],
];

let worker = await readFile(sourcePath, 'utf8');
for (const [unsafe, replacement] of replacements) {
  if (!worker.includes(unsafe)) {
    throw new Error(`Tesseract worker changed; missing audited fragment: ${unsafe.slice(0, 72)}`);
  }
  worker = worker.replace(unsafe, replacement);
}

if (/\b(?:eval|Function)\s*\(/u.test(worker) || /cdn\.jsdelivr|unpkg|cdnjs/u.test(worker)) {
  throw new Error('Generated OCR worker still contains dynamic or remote code.');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, worker);
console.log('Prepared local-only OCR worker.');
