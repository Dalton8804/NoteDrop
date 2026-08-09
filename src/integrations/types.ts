/**
 * Shared types for the integration layer.
 *
 * An integration is a one-way outbound target for notes: when a note is
 * created it gets pushed out, and when it is deleted the push is undone.
 * Every target implements `Integration` and nothing else, so adding one
 * (Notion, Things, a webhook) never touches the dispatch code.
 */

export interface Note {
  id: string;
  text: string;
  /** ISO 8601. Recorded when the note is first synced. */
  createdAt: string;
}

/**
 * Whatever an integration needs to find the thing it created again, so it can
 * remove it later. Obsidian stores `{ path }`, Notion will store `{ pageId }`.
 */
export type Ref = Record<string, string>;

export type TestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface Integration {
  /** Stable key. Used in config and in stored refs — never rename. */
  readonly id: string;
  readonly label: string;

  isEnabled(): boolean;

  /** Powers the "Test" button in settings. Must not throw. */
  test(): Promise<TestResult>;

  /** Push a new note outward. Returns the ref needed to undo it. */
  onNoteCreated(note: Note): Promise<Ref>;

  /** Undo a previous push. Treat "already gone" as success. */
  onNoteDeleted(note: Note, ref: Ref): Promise<void>;

  /**
   * Optional inbound check: has anything been moved or deleted on the far
   * side since we last looked?
   *
   * Contract: only report `gone` when the search was conclusive. If the far
   * side is unreachable or the scan was incomplete, return nothing — a note
   * that cannot be found is not the same as a note that was deleted, and
   * guessing wrong destroys the user's data.
   */
  reconcile?(entries: ReconcileEntry[]): Promise<ReconcileResult>;

  /**
   * Should a note the user deleted on the far side be removed from NoteDrop?
   * Defaults to true when not implemented.
   *
   * `reconcile` always reports what it found; this decides what is done about
   * it, so the finding stays separate from the policy.
   */
  mirrorsInboundDelete?(): boolean;

  /**
   * Whether deleting a note in NoteDrop should delete the far-side copy,
   * or ask first. Defaults to `always` when not implemented.
   */
  outboundDeleteMode?(): DeleteMode;
}

export interface ReconcileEntry {
  noteId: string;
  /** ISO 8601, from the note's sync state. */
  createdAt: string;
  ref: Ref;
}

export interface ReconcileResult {
  /** Notes found somewhere new — noteId to its updated ref. */
  moved: Record<string, Ref>;
  /** Notes confirmed removed on the far side. */
  gone: string[];
}

/* -------------------------------------------------------------------------- */
/* Per-integration configuration (persisted in config.json)                    */
/* -------------------------------------------------------------------------- */

/**
 * What to do with the far-side copy when a note is deleted in NoteDrop.
 * `ask` prompts once per deletion; the prompt can write `always` or `never`.
 */
export type DeleteMode = 'ask' | 'always' | 'never';

export interface ObsidianConfig {
  enabled: boolean;
  /** Absolute path to the vault's top-level folder. */
  vaultPath: string;
  /** Folder inside the vault that notes are written to. */
  subfolder: string;
  /** Filename pattern. Supports {date} {time} {title} {slug}; ".md" is added. */
  filenameTemplate: string;
  /** What happens to the vault file when a note is deleted in NoteDrop. */
  deleteOutbound: DeleteMode;
  /**
   * Deleting a file in the vault also removes the note from NoteDrop.
   * No prompt is possible here — the deletion happens in another app, and
   * there is nothing to interrupt.
   */
  deleteInbound: boolean;
}

export interface IntegrationsConfig {
  obsidian: ObsidianConfig;
}

/* -------------------------------------------------------------------------- */
/* Sync bookkeeping (persisted in integrations.json, alongside notedrop.json)  */
/* -------------------------------------------------------------------------- */

export interface NoteSyncState {
  createdAt: string;
  /** integration id -> ref returned by that integration */
  refs: Record<string, Ref>;
  /** integration ids whose push failed and should be retried */
  pending?: string[];
}

export interface IntegrationState {
  notes: Record<string, NoteSyncState>;
}
