import type { PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { SyncCheckpoint, SyncState } from '../types';

export const LOCAL_SYNC_STATE_KEY = 'local-device';
export const SYNC_SOFT_BUDGET_MS = 20_000;

export class SyncBudget {
  private readonly startedAt = Date.now();

  constructor(private readonly budgetMs = SYNC_SOFT_BUDGET_MS) {}

  hasTime(minimumRemainingMs = 1_000): boolean {
    return Date.now() - this.startedAt + minimumRemainingMs < this.budgetMs;
  }
}

export async function updateSyncState(
  database: PaperFlowDatabase,
  patch: Partial<Omit<SyncState, 'key' | 'deviceId' | 'counter' | 'nextSeq'>>,
): Promise<SyncState> {
  const current = await database.syncState.get(LOCAL_SYNC_STATE_KEY);
  const state: SyncState = current || {
    key: LOCAL_SYNC_STATE_KEY,
    deviceId: crypto.randomUUID(),
    counter: 0,
    nextSeq: 1,
  };
  const next = { ...state, ...patch };
  await database.syncState.put(next);
  return next;
}

export async function writeCheckpoint(
  database: PaperFlowDatabase,
  checkpoint: SyncCheckpoint,
): Promise<void> {
  await database.syncCheckpoints.put(checkpoint);
  await updateSyncState(database, { activeCheckpointId: checkpoint.id });
}

export async function clearCheckpoint(
  database: PaperFlowDatabase,
  checkpointId: string,
): Promise<void> {
  await database.syncCheckpoints.delete(checkpointId);
  const state = await database.syncState.get(LOCAL_SYNC_STATE_KEY);
  if (state?.activeCheckpointId === checkpointId) {
    await updateSyncState(database, { activeCheckpointId: undefined });
  }
}

export function retryDelayMs(
  attempt: number,
  retryAfter: string | null = null,
  random: () => number = Math.random,
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const ceiling = Math.min(15 * 60_000, 1_000 * (2 ** Math.min(attempt, 10)));
  return Math.floor(random() * ceiling);
}
