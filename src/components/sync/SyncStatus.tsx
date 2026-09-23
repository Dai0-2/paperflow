import { AlertTriangle, CheckCircle2, Cloud, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import { syncEngine } from '../../sync/SyncEngine';
import { LOCAL_SYNC_STATE_KEY } from '../../sync/checkpoint';
import { text } from '../../i18n';
import type { Language, SyncState } from '../../types';
import { vaultController } from '../../services/sync/vaultController';

interface StatusSnapshot {
  state?: SyncState;
  pending: number;
  conflicts: number;
}

function statusLabel(language: Language, snapshot: StatusSnapshot): string {
  if (snapshot.state?.status === 'syncing') return text(language, 'Syncing changes…', '正在同步更改…');
  if (snapshot.state?.status === 'offline') return text(language, 'Offline · changes queued', '离线 · 更改已排队');
  if (snapshot.state?.status === 'auth-required') return text(language, 'Reconnect Google Drive', '请重新连接 Google Drive');
  if (snapshot.state?.status === 'paused') return text(language, 'Uploads paused', '上传已暂停');
  if (snapshot.state?.status === 'error') return text(language, 'Sync needs attention', '同步需要处理');
  if (snapshot.pending) {
    return text(language, `${snapshot.pending} changes queued`, `${snapshot.pending} 项更改待同步`);
  }
  if (snapshot.state?.lastSyncedAt) {
    return text(
      language,
      `Synced ${new Date(snapshot.state.lastSyncedAt).toLocaleString()}`,
      `已同步于 ${new Date(snapshot.state.lastSyncedAt).toLocaleString()}`,
    );
  }
  return text(language, 'Ready to sync', '可以开始同步');
}

function actionErrorText(language: Language, error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Unlock the encrypted vault')) {
    return text(language, 'Unlock the encrypted vault before synchronizing.', '请先解锁加密保险库再同步。');
  }
  return message || text(language, 'Sync could not start.', '无法启动同步。');
}

export function SyncStatus({
  language,
  compact = false,
  onNeedsAttention,
}: {
  language: Language;
  compact?: boolean;
  onNeedsAttention?: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot>({ pending: 0, conflicts: 0 });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    const database = await openPaperFlowDatabase();
    const [state, pending, conflicts] = await Promise.all([
      database.syncState.get(LOCAL_SYNC_STATE_KEY),
      database.syncOps.where('state').equals('pending').count(),
      database.syncConflicts.filter((conflict) => !conflict.resolvedAt).count(),
    ]);
    setSnapshot({ state, pending, conflicts });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const synchronize = async () => {
    setBusy(true);
    setActionError('');
    try {
      await syncEngine.run({ force: true });
    } catch (reason) {
      const message = actionErrorText(language, reason);
      setActionError(message);
      onNeedsAttention?.(message);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const hasProblem = Boolean(
    actionError
    || snapshot.state?.lastError
    || snapshot.conflicts
    || snapshot.state?.status === 'paused'
    || snapshot.state?.status === 'auth-required',
  );
  const StatusIcon = busy || snapshot.state?.status === 'syncing'
    ? LoaderCircle
    : hasProblem
      ? AlertTriangle
      : snapshot.pending
        ? Cloud
        : CheckCircle2;
  if (!vaultController.isConfigured()) return null;
  if (compact) {
    return <button
      type="button"
      className="library-sync-button"
      title={actionError || statusLabel(language, snapshot)}
      data-problem={hasProblem}
      disabled={busy}
      onClick={() => void synchronize()}
    ><StatusIcon className={busy || snapshot.state?.status === 'syncing' ? 'spin' : ''} />
      {snapshot.pending > 0 && <span>{snapshot.pending > 99 ? '99+' : snapshot.pending}</span>}
    </button>;
  }

  return <div className="sync-status">
    <div className="sync-status-line">
      <StatusIcon className={busy || snapshot.state?.status === 'syncing' ? 'spin' : ''} />
      <span><strong>{statusLabel(language, snapshot)}</strong>
        {(actionError || snapshot.state?.lastError || snapshot.conflicts > 0) && <small>
          {actionError || snapshot.state?.lastError || text(
            language,
            `${snapshot.conflicts} note conflicts`,
            `${snapshot.conflicts} 个笔记冲突`,
          )}
        </small>}
      </span>
      <button
        type="button"
        title={text(language, 'Sync now', '立即同步')}
        disabled={busy}
        onClick={() => void synchronize()}
      ><RefreshCw /></button>
    </div>
  </div>;
}
