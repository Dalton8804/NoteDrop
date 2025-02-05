const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveUserData: (filePath: string, data: string) => ipcRenderer.send('save-user-data', filePath, data),
  readUserData: (filePath: string) => ipcRenderer.invoke('read-user-data', filePath),
});