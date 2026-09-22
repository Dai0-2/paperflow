import { GitMerge, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { text } from '../../i18n';
import { isPossibleDuplicate } from '../../services/library/paperIdentity';
import type { Language, PaperInfo } from '../../types';

interface DuplicateReviewProps {
  language: Language;
  papers: PaperInfo[];
  onClose: () => void;
  onMerge: (canonicalId: string, duplicateId: string) => Promise<void>;
}

export function DuplicateReview({ language, papers, onClose, onMerge }: DuplicateReviewProps) {
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
      <header><div><h2 id="duplicate-title">{text(language, 'Review duplicates', '检查重复项')}</h2><p>{text(language, 'Choose which record keeps the shared library history and attachments.', '选择保留共享资料库历史和附件的记录。')}</p></div><button title={text(language, 'Close', '关闭')} onClick={onClose}><X /></button></header>
      <div className="duplicate-list">
        {!pairs.length && <div className="dialog-empty">{text(language, 'No duplicate pairs remain.', '没有待处理的重复论文。')}</div>}
        {pairs.map(([left, right]) => <article key={`${left.id}:${right.id}`}>
          <div><strong>{left.title}</strong><span>{left.authors || text(language, 'Unknown author', '未知作者')} · {left.year || text(language, 'No year', '无年份')}</span><small>{left.doi || left.url || text(language, 'No identifier', '无标识符')}</small><button disabled={Boolean(busy)} onClick={() => void merge(left.id, right.id)}><GitMerge /> {text(language, 'Keep this record', '保留此记录')}</button></div>
          <i>{text(language, 'or', '或')}</i>
          <div><strong>{right.title}</strong><span>{right.authors || text(language, 'Unknown author', '未知作者')} · {right.year || text(language, 'No year', '无年份')}</span><small>{right.doi || right.url || text(language, 'No identifier', '无标识符')}</small><button disabled={Boolean(busy)} onClick={() => void merge(right.id, left.id)}><GitMerge /> {text(language, 'Keep this record', '保留此记录')}</button></div>
        </article>)}
      </div>
    </section>
  </div>;
}
