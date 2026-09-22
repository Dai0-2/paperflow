import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from '../pdf-worker.ts?worker&url';
import type { Attachment } from '../types';

GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_PAGES = 20;
const MAX_TEXT = 80_000;
const MAX_IMAGE_DATA_URL = 360_000;

async function imageDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const render = (maxSide: number, quality: number) => {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  };
  let dataUrl = render(1280, .76);
  if (dataUrl.length > MAX_IMAGE_DATA_URL) dataUrl = render(960, .64);
  if (dataUrl.length > MAX_IMAGE_DATA_URL) dataUrl = render(720, .56);
  bitmap.close();
  if (dataUrl.length > MAX_IMAGE_DATA_URL) throw new Error('This image is too large. Please choose a smaller image.');
  return dataUrl;
}

export async function extractPdfPages(data: Uint8Array) {
  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];
  let length = 0;
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PAGES) && length < MAX_TEXT; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push(text);
    length += text.length;
  }
  return { pages, pageCount: pdf.numPages };
}

async function extractPdf(data: Uint8Array) {
  const result = await extractPdfPages(data);
  return {
    text: result.pages.map((page, index) => `[Page ${index + 1}]\n${page}`).join('\n\n').slice(0, MAX_TEXT),
    pageCount: result.pageCount,
  };
}

export async function readPaperText(rawUrl: string) {
  let url = rawUrl;
  if (/arxiv\.org\/abs\//i.test(url)) url = url.replace('/abs/', '/pdf/').replace(/([?#].*)?$/, '.pdf');
  if (!/\.pdf(?:$|[?#])/i.test(url) && !/arxiv\.org\/pdf\//i.test(url)) return '';
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`PDF request failed (${response.status}).`);
  return (await extractPdf(new Uint8Array(await response.arrayBuffer()))).text;
}

export async function readAttachment(file: File): Promise<Attachment> {
  const id = `${Date.now()}-${file.name}`;
  if (file.type.startsWith('image/')) return { id, name: file.name, size: file.size, kind: 'image', text: '', dataUrl: await imageDataUrl(file) };
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const data = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractPdf(data);
    return { id, name: file.name, size: file.size, kind: 'pdf', text: extracted.text, pageCount: extracted.pageCount };
  }
  return { id, name: file.name, size: file.size, kind: 'text', text: (await file.text()).slice(0, MAX_TEXT) };
}
