import { ArrowLeft, MessageSquare, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';
import { createThread, listThreads, loadMessages, updateReadingState } from '../../services/database';
import type { Thread } from '../../types';

export function HistoryView() {
  const { paper, activeThreadId, uiLanguage, setView, setMessages, setActiveThreadId, updatePaper } = useAppStore();
  const [threads, setThreads] = useState<Thread[]>([]);
  useEffect(() => {
    if (!paper) {
      setThreads([]);
      return;
    }
    void listThreads(paper.id).then(setThreads);
  }, [paper]);
  const selectThread = async (thread: Thread) => {
    setActiveThreadId(thread.id);
    updatePaper({ activeThreadId: thread.id });
    await updateReadingState(thread.paperId, { activeThreadId: thread.id });
    setMessages(await loadMessages(thread.id));
    setView('chat');
  };
  const startThread = async () => {
    if (!paper) return;
    const thread = await createThread(paper.id);
    setActiveThreadId(thread.id);
    updatePaper({ activeThreadId: thread.id });
    setMessages([]);
    setView('chat');
  };
  return <main className="view"><div className="view-header"><button className="back" onClick={() => setView('chat')}><ArrowLeft size={16} />{text(uiLanguage, 'Conversations', '对话')}</button><button className="compact-icon" aria-label={text(uiLanguage, 'New thread', '新对话')} onClick={() => void startThread()}><Plus size={17} /></button></div>
    <div className="view-content"><p className="eyebrow">{paper?.shortTitle || text(uiLanguage, 'NO ACTIVE PAPER', '无活动论文')}</p><h2>{text(uiLanguage, 'Conversation history', '对话历史')}</h2>
      <div className="thread-list">{threads.length ? <div><div className="date-label">{text(uiLanguage, 'Recent', '最近')}</div>{threads.map((thread) => <button key={thread.id} data-active={thread.id === activeThreadId} onClick={() => void selectThread(thread)}><MessageSquare size={15} /><span>{thread.title}</span></button>)}</div> : <p className="view-empty">{text(uiLanguage, 'No conversations for this paper yet.', '这篇论文还没有对话。')}</p>}</div>
    </div></main>;
}
