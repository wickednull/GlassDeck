'use strict'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)

function subscribe (channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('glassdeck', {
  // reads
  getState: () => invoke('state:get'),
  readLog: (id) => invoke('log:read', { id }),

  // library
  scan: () => invoke('scan'),
  launch: (id, extractMode = false) => invoke('app:launch', { id, extractMode }),
  stop: (id) => invoke('app:stop', { id }),
  favorite: (id, value) => invoke('app:favorite', { id, value }),
  rename: (id, name) => invoke('app:rename', { id, name }),
  fixExecutable: (id) => invoke('app:fix-exec', { id }),
  reveal: (id) => invoke('app:reveal', { id }),
  remove: (id) => invoke('app:remove', { id }),
  clearHidden: () => invoke('app:clear-hidden'),
  refresh: (id) => invoke('app:refresh', { id }),
  pickIcon: (id) => invoke('app:icon:pick', { id }),
  resetIcon: (id) => invoke('app:icon:reset', { id }),

  // import
  importApps: () => invoke('apps:import'),
  addPaths: (paths) => invoke('apps:add-paths', { paths }),
  addFolder: () => invoke('folder:add'),
  removeFolder: (folder) => invoke('folder:remove', { folder }),

  // settings
  updateSettings: (patch) => invoke('settings:update', patch),

  // window
  minimize: () => invoke('win:minimize'),
  toggleMaximize: () => invoke('win:toggle-max'),
  close: () => invoke('win:close'),
  isMaximized: () => invoke('win:is-max'),

  // misc
  openExternal: (url) => invoke('shell:open', { url }),
  copyText: (text) => invoke('clipboard:write', { text }),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  },

  // events
  onState: (cb) => subscribe('state', cb),
  onProgress: (cb) => subscribe('scan:progress', cb),
  onToast: (cb) => subscribe('toast', cb),
  onLaunchFailed: (cb) => subscribe('launch:failed', cb),
  onMaximized: (cb) => subscribe('window:maximized', cb),
})
