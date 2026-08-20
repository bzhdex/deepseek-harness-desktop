'use strict'

/**
 * Preload: expose a tiny, read-only surface to the local shell pages
 * (splash / error). The harness UI itself runs in a sandboxed renderer and is
 * given no privileged access.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  // Used by the local error page to ask the main process to restart the server.
  restart: () => ipcRenderer.send('dsh:restart'),
  // Used by the local error page to quit the app cleanly.
  quit: () => ipcRenderer.send('dsh:quit'),
})
