import { Download, FileUp, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { text } from '../../i18n';
import {
  commitReferenceImport,
  exportReferences,
  previewReferenceImport,
  type ImportPreview,
  type ReferenceExportFormat,
} from '../../services/library/citations';
import type { Language, PaperInfo } from '../../types';

interface ImportExportDialogProps {
  language: Language;
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
      <header><div><h2 id="import-export-title">{text(props.language, 'Import and export', '导入与导出')}</h2><p>{text(props.language, 'Exchange structured references without changing PDFs or notes.', '交换结构化文献数据，不会修改 PDF 或笔记。')}</p></div><button title={text(props.language, 'Close', '关闭')} onClick={props.onClose}><X /></button></header>
      <div className="dialog-tabs"><button data-active={tab === 'import'} onClick={() => setTab('import')}>{text(props.language, 'Import', '导入')}</button><button data-active={tab === 'export'} onClick={() => setTab('export')}>{text(props.language, 'Export', '导出')}</button></div>
      {tab === 'import'
        ? <div className="import-content">
            {!preview
              ? <>
                  <label className="file-drop"><FileUp /><strong>{text(props.language, 'Choose BibTeX or RIS', '选择 BibTeX 或 RIS')}</strong><span>{text(props.language, 'Files stay on this device until you confirm the import.', '确认导入前，文件仅保留在此设备上。')}</span><input type="file" accept=".bib,.bibtex,.ris,text/plain" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void file.text().then(setInput);
                  }} /></label>
                  <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={text(props.language, 'Or paste BibTeX / RIS here…', '或在此粘贴 BibTeX / RIS…')} aria-label={text(props.language, 'Reference data', '文献数据')} />
                  <div className="dialog-actions"><button className="primary-button" disabled={!input.trim()} onClick={parse}>{text(props.language, 'Preview import', '预览导入')}</button></div>
                </>
              : <>
                  <div className="import-summary"><span><b>{counts.new}</b> {text(props.language, 'new', '新增')}</span><span><b>{counts.update}</b> {text(props.language, 'updates', '更新')}</span><span><b>{counts.duplicate}</b> {text(props.language, 'possible duplicates', '可能重复')}</span></div>
                  {preview.errors.map((error) => <p className="dialog-error" key={error}>{error}</p>)}
                  <div className="import-preview-list">{preview.items.map((item) => <label key={item.id} data-kind={item.disposition}>
                    <input type="checkbox" checked={selectedIds.includes(item.id)} disabled={item.disposition === 'duplicate'} onChange={() => setSelectedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />
                    <span><strong>{item.paper.title}</strong><small>{item.paper.authors || text(props.language, 'Unknown author', '未知作者')} · {item.paper.year || text(props.language, 'No year', '无年份')}</small>{item.warnings.length > 0 && <em>{item.warnings.join(' · ')}</em>}</span>
                    <b>{text(props.language, item.disposition, ({ new: '新增', update: '更新', duplicate: '重复' } as const)[item.disposition])}</b>
                  </label>)}</div>
                  <div className="dialog-actions"><button onClick={() => setPreview(null)}>{text(props.language, 'Back', '返回')}</button><button className="primary-button" disabled={busy || !selectedIds.length} onClick={() => void commit()}>{text(props.language, `Import ${selectedIds.length}`, `导入 ${selectedIds.length} 项`)}</button></div>
                </>}
          </div>
        : <div className="export-content">
            <p>{text(props.language, `${props.exportPapers.length} paper${props.exportPapers.length === 1 ? '' : 's'} will be exported. PDF files, notes, and annotations are not included.`, `将导出 ${props.exportPapers.length} 篇论文。PDF 文件、笔记和批注不包含在内。`)}</p>
            <button disabled={!props.exportPapers.length} onClick={() => exportData('bibtex')}><Download /><span><strong>BibTeX</strong><small>{text(props.language, 'For LaTeX and reference managers', '适用于 LaTeX 和文献管理器')}</small></span></button>
            <button disabled={!props.exportPapers.length} onClick={() => exportData('ris')}><Download /><span><strong>RIS</strong><small>{text(props.language, 'For Zotero, EndNote, and other tools', '适用于 Zotero、EndNote 等工具')}</small></span></button>
          </div>}
    </section>
  </div>;
}
