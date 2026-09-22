# Third-Party Notices

PaperFlow AI includes or bundles the following open-source software and data.
Copyright remains with the respective authors.

| Component | Version | License | Use |
|---|---:|---|---|
| React / React DOM | 19.3.0 | MIT | Application UI |
| Lucide React | 1.44.0 | ISC | Interface icons |
| Zustand | 5.0.15 | MIT | UI state |
| React Markdown | 10.1.0 | MIT | Assistant message rendering |
| remark-gfm | 4.0.1 | MIT | GitHub-flavored Markdown |
| Mozilla PDF.js (`pdfjs-dist`) | 6.3.289 | Apache-2.0 | PDF parsing and rendering |
| Tesseract.js | 7.0.0 | Apache-2.0 | Local OCR orchestration and worker |
| Tesseract.js Core | 7.0.0 | Apache-2.0 | Bundled OCR WebAssembly runtime |
| `@tesseract.js-data/eng` | 1.0.0 | MIT | Bundled English OCR trained data |
| `@tesseract.js-data/chi_sim` | 1.0.0 | MIT | Bundled Simplified Chinese OCR trained data |
| MiniSearch | 7.2.0 | MIT | Local full-text search index |
| Dexie | 4.4.6 | Apache-2.0 | IndexedDB data layer |
| TanStack Virtual | 3.14.13 | MIT | Virtualized library rows |
| Citation.js | 0.9.0 | MIT | Citation parsing and formatting |
| pdf-lib | 1.17.1 | MIT | PDF copy generation and annotation export |
| Zod | 4.6.5 | MIT | Runtime protocol validation |
| keyring | 3.6.3 | MIT OR Apache-2.0 | Native OS credential-store abstraction |
| reqwest | 0.12.28 | MIT OR Apache-2.0 | Native Host HTTPS client |
| rustls | 0.23.45 | Apache-2.0 OR ISC OR MIT | Native Host TLS |
| serde / serde_json | 1.0 | MIT OR Apache-2.0 | Native Host protocol serialization |
| url | 2.5.8 | MIT OR Apache-2.0 | API endpoint validation |
| uuid | 1.26.1 | Apache-2.0 OR MIT | Vault identifier validation |
| base64 | 0.22.1 | MIT OR Apache-2.0 | Native Host key and image decoding |
| tempfile | 3.27.0 | MIT OR Apache-2.0 | Restricted temporary Codex attachments |
| thiserror | 2.0.20 | MIT OR Apache-2.0 | Native Host error types |
| zeroize | 1.9.0 | Apache-2.0 OR MIT | Secret memory cleanup |
| which | 8.0.6 | MIT | Fixed Codex executable discovery |

The full PDF.js license text distributed with the extension is available in
`public/pdfjs-LICENSE.txt`. Package source, copyright notices, and complete
license texts are available from each npm or Cargo package distribution and
upstream repository.

PaperFlow applies narrow, reviewable patches to Tesseract.js, Zod, and
Regenerator Runtime to remove runtime CDN fallbacks and dynamic `Function`
compatibility probes that are incompatible with Chrome Manifest V3. The patch
files are distributed in `patches/`; upstream license and copyright ownership
are unchanged.
