import { Bot, Check, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LibrarySnapshot } from '../../hooks/useLibraryQuery';
import {
  buildAiOrganizeRequest,
  parseAiOrganizeProposal,
  type AiOrganizeProposal,
} from '../../services/library/aiOrganize';
import { sendToCodex, sendToOpenAI } from '../../services/bridge';
import type { PaperInfo } from '../../types';

interface AiOrganizeReviewProps {
  paper: PaperInfo;
  snapshot: LibrarySnapshot;
  onClose: () => void;
  onApply: (proposal: AiOrganizeProposal) => Promise<void>;
}

export function AiOrganizeReview({ paper, snapshot, onClose, onApply }: AiOrganizeReviewProps) {
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
      if (!result.ok || !result.answer) throw new Error(result.error || 'The AI provider returned no proposal.');
      const parsed = parseAiOrganizeProposal(result.answer, new Set(snapshot.collections.map(({ id }) => id)));
      setProposal(parsed);
      setSelectedCollections(parsed.existingCollectionIds);
      setSelectedTags(parsed.suggestedTags);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'AI organization is unavailable.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [paper, snapshot]);

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
      <header><div><h2 id="ai-organize-title">AI organize</h2><p>Only title, authors, abstract, and existing tags were sent.</p></div><button title="Close" onClick={onClose}><X /></button></header>
      {loading && <div className="dialog-loading"><LoaderCircle className="spin" /><span>Reviewing paper metadata…</span></div>}
      {error && <div className="provider-unavailable"><Bot /><strong>AI suggestions are unavailable</strong><p>{error}</p><span>All manual library tools remain available.</span></div>}
      {proposal && <div className="ai-proposal">
        <section><h3>Suggested collections</h3>{proposal.existingCollectionIds.length
          ? proposal.existingCollectionIds.map((id) => {
              const collection = snapshot.collections.find((item) => item.id === id);
              return collection && <label key={id}><input type="checkbox" checked={selectedCollections.includes(id)} onChange={() => setSelectedCollections((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} /><span>{collection.name}</span></label>;
            })
          : <p>No existing collection suggested.</p>}
          {proposal.suggestedCollection && <label><input type="checkbox" checked={createCollection} onChange={(event) => setCreateCollection(event.target.checked)} /><span>Create “{proposal.suggestedCollection}”</span></label>}
        </section>
        <section><h3>Suggested tags</h3><div className="proposal-tags">{proposal.suggestedTags.map((tag) => <button key={tag} data-active={selectedTags.includes(tag)} onClick={() => setSelectedTags((tags) => tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag])}>{selectedTags.includes(tag) && <Check />}{tag}</button>)}</div></section>
        <section><h3>Reason</h3><p>{proposal.reason}</p></section>
        <div className="dialog-actions"><button onClick={onClose}>Cancel</button><button className="primary-button" disabled={applying} onClick={() => void apply()}>Apply selected</button></div>
      </div>}
    </section>
  </div>;
}
