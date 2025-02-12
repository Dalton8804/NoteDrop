import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const datafile = 'notedrop.json';
const configfile = 'config.json';
class Store {

  getAll() {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    return this._getAll(dataPath);
  }

  private _getAll(filepath: string) {
    const json = fs.readFileSync(filepath, 'utf8');
    return json;
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
    const json = fs.readFileSync(filepath, 'utf8');
    const parsedjson = JSON.parse(json);
    return parsedjson[key];
  }

  setConfig(key: string, value: string | boolean) {
    const configPath = this.getValidatedPath(app.getPath('userData'), configfile);
    this._set(key, value, configPath);
  }

  set(key: string, value: string) {
    const dataPath = this.getValidatedPath(app.getPath('userData'), datafile);
    this._set(key, value, dataPath);
  }

  private _set(key: string, value: string | boolean, filepath: string) {
    const json = fs.readFileSync(filepath, 'utf8');
    const parsedjson = JSON.parse(json);
    parsedjson[key] = value;
    const newjson = JSON.stringify(parsedjson);
    fs.writeFileSync(filepath, newjson);
  }

  delete(key: string) {
    const configPath = this.getValidatedPath(app.getPath('userData'), datafile)
    const configJson = fs.readFileSync(configPath, 'utf8');
    const configJs = JSON.parse(configJson);
    delete configJs[key];
    const newConfigJson = JSON.stringify(configJs);
    fs.writeFileSync(configPath, newConfigJson);
  }

  getValidatedPath(dirpath: string, filename: string): string {
    if (!fs.existsSync(dirpath)){
        fs.mkdirSync(dirpath);
    }

    const fullpath = path.join(dirpath, filename);
    if (!fs.existsSync(fullpath)) {
      fs.writeFileSync(fullpath, '{}');
      fs.chmod(fullpath, 0o777, (err) => {
              console.error("Error setting file permissions: "+err);
      });
    }

    return fullpath;
  }
}

export { Store };
