import { GitMerge, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isPossibleDuplicate } from '../../services/library/paperIdentity';
import type { PaperInfo } from '../../types';

interface DuplicateReviewProps {
  papers: PaperInfo[];
  onClose: () => void;
  onMerge: (canonicalId: string, duplicateId: string) => Promise<void>;
}

export function DuplicateReview({ papers, onClose, onMerge }: DuplicateReviewProps) {
  const [busy, setBusy] = useState('');
  const pairs = useMemo(() => {
    const result: Array<[PaperInfo, PaperInfo]> = [];
    const used = new Set<string>();
    for (let left = 0; left < papers.length; left += 1) {
      for (let right = left + 1; right < papers.length; right += 1) {
        if (!used.has(papers[right].id) && isPossibleDuplicate(papers[left], papers[right])) {
          result.push([papers[left], papers[right]]);
          used.add(papers[right].id);
          break;
        }
      }
    }
    return result;
  }, [papers]);
  const merge = async (canonicalId: string, duplicateId: string) => {
    setBusy(duplicateId);
    try {
      await onMerge(canonicalId, duplicateId);
    } finally {
      setBusy('');
    }
  };
  return <div className="dialog-backdrop" role="presentation">
    <section className="library-dialog duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
      <header><div><h2 id="duplicate-title">Review duplicates</h2><p>Choose which record keeps the shared library history and attachments.</p></div><button title="Close" onClick={onClose}><X /></button></header>
      <div className="duplicate-list">
        {!pairs.length && <div className="dialog-empty">No duplicate pairs remain.</div>}
        {pairs.map(([left, right]) => <article key={`${left.id}:${right.id}`}>
          <div><strong>{left.title}</strong><span>{left.authors || 'Unknown author'} · {left.year || 'No year'}</span><small>{left.doi || left.url || 'No identifier'}</small><button disabled={Boolean(busy)} onClick={() => void merge(left.id, right.id)}><GitMerge /> Keep this record</button></div>
          <i>or</i>
          <div><strong>{right.title}</strong><span>{right.authors || 'Unknown author'} · {right.year || 'No year'}</span><small>{right.doi || right.url || 'No identifier'}</small><button disabled={Boolean(busy)} onClick={() => void merge(right.id, left.id)}><GitMerge /> Keep this record</button></div>
        </article>)}
      </div>
    </section>
  </div>;
}
