import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { IntegrationState } from './integrations/types';

const datafile = 'notedrop.json';
const configfile = 'config.json';
const integrationsfile = 'integrations.json';

class Store {

  getAll() {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    return this._getAll(dataPath);
  }

  private _getAll(filepath: string) {
    // The renderer parses this itself, but round-trip through _read so a
    // corrupt file yields an empty list instead of throwing.
    return JSON.stringify(this._read(filepath));
  }

  getConfig(key: string) {
    const configPath = this.getValidatedPath(app.getPath('userData'), configfile);
    return this._get(key, configPath);
  }

  get(key: string) {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    return this._get(key, dataPath);
  }

  private _get(key: string, filepath: string) {
    return this._read(filepath)[key];
  }

  setConfig(key: string, value: unknown) {
    const configPath = this.getValidatedPath(app.getPath('userData'), configfile);
    this._set(key, value, configPath);
  }

  set(key: string, value: string) {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    this._set(key, value, dataPath);
  }

  private _set(key: string, value: unknown, filepath: string) {
    const parsed = this._read(filepath);
    parsed[key] = value;
    this._write(filepath, parsed);
  }

  delete(key: string) {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    const parsed = this._read(dataPath);
    delete parsed[key];
    this._write(dataPath, parsed);
  }

  /** Sync bookkeeping for outbound integrations. See integrations/types.ts. */
  getIntegrationState(): IntegrationState {
    const statePath = this.getValidatedPath(app.getPath('userData'), integrationsfile);
    const parsed = this._read(statePath);
    if (typeof parsed.notes !== 'object' || parsed.notes === null) parsed.notes = {};
    return parsed as IntegrationState;
  }

  setIntegrationState(state: IntegrationState) {
    const statePath = this.getValidatedPath(app.getPath('userData'), integrationsfile);
    this._write(statePath, state);
  }

  private _read(filepath: string): Record<string, any> {
    try {
      const parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      return parsed;
    } catch (err) {
      // A corrupt or unreadable file must not take the app down — an empty
      // object degrades to "no data" and the next write repairs it.
      console.error(`Could not read ${filepath}:`, err);
      return {};
    }
  }

  /** Write via a temp file + rename so a crash mid-write can't truncate data. */
  private _write(filepath: string, value: unknown) {
    const tmp = `${filepath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filepath);
  }

  getValidatedPath(dirpath: string, filename: string): string {
    if (!fs.existsSync(dirpath)){
        fs.mkdirSync(dirpath, { recursive: true });
    }

    const fullpath = path.join(dirpath, filename);
    if (!fs.existsSync(fullpath)) {
      // 0600: these live in the user's home directory and integrations.json
      // records where their notes have been filed.
      fs.writeFileSync(fullpath, '{}', { encoding: 'utf8', mode: 0o600 });
    } else {
      this.tighten(fullpath);
    }

    return fullpath;
  }

  /** Earlier versions created these files 0777. Repair them in place. */
  private tighten(filepath: string) {
    try {
      if ((fs.statSync(filepath).mode & 0o077) !== 0) {
        fs.chmodSync(filepath, 0o600);
      }
    } catch (err) {
      console.error(`Could not tighten permissions on ${filepath}:`, err);
    }
  }
}

export { Store };
