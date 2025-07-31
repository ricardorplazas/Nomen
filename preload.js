// preload.js - The Bridge

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Main App Functions ---
  openPromptsWindow: () => ipcRenderer.send('open-prompts-window'),
  openKeysWindow: () => ipcRenderer.send('open-keys-window'),
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  
  // --- Renamer Functions ---
  processFiles: (data) => ipcRenderer.send('process-files', data),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
  onProcessingComplete: (callback) => ipcRenderer.on('processing-complete', callback),

  // --- Sorter Functions ---
  indexFolder: (data) => ipcRenderer.send('index-folder', data),
  onFolderIndexed: (callback) => ipcRenderer.on('folder-indexed', (event, ...args) => callback(...args)),
  onIndexingComplete: (callback) => ipcRenderer.on('indexing-complete', (event, ...args) => callback(...args)),
  moveFile: (data) => ipcRenderer.invoke('move-file', data),
  processSorting: (data) => ipcRenderer.send('process-sorting', data),
  onSortSuggestion: (callback) => ipcRenderer.on('sort-suggestion', (event, ...args) => callback(...args)),
  onSortingComplete: (callback) => ipcRenderer.on('sorting-complete', callback),

  // --- Settings & Data ---
  fetchModels: (data) => ipcRenderer.invoke('fetch-models', data),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  getPrompts: () => ipcRenderer.invoke('get-prompts'),
  savePrompts: (prompts) => ipcRenderer.send('save-prompts', prompts),
  onPromptsUpdated: (callback) => ipcRenderer.on('prompts-updated', callback),
  getKeys: () => ipcRenderer.invoke('get-keys'),
  saveKeys: (keys) => ipcRenderer.send('save-keys', keys),
  onKeysUpdated: (callback) => ipcRenderer.on('keys-updated', callback),
  
  // --- Theme ---
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.send('set-theme', theme),
  onThemeUpdated: (callback) => ipcRenderer.on('theme-updated', (event, ...args) => callback(...args)),
});
