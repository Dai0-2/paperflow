import { ArrowLeft, Bookmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';
import { loadPaperMemory, savePaperMemory } from '../../services/database';

export function MemoryView() {
  const { paper, uiLanguage, setView } = useAppStore();
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!paper) {
      setNote('');
      return;
    }
    void loadPaperMemory(paper.id).then((memory) => setNote(memory?.content || ''));
  }, [paper]);
  return <main className="view"><div className="view-header"><button className="back" onClick={() => setView('chat')}><ArrowLeft size={16} />{text(uiLanguage, 'Paper memory', '论文记忆')}</button></div><div className="view-content memory"><div className="memory-intro"><Bookmark size={18} /><p>{text(uiLanguage, 'Only insights you choose to save appear here.', '这里只显示你主动保存的洞察。')}</p></div><section><h3>{text(uiLanguage, 'Paper', '论文')}</h3><p>{paper?.title || text(uiLanguage, 'No active paper', '无活动论文')}</p></section><section><h3>{text(uiLanguage, 'My notes', '我的笔记')}</h3><textarea className="note-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder={text(uiLanguage, 'Add a note about this paper…', '添加关于这篇论文的笔记…')} /></section><button className="secondary-button" disabled={!paper} onClick={() => paper && void savePaperMemory(paper.id, note)}>{text(uiLanguage, 'Save note', '保存笔记')}</button></div></main>;
}
