import { Store } from '../store';
import { ObsidianIntegration } from './obsidian';
import {
  DeleteMode,
  Integration,
  IntegrationsConfig,
  IntegrationState,
  Note,
  ReconcileEntry,
  TestResult,
} from './types';

const CONFIG_KEY = 'integrations';

const DEFAULTS: IntegrationsConfig = {
  obsidian: {
    enabled: false,
    vaultPath: '',
    subfolder: 'NoteDrop',
    filenameTemplate: '{date}-{slug}',
    deleteOutbound: 'ask',
    deleteInbound: true,
  },
};

/**
 * Earlier builds stored this as a boolean. An explicit opt-out is a real
 * preference and is kept; everything else falls through to asking, which is
 * the safer default now that a prompt exists.
 */
function toDeleteMode(value: unknown): DeleteMode {
  if (value === 'ask' || value === 'always' || value === 'never') return value;
  if (value === false) return 'never';
  return 'ask';
}

/**
 * Registry and dispatcher for outbound integrations.
 *
 * Two rules hold everywhere in here:
 *   1. The local note in notedrop.json is authoritative and is written first.
 *      Nothing in this file may lose a note or block note-taking.
 *   2. One integration failing never affects another — every call is caught
 *      per-integration and recorded as pending for a later retry.
 */
export class IntegrationManager {
  private readonly integrations: Integration[];

  /** Serialises read-modify-write on integrations.json. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly store: Store) {
    this.integrations = [new ObsidianIntegration(() => this.getConfig().obsidian)];
  }

  /* ----------------------------------------------------------------------- */
  /* Configuration                                                            */
  /* ----------------------------------------------------------------------- */

  getConfig(): IntegrationsConfig {
    const saved = (this.store.getConfig(CONFIG_KEY) ?? {}) as Partial<IntegrationsConfig>;
    const obsidian = { ...DEFAULTS.obsidian, ...(saved.obsidian ?? {}) };
    obsidian.deleteOutbound = toDeleteMode(obsidian.deleteOutbound);
    obsidian.deleteInbound = obsidian.deleteInbound !== false;
    return { obsidian };
  }

  /**
   * What holds a copy of this note, and what should happen to each when it is
   * deleted here. Drives the confirmation prompt.
   */
  outboundDeletePlan(noteId: string) {
    const entry = this.readState().notes[noteId];
    if (!entry) return [];

    return this.integrations
      .filter((i) => i.isEnabled() && entry.refs[i.id])
      .map((i) => ({
        id: i.id,
        label: i.label,
        mode: i.outboundDeleteMode?.() ?? ('always' as DeleteMode),
      }));
  }

  /** Remember "Always" or "Never" chosen from the prompt. */
  setOutboundDeleteMode(integrationId: string, mode: DeleteMode) {
    if (integrationId === 'obsidian') {
      this.setConfig({ obsidian: { ...this.getConfig().obsidian, deleteOutbound: mode } });
    }
  }

  setConfig(patch: Partial<IntegrationsConfig>): IntegrationsConfig {
    const current = this.getConfig();
    const merged: IntegrationsConfig = {
      obsidian: { ...current.obsidian, ...(patch.obsidian ?? {}) },
    };
    this.store.setConfig(CONFIG_KEY, merged);
    return merged;
  }

