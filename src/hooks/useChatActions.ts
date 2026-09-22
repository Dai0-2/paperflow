import { useCallback } from 'react';
import { sendToCodex, sendToOpenAI } from '../services/bridge';
import { useAppStore } from '../store/useAppStore';
import { buildPaperContext, citationsFromAnswer } from '../services/paperContext';

export function useChatActions() {
  const store = useAppStore();
  const submit = useCallback(async (question: string, replaceAssistantId?: string) => {
    const current = useAppStore.getState();
    if (!question.trim() || current.sending) return;
    const ready = current.providerMode === 'api' ? current.apiState === 'connected' : current.bridgeState === 'connected';
    if (!ready) { current.setInitialized(false); return; }
    const assistantId = replaceAssistantId || crypto.randomUUID();
    if (replaceAssistantId) current.updateMessage(assistantId, { content: current.uiLanguage === 'zh' ? '正在重新生成…' : 'Regenerating…', pending: true, error: false, feedback: undefined, feedbackDetail: undefined });
    else {
      current.addMessage({ id: crypto.randomUUID(), paperId: current.paper?.id, threadId: current.activeThreadId || undefined, role: 'user', content: question.trim(), createdAt: Date.now() });
      current.addMessage({ id: assistantId, paperId: current.paper?.id, threadId: current.activeThreadId || undefined, role: 'assistant', content: current.uiLanguage === 'zh' ? '正在思考…' : 'Thinking…', createdAt: Date.now() + 1, pending: true });
    }
    current.setDraft(''); current.setSending(true);
    const history = current.messages.filter((message) => !message.pending && message.id !== replaceAssistantId).slice(-6).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n').slice(-12_000);
    const attachmentContext = current.attachments.filter((item) => item.kind !== 'image').map((item) => `ATTACHMENT: ${item.name}\n${item.text}`).join('\n\n').slice(0, 40_000);
    const images = current.attachments.filter((item) => item.kind === 'image' && item.dataUrl).slice(-2).map((item) => item.dataUrl as string);
    const paperContext = buildPaperContext({
      paper: current.paper,
      chunks: current.paperChunks,
      selection: current.selection,
      question,
    });
    const context = `${paperContext}\n\n${attachmentContext}\n\nRECENT CONVERSATION\n${history}`;
    const responseLanguage = current.promptLanguage === 'auto' ? current.uiLanguage : current.promptLanguage;
    let streamed = '';
    const onEvent = (event: { event?: string; stage?: string; delta?: string }) => {
      if (event.event === 'delta' && event.delta) {
        streamed += event.delta;
        current.updateMessage(assistantId, { content: streamed, progress: current.uiLanguage === 'zh' ? '正在生成回答…' : 'Writing answer…', pending: true });
        return;
      }
      const stages: Record<string, [string, string]> = {
        accepted: ['Preparing paper context…', '正在准备论文上下文…'],
        connected: ['Connected to the model…', '已连接模型…'],
        reasoning: ['Analyzing the paper…', '正在分析论文…'],
        writing: ['Writing the answer…', '正在生成回答…'],
      };
      const label = event.stage ? stages[event.stage] : undefined;
      if (label) current.updateMessage(assistantId, { content: streamed, progress: current.uiLanguage === 'zh' ? label[1] : label[0] });
    };
    const result = current.providerMode === 'api'
      ? await sendToOpenAI(question, context, images, current.model, current.apiBaseUrl, current.apiProtocol, responseLanguage, onEvent)
      : await sendToCodex(question, context, images, responseLanguage, onEvent);
    const answer = result.answer || streamed;
    current.updateMessage(assistantId, result.ok && answer ? {
      content: answer,
      citations: citationsFromAnswer(answer, current.paperChunks),
      progress: undefined,
      pending: false,
    } : {
      content: result.error || (current.uiLanguage === 'zh' ? '无法获得回答。' : 'Unable to get a response.'),
      progress: undefined,
      pending: false,
      error: true,
    });
    if (current.selection) current.setSelection(null);
    current.setSending(false);
  }, []);
  return { submit, sending: store.sending };
}
