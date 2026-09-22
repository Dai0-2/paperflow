import { BookOpen, MoreHorizontal } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';

export function PaperHeader() {
  const { paper, detecting, paperText, readingPaper, uiLanguage, setView } = useAppStore();
  if (!paper) return <section className="paper-header no-paper">
    <div className="paper-copy"><div className="eyebrow">{detecting ? text(uiLanguage, 'DETECTING', '正在识别') : text(uiLanguage, 'NO PAPER DETECTED', '未识别到论文')}</div><h1>{text(uiLanguage, 'Open a PDF to start a paper workspace', '打开 PDF 以创建论文工作区')}</h1><p>{text(uiLanguage, 'PaperFlow follows the active Chrome tab.', 'PaperFlow 会跟随当前 Chrome 标签页。')}</p></div>
  </section>;
  const openReader = () => {
    const path = `reader.html?url=${encodeURIComponent(paper.url)}&title=${encodeURIComponent(paper.title)}`;
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : `/${path}`;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url });
    else window.open(url, '_blank', 'noopener,noreferrer');
  };
  return <section className="paper-header">
    <div className="paper-copy">
      <div className="eyebrow">{paper.shortTitle}</div>
      <h1>{paper.title}</h1>
      {(paper.authors || paper.year) && <p>{[paper.authors, paper.year].filter(Boolean).join(' · ')}</p>}
      <div className="paper-meta"><span>{paper.source}</span><b>·</b><span title={paper.url}>{new URL(paper.url).hostname || 'Local file'}</span></div>
    </div>
    <div className="paper-actions"><IconButton icon={BookOpen} label={text(uiLanguage, 'Open in PaperFlow Reader', '在 PaperFlow Reader 中打开')} onClick={openReader} /><IconButton icon={MoreHorizontal} label={text(uiLanguage, 'Paper options', '论文选项')} onClick={() => setView('memory')} /></div>
    <div className="context-row" aria-label="Active context">
      <button className="context-chip"><span className="status-dot" />{readingPaper ? text(uiLanguage, 'Reading PDF…', '正在读取 PDF…') : paperText ? text(uiLanguage, 'Paper indexed', '论文已索引') : text(uiLanguage, 'Paper metadata', '论文元数据')}</button>
      {paper.currentPage && <button className="context-chip">{text(uiLanguage, `Current page ${paper.currentPage}`, `当前第 ${paper.currentPage} 页`)}</button>}
    </div>
  </section>;
}