  async test(id: string): Promise<TestResult> {
    const integration = this.integrations.find((i) => i.id === id);
    if (!integration) return { ok: false, message: `Unknown integration "${id}".` };

    try {
      return await integration.test();
    } catch (err) {
      return { ok: false, message: describe(err) };
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Dispatch                                                                 */
  /* ----------------------------------------------------------------------- */

  onNoteCreated(note: Note): Promise<void> {
    return this.enqueue(async () => {
      const enabled = this.integrations.filter((i) => i.isEnabled());
      if (enabled.length === 0) return;

      for (const integration of enabled) {
        await this.push(integration, note);
      }
    });
  }

  /**
   * @param skip integrations the user chose to leave their copy intact on.
   *             Their bookkeeping is still cleared — the note is gone here.
   */
  onNoteDeleted(id: string, text: string, skip: string[] = []): Promise<void> {
    return this.enqueue(async () => {
      const entry = this.readState().notes[id];
      if (!entry) return;

      const note: Note = { id, text, createdAt: entry.createdAt };
      const skipped = new Set(skip);

      for (const integration of this.integrations) {
        const ref = entry.refs[integration.id];
        if (!ref || skipped.has(integration.id)) continue;
        try {
          await integration.onNoteDeleted(note, ref);
        } catch (err) {
          // The local note is already gone, so there is nothing to retry
          // against later — surface it and move on rather than stranding
          // bookkeeping for a note that no longer exists.
          console.error(`[${integration.id}] failed to remove note ${id}:`, describe(err));
        }
      }

      this.updateState((state) => {
        delete state.notes[id];
      });
    });
  }

  /**
   * Re-attempt pushes that failed earlier (offline, vault unmounted, ...).
   * Called on startup.
   */
  retryPending(): Promise<void> {
    return this.enqueue(async () => {
      const state = this.readState();

      for (const [id, entry] of Object.entries(state.notes)) {
        if (!entry.pending?.length) continue;

        const text = this.store.get(id);
        if (typeof text !== 'string') {
          // Note was deleted before it ever synced — drop the bookkeeping.
          this.updateState((s) => {
            delete s.notes[id];
          });
          continue;
        }

        for (const integrationId of [...entry.pending]) {
          const integration = this.integrations.find((i) => i.id === integrationId);
          if (!integration?.isEnabled()) continue;
          await this.push(integration, { id, text, createdAt: entry.createdAt });
        }
      }
    });
  }

  /**
   * Pull in changes made on the far side: follow notes that were renamed or
   * moved, and drop notes whose file the user deleted there.
   *
   * Cheap enough to run every time the list is read — it only stats the paths
   * already recorded, and escalates to a vault scan only when one is missing.
   */
  reconcile(): Promise<void> {
    return this.enqueue(async () => {
      const state = this.readState();
      const noteIds = Object.keys(state.notes);
      if (noteIds.length === 0) return;

      for (const integration of this.integrations) {
        if (!integration.reconcile || !integration.isEnabled()) continue;

        const entries: ReconcileEntry[] = [];
        for (const noteId of noteIds) {
          const entry = state.notes[noteId];
          const ref = entry?.refs[integration.id];
          if (ref) entries.push({ noteId, createdAt: entry.createdAt, ref });
        }
        if (entries.length === 0) continue;

        let result;
        try {
          result = await integration.reconcile(entries);
        } catch (err) {
          console.error(`[${integration.id}] reconcile failed:`, describe(err));
          continue;
        }

        for (const [noteId, ref] of Object.entries(result.moved)) {
          this.updateState((s) => {
            const entry = s.notes[noteId];
            if (entry) entry.refs[integration.id] = ref;
          });
        }

        const mirrors = integration.mirrorsInboundDelete?.() ?? true;

        for (const noteId of result.gone) {
          if (mirrors) {
            await this.applyInboundDelete(noteId, integration.id);
            continue;
          }

          // Keeping the note, but the file it pointed at is gone for good.
          // Forget the ref, or every reconcile from here on would rescan the
          // whole vault looking for something that no longer exists.
          this.updateState((s) => {
            const entry = s.notes[noteId];
            if (!entry) return;
            delete entry.refs[integration.id];
            if (Object.keys(entry.refs).length === 0 && !entry.pending?.length) {
              delete s.notes[noteId];
            }
          });
        }
      }
    });
  }

  /* ----------------------------------------------------------------------- */
  /* Internals                                                                */
  /* ----------------------------------------------------------------------- */

  /**
   * A note was deleted on one integration's side. Remove it locally and, for
   * consistency with a NoteDrop-side delete, from the other targets too.
   */
  private async applyInboundDelete(noteId: string, reportedBy: string) {
    const entry = this.readState().notes[noteId];
    if (!entry) return;

    const text = this.store.get(noteId);
    const note: Note = {
      id: noteId,
      text: typeof text === 'string' ? text : '',
      createdAt: entry.createdAt,
    };

    this.store.delete(noteId);

    for (const integration of this.integrations) {
      if (integration.id === reportedBy) continue;
      const ref = entry.refs[integration.id];
      if (!ref) continue;

      // Only propagate to targets set to delete unconditionally. Reconcile
      // runs as the window opens, so this is no place to raise a prompt, and
      // deleting anyway would ignore the user's setting.
      if ((integration.outboundDeleteMode?.() ?? 'always') !== 'always') continue;

      try {
        await integration.onNoteDeleted(note, ref);
      } catch (err) {
        console.error(`[${integration.id}] failed to remove note ${noteId}:`, describe(err));
      }
    }

    this.updateState((s) => {
      delete s.notes[noteId];
    });
  }

  private async push(integration: Integration, note: Note) {
    try {
      const ref = await integration.onNoteCreated(note);
      this.updateState((state) => {
        const entry = (state.notes[note.id] ??= { createdAt: note.createdAt, refs: {} });
        entry.refs[integration.id] = ref;
        entry.pending = (entry.pending ?? []).filter((p) => p !== integration.id);
        if (entry.pending.length === 0) delete entry.pending;
      });
    } catch (err) {
      console.error(`[${integration.id}] failed to sync note ${note.id}:`, describe(err));
      this.updateState((state) => {
        const entry = (state.notes[note.id] ??= { createdAt: note.createdAt, refs: {} });
        entry.pending = [...new Set([...(entry.pending ?? []), integration.id])];
      });
    }
  }

  private readState(): IntegrationState {
    return this.store.getIntegrationState();
  }

  private updateState(mutate: (state: IntegrationState) => void) {
    const state = this.readState();
    mutate(state);
    this.store.setIntegrationState(state);
  }

  /**
   * Chain work so concurrent dispatches can't interleave their
   * read-modify-write cycles on integrations.json.
   */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work).catch((err) => {
      console.error('[integrations] dispatch failed:', describe(err));
    });
    this.queue = next;
    return next;
  }
}

function describe(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
