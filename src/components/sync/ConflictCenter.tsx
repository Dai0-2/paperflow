import { ExternalLink, GitMerge, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import { text } from '../../i18n';
import type { Language, PaperNote, SyncConflict } from '../../types';

interface ConflictItem {
  conflict: SyncConflict;
  copy?: PaperNote;
}

export function ConflictCenter({ language }: { language: Language }) {
  const [items, setItems] = useState<ConflictItem[]>([]);

  const refresh = useCallback(async () => {
    const database = await openPaperFlowDatabase();
    const conflicts = (await database.syncConflicts.toArray())
      .filter((conflict) => !conflict.resolvedAt)
      .sort((left, right) => right.createdAt - left.createdAt);
    const copies = await database.notes.bulkGet(
      conflicts.map((conflict) => conflict.conflictCopyId),
    );
    setItems(conflicts.map((conflict, index) => ({
      conflict,
      copy: copies[index],
    })));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = async (id: string) => {
    const database = await openPaperFlowDatabase();
    await database.syncConflicts.update(id, { resolvedAt: Date.now() });
    await refresh();
  };

  if (!items.length) return null;
  return <details className="conflict-center">
    <summary><GitMerge />{text(
      language,
      `Review ${items.length} note conflicts`,
      `检查 ${items.length} 个笔记冲突`,
    )}</summary>
    <div className="conflict-list">
      {items.map(({ conflict, copy }) => <div key={conflict.id} className="conflict-item">
        <span><strong>{copy?.title || text(language, 'Conflict copy', '冲突副本')}</strong>
          <small>{new Date(conflict.createdAt).toLocaleString()}</small></span>
        <div>
          <button
            type="button"
            title={text(language, 'Open in library', '在资料库中打开')}
            onClick={() => {
              window.open(
                chrome.runtime.getURL(`library.html?paper=${encodeURIComponent(conflict.paperId)}`),
                '_blank',
              );
            }}
          ><ExternalLink /></button>
          <button
            type="button"
            title={text(language, 'Mark reviewed', '标记为已处理')}
            onClick={() => void dismiss(conflict.id)}
          ><X /></button>
        </div>
      </div>)}
    </div>
  </details>;
}
