import { History, Library, MoreHorizontal, Plus } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { BrandMark } from '../common/BrandMark';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';
import { createThread } from '../../services/database';

export function AppHeader() {
  const { uiLanguage, paper, setView, setMessages, setActiveThreadId, updatePaper } = useAppStore();
  const startThread = async () => {
    if (paper) {
      const thread = await createThread(paper.id);
      setActiveThreadId(thread.id);
      updatePaper({ activeThreadId: thread.id });
    }
    setMessages([]);
    setView('chat');
  };
  const openLibrary = () => {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('library.html')
      : '/library.html';
    window.open(url, '_blank', 'noopener');
  };
  return <header className="app-header">
    <button className="brand" onClick={() => setView('chat')} aria-label="PaperFlow home">
      <BrandMark /><span>PaperFlow</span>
    </button>
    <div className="header-actions">
      <IconButton icon={Plus} label={text(uiLanguage, 'New thread', '新对话')} onClick={() => void startThread()} />
      <IconButton icon={Library} label={text(uiLanguage, 'Open library', '打开资料库')} onClick={openLibrary} />
      <IconButton icon={History} label={text(uiLanguage, 'Conversation history', '对话历史')} onClick={() => setView('history')} />
      <IconButton icon={MoreHorizontal} label={text(uiLanguage, 'Settings and more', '设置与更多')} onClick={() => setView('settings')} />
    </div>
  </header>;
}
