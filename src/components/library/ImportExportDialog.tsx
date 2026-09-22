import { Download, FileUp, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  commitReferenceImport,
  exportReferences,
  previewReferenceImport,
  type ImportPreview,
  type ReferenceExportFormat,
} from '../../services/library/citations';
import type { PaperInfo } from '../../types';

interface ImportExportDialogProps {
  papers: PaperInfo[];
  exportPapers: PaperInfo[];
  onClose: () => void;
  onImported: () => void;
}

function downloadText(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportExportDialog(props: ImportExportDialogProps) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const counts = useMemo(() => preview?.items.reduce((result, item) => {
    result[item.disposition] += 1;
    return result;
  }, { new: 0, update: 0, duplicate: 0 }) || { new: 0, update: 0, duplicate: 0 }, [preview]);
  const parse = () => {
    const next = previewReferenceImport(input, props.papers);
    setPreview(next);
    setSelectedIds(next.items.filter((item) => item.disposition !== 'duplicate').map((item) => item.id));
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await commitReferenceImport(preview.items.filter((item) => selectedIds.includes(item.id)));
      props.onImported();
      props.onClose();
    } finally {
      setBusy(false);
    }
  };
  const exportData = (format: ReferenceExportFormat) => {
    const content = exportReferences(props.exportPapers, format);
    downloadText(content, `paperflow-library.${format === 'bibtex' ? 'bib' : 'ris'}`, 'text/plain;charset=utf-8');
  };
  return <div className="dialog-backdrop" role="presentation">
    <section className="library-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-export-title">
      <header><div><h2 id="import-export-title">Import and export</h2><p>Exchange structured references without changing PDFs or notes.</p></div><button title="Close" onClick={props.onClose}><X /></button></header>
      <div className="dialog-tabs"><button data-active={tab === 'import'} onClick={() => setTab('import')}>Import</button><button data-active={tab === 'export'} onClick={() => setTab('export')}>Export</button></div>
      {tab === 'import'
        ? <div className="import-content">
            {!preview
              ? <>
                  <label className="file-drop"><FileUp /><strong>Choose BibTeX or RIS</strong><span>Files stay on this device until you confirm the import.</span><input type="file" accept=".bib,.bibtex,.ris,text/plain" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void file.text().then(setInput);
                  }} /></label>
                  <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Or paste BibTeX / RIS here…" aria-label="Reference data" />
                  <div className="dialog-actions"><button className="primary-button" disabled={!input.trim()} onClick={parse}>Preview import</button></div>
                </>
              : <>
                  <div className="import-summary"><span><b>{counts.new}</b> new</span><span><b>{counts.update}</b> updates</span><span><b>{counts.duplicate}</b> possible duplicates</span></div>
                  {preview.errors.map((error) => <p className="dialog-error" key={error}>{error}</p>)}
                  <div className="import-preview-list">{preview.items.map((item) => <label key={item.id} data-kind={item.disposition}>
                    <input type="checkbox" checked={selectedIds.includes(item.id)} disabled={item.disposition === 'duplicate'} onChange={() => setSelectedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />
                    <span><strong>{item.paper.title}</strong><small>{item.paper.authors || 'Unknown author'} · {item.paper.year || 'No year'}</small>{item.warnings.length > 0 && <em>{item.warnings.join(' · ')}</em>}</span>
                    <b>{item.disposition}</b>
                  </label>)}</div>
                  <div className="dialog-actions"><button onClick={() => setPreview(null)}>Back</button><button className="primary-button" disabled={busy || !selectedIds.length} onClick={() => void commit()}>Import {selectedIds.length}</button></div>
                </>}
          </div>
        : <div className="export-content">
            <p>{props.exportPapers.length} paper{props.exportPapers.length === 1 ? '' : 's'} will be exported. PDF files, notes, and annotations are not included.</p>
            <button disabled={!props.exportPapers.length} onClick={() => exportData('bibtex')}><Download /><span><strong>BibTeX</strong><small>For LaTeX and reference managers</small></span></button>
            <button disabled={!props.exportPapers.length} onClick={() => exportData('ris')}><Download /><span><strong>RIS</strong><small>For Zotero, EndNote, and other tools</small></span></button>
          </div>}
    </section>
  </div>;
}
