import fs from 'fs';
import path from 'path';
import {
  Integration,
  Note,
  ObsidianConfig,
  ReconcileEntry,
  ReconcileResult,
  Ref,
  TestResult,
} from './types';

/**
 * An Obsidian vault is just a folder of markdown files, so this integration
 * needs no API and no credentials — it writes .md files and Obsidian picks
 * them up live.
 */
export class ObsidianIntegration implements Integration {
  readonly id = 'obsidian';
  readonly label = 'Obsidian';

  constructor(private readonly config: () => ObsidianConfig) {}

  isEnabled() {
    const cfg = this.config();
    return cfg.enabled && !!cfg.vaultPath;
  }

  async test(): Promise<TestResult> {
    const cfg = this.config();

    const vault = this.checkVault(cfg);
    if (!vault.ok) return vault;

    const target = this.targetDir(cfg);
    try {
      await fs.promises.mkdir(target, { recursive: true });
      await fs.promises.access(target, fs.constants.W_OK);
    } catch (err) {
      return { ok: false, message: `Can't write to ${target}\n${describe(err)}` };
    }

    const example = renderFilename(cfg.filenameTemplate, {
      id: 'example',
      text: 'Buy oat milk',
      createdAt: new Date().toISOString(),
    });
    return { ok: true, message: `Saving to ${target}\nExample: ${example}.md` };
  }

  async onNoteCreated(note: Note): Promise<Ref> {
    const cfg = this.config();

    // Confirm the vault is really there before creating anything. Without
    // this, a vault on an unmounted drive would be silently rebuilt by the
    // recursive mkdir below and notes would be filed into a phantom tree
    // that Obsidian never sees — and that shadows the real vault when the
    // drive comes back. Failing here marks the note pending for retry.
    const vault = this.checkVault(cfg);
    if (!vault.ok) throw new Error(vault.message);

    const target = this.targetDir(cfg);
    await fs.promises.mkdir(target, { recursive: true });

    const basename = renderFilename(cfg.filenameTemplate, note);
    const contents =
      '---\n' +
      `created: ${note.createdAt}\n` +
      `notedrop-id: ${note.id}\n` +
      '---\n' +
      '\n' +
      `${note.text}\n`;

    const filepath = await writeUnique(target, basename, contents);

    // The inode is what makes renames and moves cheap to follow later: it
    // survives both within a volume, and matching on it needs only stat —
    // no file reads, so a cloud-backed vault is never forced to download.
    const ino = await inodeOf(filepath);
    return ino ? { path: filepath, ino: String(ino) } : { path: filepath };
  }

  mirrorsInboundDelete() {
    return this.config().deleteInbound;
  }

  outboundDeleteMode() {
    return this.config().deleteOutbound;
  }

