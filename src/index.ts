import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { Store } from './store';
import { IntegrationManager } from './integrations/manager';
import { IntegrationsConfig } from './integrations/types';
import os from 'os';
import { default as path } from 'path';


var tray: Tray;
var win: BrowserWindow;
var settingsWin: BrowserWindow | null = null;
// The note window hides on blur. A dialog attached to it steals focus, which
// would hide the window out from under its own sheet, so suppress while open.
var modalDepth = 0;
var store = new Store();
var integrations = new IntegrationManager(store);

function createWindow() {
  win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#424242',
    width: 377,
    height: 165,
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    skipTaskbar: true,
  })

  app.setPath('userData', os.homedir()+"/.notedrop");

  win.loadFile('public/index.html')
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    app.focus({ steal: true });
    return;
  }

  settingsWin = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'NoteDrop Settings',
    backgroundColor: '#424242',
    width: 460,
    height: 470,
    minWidth: 420,
    minHeight: 380,
    show: false,
    minimizable: false,
    maximizable: false,
  });

  settingsWin.loadFile('public/settings.html');

  // Deliberately no blur listener here — unlike the note window, settings
  // must stay open while you use a folder picker or switch to Obsidian.
  settingsWin.once('ready-to-show', () => {
    settingsWin?.show();
    // The app hides its dock icon, so it needs to steal focus explicitly or
    // the window opens behind whatever you were using.
    app.focus({ steal: true });
  });

  settingsWin.on('closed', () => { settingsWin = null; });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.resolve(__dirname, '../public/assets/trayIconLightMode.png'));

  tray = new Tray(icon);
  tray.setIgnoreDoubleClickEvents(true);

  tray.on('click', toggleWindow);
  tray.on('right-click', rightClickMenu);
}

function toggleWindow() {
  if (win.isVisible()) {
    win.hide();
  } else {
    const winBounds = win.getBounds();
    const trayBounds = tray.getBounds();
    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (winBounds.width / 2));
    const y = Math.round(trayBounds.y + trayBounds.height);

    win.setPosition(x, y);
    win.show();
    win.focus();
  }
}

function rightClickMenu() {
  const menu = [
    {
        label: 'Integrations…',
        click: openSettings
    } as MenuItemConstructorOptions,
    {
        type: 'separator'
    } as MenuItemConstructorOptions,
    {
        label: 'Launch at startup',
        type: 'checkbox',
        checked: store.getConfig('launchAtStartup'),
        click: (e) => {
            store.setConfig('launchAtStartup', e.checked);
            app.setLoginItemSettings({
                openAtLogin: e.checked,
            });
        }
    } as MenuItemConstructorOptions,
    {
        type: 'separator'
    } as MenuItemConstructorOptions,
    {
      role: 'quit',
      accelerator: 'Command+Q'
    } as MenuItemConstructorOptions,
  ];

  win.hide();

  tray.popUpContextMenu(Menu.buildFromTemplate(menu));
}

ipcMain.on('save', (event, key, value) => {
  // Local write first and always — integrations are best-effort on top of it.
  store.set(key, value);
  void integrations.onNoteCreated({
    id: key,
    text: value,
    createdAt: new Date().toISOString(),
  });
});

ipcMain.handle('getAll', async (event) => {
  // Catch up on anything deleted or moved on the far side before answering,
  // so the list is right on first paint. Normally this is a handful of stat
  // calls; it only scans the vault when a recorded file has gone missing.
  await integrations.reconcile();
  return store.getAll();
});

ipcMain.handle('get', async (event, key) => {
  return store.get(key);
});

/** Ask whether the far-side copy should go too. Returns the button chosen. */
async function askAboutDelete(label: string) {
  const choices = ['yes', 'no', 'always', 'never'] as const;

  modalDepth++;
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message: `Also delete this note in ${label}?`,
      // Worth keeping the first clause: without it, "No" reads as if it might
      // cancel the whole deletion.
      detail: `The note is already deleted here. Always and Never apply from now on.`,
      buttons: ['Yes', 'No', 'Always', 'Never'],
      defaultId: 0,
      cancelId: 1, // dismissing must not delete anything
      noLink: true,
    });
    return choices[response] ?? 'no';
  } finally {
    modalDepth--;
  }
}

ipcMain.on('delete', async (event, key) => {
  // Read the text and the plan before dropping the note — both describe a
  // note that is about to stop existing locally.
  const text = store.get(key);
  const plan = integrations.outboundDeletePlan(key);

  // The local delete is immediate either way; the prompt is only ever about
  // the copies elsewhere.
  store.delete(key);

  const skip: string[] = [];
  for (const target of plan) {
    if (target.mode === 'always') continue;
    if (target.mode === 'never') {
      skip.push(target.id);
      continue;
    }

    const choice = await askAboutDelete(target.label);
    if (choice === 'no' || choice === 'never') skip.push(target.id);
    if (choice === 'always' || choice === 'never') {
      integrations.setOutboundDeleteMode(target.id, choice);
    }
  }

  void integrations.onNoteDeleted(key, typeof text === 'string' ? text : '', skip);
})

ipcMain.handle('integrations:getConfig', async () => {
  return integrations.getConfig();
});

ipcMain.handle('integrations:setConfig', async (event, patch: Partial<IntegrationsConfig>) => {
  return integrations.setConfig(patch ?? {});
});

ipcMain.handle('integrations:test', async (event, id: string) => {
  return integrations.test(id);
});

ipcMain.handle('integrations:pickVault', async () => {
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  const result = parent
    ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });

  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  win.addListener("blur", () => { if (modalDepth === 0) win.hide(); });

  // The window is hidden and re-shown rather than reloaded, so the renderer
  // needs a nudge to pick up changes made in the vault while it was away.
  win.addListener("show", () => win.webContents.send('notes:refresh'));

  globalShortcut.register("Alt+Shift+o", () => win.show())

  // Drain anything that failed to sync while the vault was unavailable.
  void integrations.retryPending();
})

app.dock.hide();

