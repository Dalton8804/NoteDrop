import { app, nativeImage, Tray, BrowserWindow, Menu, MenuItemConstructorOptions, ipcMain } from 'electron';
import { default as path } from 'path';
import fs from 'fs';
import os from 'os';


var tray: Tray;
var win: BrowserWindow;
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
      role: 'quit',
      accelerator: 'Command+Q'
    } as MenuItemConstructorOptions
  ];

  tray.popUpContextMenu(Menu.buildFromTemplate(menu));
}

ipcMain.on('save-user-data', (event, filePath, data) => {
  if (filePath.startsWith('~')) {
    filePath = path.join(os.homedir(), filePath.slice(1));
  }
  fs.writeFile(filePath, data, (err) => {
    if (err) console.error('Error writing file:', err);
  });
});

ipcMain.handle('read-user-data', async (event, filePath) => {
  if (filePath.startsWith('~')) {
    filePath = path.join(os.homedir(), filePath.slice(1));
  }

  try {
    return fs.readFileSync(filePath).toString();
  } catch (err) {
    return null;
  }
});

app.whenReady().then(() => {
  createWindow()
  createTray();
})

app.dock.hide();