  // Whether to delete at all is settled before this is called — either by the
  // stored mode or by asking the user — so getting here means "do it".
  async onNoteDeleted(_note: Note, ref: Ref): Promise<void> {
    if (!ref.path) return;
    try {
      await fs.promises.unlink(ref.path);
    } catch (err) {
      // Already deleted (or moved) in the vault — nothing left to undo.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  /**
   * Find notes whose file was renamed, moved, or deleted inside the vault.
   *
   * Tiered so the common case costs nothing: only notes whose recorded path
   * has gone missing trigger a scan, and the scan is one batched pass for
   * all of them rather than one pass each.
   */
  async reconcile(entries: ReconcileEntry[]): Promise<ReconcileResult> {
    const nothing: ReconcileResult = { moved: {}, gone: [] };
    const cfg = this.config();

    // An unavailable vault makes every file look deleted at once. Conclude
    // nothing rather than mass-deleting the user's notes.
    if (!this.checkVault(cfg).ok) return nothing;

    // Tier 0 — stat the recorded paths. O(notes in NoteDrop), not O(vault).
    const missing: ReconcileEntry[] = [];
    for (const entry of entries) {
      if (!entry.ref.path) continue;
      if (!(await exists(entry.ref.path))) missing.push(entry);
    }
    if (missing.length === 0) return nothing;

    // Tier 1 — one stat-only walk, matched by inode. No file contents read.
    let files: VaultFile[];
    try {
      files = await walkMarkdown(cfg.vaultPath);
    } catch (err) {
      // A partial listing can't prove anything is gone.
      console.error('[obsidian] vault scan failed, reconciling nothing:', describe(err));
      return nothing;
    }

    const byInode = new Map<number, VaultFile>();
    for (const file of files) byInode.set(file.ino, file);

    const moved: Record<string, Ref> = {};
    const unresolved: ReconcileEntry[] = [];

    for (const entry of missing) {
      const ino = Number(entry.ref.ino);
      const hit = ino ? byInode.get(ino) : undefined;
      if (hit) moved[entry.noteId] = { path: hit.path, ino: String(hit.ino) };
      else unresolved.push(entry);
    }
    if (unresolved.length === 0) return { moved, gone: [] };

    // Tier 2 — the file may have been recreated with a new inode by a sync
    // client, so fall back to the notedrop-id in its frontmatter. Only the
    // first 256 bytes are read, and files older than the oldest note we are
    // looking for cannot be any of them, so most of an established vault is
    // skipped. The day of margin keeps clock skew from causing a false
    // "deleted", which would cost the user a note.
    const oldest = unresolved.reduce(
      (min, e) => Math.min(min, Date.parse(e.createdAt) || Date.now()),
      Date.now(),
    );
    const floor = oldest - 24 * 60 * 60 * 1000;

    const wanted = new Set(unresolved.map((e) => e.noteId));
    const found = new Map<string, VaultFile>();

    for (const file of files) {
      if (wanted.size === 0) break;
      if (file.mtimeMs < floor) continue;
      const id = await readNoteDropId(file.path);
      if (id && wanted.has(id)) {
        found.set(id, file);
        wanted.delete(id);
      }
    }

    const gone: string[] = [];
    for (const entry of unresolved) {
      const hit = found.get(entry.noteId);
      if (hit) moved[entry.noteId] = { path: hit.path, ino: String(hit.ino) };
      else gone.push(entry.noteId);
    }

    return { moved, gone };
  }

  /** Is the configured path present and actually an Obsidian vault? */
  private checkVault(cfg: ObsidianConfig): TestResult {
    if (!cfg.vaultPath) {
      return { ok: false, message: 'Choose your Obsidian vault folder first.' };
    }
    if (!fs.existsSync(cfg.vaultPath)) {
      return { ok: false, message: `That folder no longer exists:\n${cfg.vaultPath}` };
    }
    if (!fs.existsSync(path.join(cfg.vaultPath, '.obsidian'))) {
      return {
        ok: false,
        message:
          "That folder isn't an Obsidian vault — it has no .obsidian folder " +
          "inside. Pick the vault's top-level folder.",
      };
    }
    return { ok: true, message: '' };
  }

  private targetDir(cfg: ObsidianConfig) {
    return path.join(cfg.vaultPath, cfg.subfolder || 'NoteDrop');
  }
}

/**
 * Create the file with an exclusive flag and step the suffix on collision, so
 * two notes added in the same second can't clobber each other.
 */
async function writeUnique(dir: string, basename: string, contents: string): Promise<string> {
  for (let n = 1; n <= 100; ++n) {
    const filepath = path.join(dir, n === 1 ? `${basename}.md` : `${basename}-${n}.md`);
    try {
      await fs.promises.writeFile(filepath, contents, { encoding: 'utf8', flag: 'wx' });
      return filepath;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Gave up finding a free filename for "${basename}" in ${dir}`);
}

interface VaultFile {
  path: string;
  ino: number;
  mtimeMs: number;
}

async function exists(filepath: string) {
  try {
    await fs.promises.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function inodeOf(filepath: string) {
  try {
    return (await fs.promises.stat(filepath)).ino;
  } catch {
    return 0;
  }
}

/**
 * Every markdown file in the vault, with the stat data needed to identify it.
 * Symlinks are not followed, so a link back into the vault can't loop.
 * Throws if any directory can't be listed — an incomplete picture must not be
 * mistaken for "these files are gone".
 */
async function walkMarkdown(dir: string, out: VaultFile[] = []): Promise<VaultFile[]> {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkMarkdown(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const stat = await fs.promises.stat(full);
        out.push({ path: full, ino: stat.ino, mtimeMs: stat.mtimeMs });
      } catch {
        // Vanished mid-walk. It is not a candidate, but its absence says
        // nothing about the notes we are looking for.
      }
    }
  }
  return out;
}

/** Read just the frontmatter looking for `notedrop-id`. */
async function readNoteDropId(filepath: string): Promise<string | null> {
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(filepath, 'r');
    const buf = Buffer.alloc(256);
    const { bytesRead } = await handle.read(buf, 0, 256, 0);
    const match = /^notedrop-id:\s*(\S+)\s*$/m.exec(buf.subarray(0, bytesRead).toString('utf8'));
    return match ? match[1] : null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

export const DEFAULT_FILENAME_TEMPLATE = '{date}-{slug}';

/**
 * Build a filename from the user's pattern. Unknown tokens are left as-is so
 * a typo shows up in the name rather than silently vanishing.
 */
export function renderFilename(template: string, note: Note) {
  const parsed = new Date(note.createdAt);
  const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (n: number) => String(n).padStart(2, '0');

  const tokens: Record<string, string> = {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`,
    title: note.text.replace(/\s+/g, ' ').trim().slice(0, 60),
    slug: slugify(note.text),
  };

  const filled = (template || DEFAULT_FILENAME_TEMPLATE).replace(
    /\{(\w+)\}/g,
    (whole, key: string) => tokens[key.toLowerCase()] ?? whole,
  );

  return sanitizeFilename(filled);
}

function sanitizeFilename(name: string) {
  const cleaned = stripIllegal(name)
    .replace(/\.md$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    // A leading dot would hide the file from Obsidian completely.
    .replace(/^[.\-\s]+/, '')
    .slice(0, 120)
    .replace(/[.\-\s]+$/, '');

  return cleaned || 'note';
}

/**
 * Remove characters that are illegal in filenames, and turn path separators
 * into hyphens — nesting is what the Folder setting is for, and a separator
 * here would also be a way to write outside the vault.
 */
function stripIllegal(name: string) {
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20) continue;
    if ('<>:"|?*'.includes(ch)) continue;
    out += ch === '/' || ch === '\\' ? '-' : ch;
  }
  return out;
}

function slugify(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return slug || 'note';
}

function describe(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
