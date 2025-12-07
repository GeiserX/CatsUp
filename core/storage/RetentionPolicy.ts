import type { IStorage, StoredSession } from './IStorage';

export interface RetentionPolicyOptions {
  storage: IStorage;
  days: number;                           // delete sessions older than N days
  minSessionsToKeep?: number;             // keep at least N newest sessions regardless of age
  dryRun?: boolean;                        // if true, do not actually delete
  now?: () => number;                      // time source (for tests)
  onDelete?: (session: StoredSession) => void | Promise<void>;
  onKeep?: (session: StoredSession, reason: string) => void | Promise<void>;
  filter?: (session: StoredSession) => boolean; // only consider sessions passing this predicate
}

/**
 * RetentionPolicy:
 * - Fetches all sessions (paged) from IStorage
 * - Computes "age timestamp" as endedAt ?? updatedAt ?? createdAt
 * - Deletes sessions older than cutoff, except the newest minSessionsToKeep
 */
export class RetentionPolicy {
  private storage: IStorage;
  private days: number;
  private minKeep: number;
  private dryRun: boolean;
  private nowFn: () => number;
  private onDelete?: (s: StoredSession) => void | Promise<void>;
  private onKeep?: (s: StoredSession, reason: string) => void | Promise<void>;
  private filter?: (s: StoredSession) => boolean;

  constructor(opts: RetentionPolicyOptions) {
    this.storage = opts.storage;
    this.days = Math.max(0, opts.days);
    this.minKeep = Math.max(0, opts.minSessionsToKeep ?? 0);
    this.dryRun = !!opts.dryRun;
    this.nowFn = opts.now ?? (() => Date.now());
    this.onDelete = opts.onDelete;
    this.onKeep = opts.onKeep;
    this.filter = opts.filter;
  }

  setDays(days: number) {
    this.days = Math.max(0, days);
  }

  getDays(): number {
    return this.days;
  }

  private cutoffMs(): number {
    const ms = this.days * 24 * 3600 * 1000;
    return this.nowFn() - ms;
  }

  private ageTimestamp(s: StoredSession): number {
    return s.endedAt ?? s.updatedAt ?? s.createdAt;
  }

  private async fetchAllSessions(): Promise<StoredSession[]> {
    const all: StoredSession[] = [];
    let cursor: string | undefined;
    do {
      const { sessions, nextCursor } = await this.storage.listSessions({
        limit: 200,
        cursor,
        orderBy: 'createdAt',
        orderDir: 'desc',
      });
      all.push(...sessions);
      cursor = nextCursor;
    } while (cursor);
    return all;
  }

  /**
   * Run retention sweep.
   * Returns ids of deleted and kept sessions (kept due to minSessionsToKeep or cutoff not reached).
   */
  async run(): Promise<{ deletedSessions: string[]; keptSessions: string[] }> {
    const cutoff = this.cutoffMs();
    const sessions = await this.fetchAllSessions();

    const candidates = (this.filter ? sessions.filter(this.filter) : sessions).slice();

    // Sort newest first so we can keep the newest N regardless of age
    candidates.sort((a, b) => (this.ageTimestamp(b) - this.ageTimestamp(a)));

    const kept: string[] = [];
    const deleted: string[] = [];

    // Keep the newest minKeep sessions
    const keepHead = this.minKeep > 0 ? candidates.splice(0, Math.min(this.minKeep, candidates.length)) : [];
    for (const s of keepHead) {
      kept.push(s.id);
      if (this.onKeep) await this.onKeep(s, 'minSessionsToKeep');
    }

    // Evaluate the rest against cutoff
    for (const s of candidates) {
      const ageTs = this.ageTimestamp(s);
      if (ageTs <= cutoff) {
        if (!this.dryRun) {
          await this.storage.deleteSession(s.id);
        }
        deleted.push(s.id);
        if (this.onDelete) await this.onDelete(s);
      } else {
        kept.push(s.id);
        if (this.onKeep) await this.onKeep(s, 'withinRetention');
      }
    }

    return { deletedSessions: deleted, keptSessions: kept };
  }
}
