import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld('data', {
    save: (key: string, value: string) => ipcRenderer.send('save', key, value),
    get: (key: string) => ipcRenderer.invoke('get', key),
    getAll: () => ipcRenderer.invoke('getAll'), 
    delete: (key: string) => ipcRenderer.send('delete', key),
});
