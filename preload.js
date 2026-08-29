
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tutas', {
  loadData: ()=>ipcRenderer.invoke('load-data'),
  saveData: data=>ipcRenderer.invoke('save-data',data),
  printerList: ()=>ipcRenderer.invoke('printer-list'),
  printLabels: (html,copies)=>ipcRenderer.invoke('print-labels',html,copies)
});
