const { app, BrowserWindow } = require('electron');
const TrayGenerator = require('./traygen');

let mainWindow = null;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    backgroundColor: '#424242',
    width: 377,
    height: 165,
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    skipTaskbar: true,
  });

  mainWindow.loadFile('./src/menubar-client/dist/index.html');

};

app.on('ready', () => {
  createMainWindow();
  const Tray = new TrayGenerator(mainWindow, app);
  Tray.createTray();
});
app.dock.hide();


