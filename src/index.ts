import { app, BrowserWindow, globalShortcut, ipcMain, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { Store } from './store';
import os from 'os';
import { default as path } from 'path';


var tray: Tray;
var win: BrowserWindow;
var store = new Store();

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
  store.set(key, value);
});

ipcMain.handle('getAll', async (event) => {
  return store.getAll();
});

ipcMain.handle('get', async (event, key) => {
  return store.get(key);
});

ipcMain.on('delete', (event, key) => {
  store.delete(key);
})

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  win.addListener("blur", () => win.hide());

  globalShortcut.register("Alt+Shift+o", () => win.show())
})

app.dock.hide();

