import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationsConfig } from "./integrations/types";

contextBridge.exposeInMainWorld('data', {
    save: (key: string, value: string) => ipcRenderer.send('save', key, value),
    get: (key: string) => ipcRenderer.invoke('get', key),
    getAll: () => ipcRenderer.invoke('getAll'),
    delete: (key: string) => ipcRenderer.send('delete', key),
    onRefresh: (callback: () => void) => ipcRenderer.on('notes:refresh', () => callback()),
});

contextBridge.exposeInMainWorld('integrations', {
    getConfig: () => ipcRenderer.invoke('integrations:getConfig'),
    setConfig: (patch: Partial<IntegrationsConfig>) => ipcRenderer.invoke('integrations:setConfig', patch),
    test: (id: string) => ipcRenderer.invoke('integrations:test', id),
    pickVault: () => ipcRenderer.invoke('integrations:pickVault'),
});
