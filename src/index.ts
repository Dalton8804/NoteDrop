import { app, nativeImage, Tray, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import { default as path } from 'path';


var tray: Tray;
var win: BrowserWindow;
function createWindow() {
  win = new BrowserWindow({
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



app.whenReady().then(() => {
  createWindow()
  createTray();
})

app.dock.hide();


