import { Bot, Check, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LibrarySnapshot } from '../../hooks/useLibraryQuery';
import { text } from '../../i18n';
import {
  buildAiOrganizeRequest,
  parseAiOrganizeProposal,
  type AiOrganizeProposal,
} from '../../services/library/aiOrganize';
import { sendToCodex, sendToOpenAI } from '../../services/bridge';
import type { Language, PaperInfo } from '../../types';

interface AiOrganizeReviewProps {
  language: Language;
  paper: PaperInfo;
  snapshot: LibrarySnapshot;
  onClose: () => void;
  onApply: (proposal: AiOrganizeProposal) => Promise<void>;
}

export function AiOrganizeReview({ language, paper, snapshot, onClose, onApply }: AiOrganizeReviewProps) {
  const [proposal, setProposal] = useState<AiOrganizeProposal | null>(null);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createCollection, setCreateCollection] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let active = true;
    const existingTagNames = (snapshot.paperTags.get(paper.id) || [])
      .map((id) => snapshot.tags.find((tag) => tag.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const request = buildAiOrganizeRequest({
      paper,
      existingTags: existingTagNames,
      collections: snapshot.collections.map(({ id, name }) => ({ id, name })),
    });
    const provider = localStorage.getItem('paperflow:provider') || 'chatgpt';
    const response = provider === 'api'
      ? sendToOpenAI(
          request.question,
          request.context,
          [],
          localStorage.getItem('paperflow:api-model') || 'gpt-5.6-luna',
          localStorage.getItem('paperflow:api-base-url') || 'https://api.openai.com/v1',
          localStorage.getItem('paperflow:api-protocol') || 'responses',
        )
      : sendToCodex(request.question, request.context);
    void response.then((result) => {
      if (!active) return;
      if (!result.ok || !result.answer) throw new Error(result.error || text(language, 'The AI provider returned no proposal.', 'AI 服务没有返回整理建议。'));
      const parsed = parseAiOrganizeProposal(result.answer, new Set(snapshot.collections.map(({ id }) => id)));
      setProposal(parsed);
      setSelectedCollections(parsed.existingCollectionIds);
      setSelectedTags(parsed.suggestedTags);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : text(language, 'AI organization is unavailable.', 'AI 整理当前不可用。'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [language, paper, snapshot]);

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      await onApply({
        ...proposal,
        existingCollectionIds: selectedCollections,
        suggestedTags: selectedTags,
        suggestedCollection: createCollection ? proposal.suggestedCollection : undefined,
      });
      onClose();
    } finally {
      setApplying(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation">
    <section className="library-dialog ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-organize-title">
      <header><div><h2 id="ai-organize-title">{text(language, 'AI organize', 'AI 整理')}</h2><p>{text(language, 'Only title, authors, abstract, and existing tags were sent.', '仅发送标题、作者、摘要和已有标签。')}</p></div><button title={text(language, 'Close', '关闭')} onClick={onClose}><X /></button></header>
      {loading && <div className="dialog-loading"><LoaderCircle className="spin" /><span>{text(language, 'Reviewing paper metadata…', '正在分析论文元数据…')}</span></div>}
      {error && <div className="provider-unavailable"><Bot /><strong>{text(language, 'AI suggestions are unavailable', 'AI 建议不可用')}</strong><p>{error}</p><span>{text(language, 'All manual library tools remain available.', '所有手动资料库工具仍可使用。')}</span></div>}
      {proposal && <div className="ai-proposal">
        <section><h3>{text(language, 'Suggested collections', '建议集合')}</h3>{proposal.existingCollectionIds.length
          ? proposal.existingCollectionIds.map((id) => {
              const collection = snapshot.collections.find((item) => item.id === id);
              return collection && <label key={id}><input type="checkbox" checked={selectedCollections.includes(id)} onChange={() => setSelectedCollections((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} /><span>{collection.name}</span></label>;
            })
          : <p>{text(language, 'No existing collection suggested.', '没有建议已有集合。')}</p>}
          {proposal.suggestedCollection && <label><input type="checkbox" checked={createCollection} onChange={(event) => setCreateCollection(event.target.checked)} /><span>{text(language, `Create “${proposal.suggestedCollection}”`, `创建“${proposal.suggestedCollection}”`)}</span></label>}
        </section>
        <section><h3>{text(language, 'Suggested tags', '建议标签')}</h3><div className="proposal-tags">{proposal.suggestedTags.map((tag) => <button key={tag} data-active={selectedTags.includes(tag)} onClick={() => setSelectedTags((tags) => tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag])}>{selectedTags.includes(tag) && <Check />}{tag}</button>)}</div></section>
        <section><h3>{text(language, 'Reason', '理由')}</h3><p>{proposal.reason}</p></section>
        <div className="dialog-actions"><button onClick={onClose}>{text(language, 'Cancel', '取消')}</button><button className="primary-button" disabled={applying} onClick={() => void apply()}>{text(language, 'Apply selected', '应用所选')}</button></div>
      </div>}
    </section>
  </div>;
}
