import { AppHeader } from './components/layout/AppHeader';
import { PaperHeader } from './components/paper/PaperHeader';
import { Conversation } from './components/chat/Conversation';
import { EmptyState, ReturningState } from './components/chat/EmptyState';
import { Composer } from './components/composer/Composer';
import { HistoryView } from './components/views/HistoryView';
import { SettingsView } from './components/views/SettingsView';
import { MemoryView } from './components/views/MemoryView';
import { OnboardingView } from './components/views/OnboardingView';
import { useAppStore } from './store/useAppStore';
import { useWorkspaceBootstrap } from './hooks/useWorkspaceBootstrap';

export function ChatWorkspace() {
  const { chatState, paper } = useAppStore();
  return <div className="panel-shell"><AppHeader /><PaperHeader /><main className="chat-scroll">{chatState === 'conversation' ? <Conversation /> : chatState === 'empty' ? <EmptyState hasPaper={Boolean(paper)} /> : <ReturningState />}</main><Composer /></div>;
}

export function WorkspaceSurface() {
  const { view, initialized } = useAppStore();
  if (view === 'settings') return <SettingsView />;
  if (!initialized) return <OnboardingView />;
  if (view === 'history') return <HistoryView />;
  if (view === 'memory') return <MemoryView />;
  return <ChatWorkspace />;
}

export function App() {
  useWorkspaceBootstrap({ detectPaper: true });
  return <WorkspaceSurface />;
}
