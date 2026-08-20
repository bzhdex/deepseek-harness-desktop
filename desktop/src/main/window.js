'use strict'

/**
 * Main window: a fixed "app frame" around the locally-served harness Web UI.
 * It shows a local splash while the server boots, loads the server URL when
 * ready, and falls back to a local error page if the server dies or the page
 * cannot load.
 */

const path = require('node:path')
const { BrowserWindow, shell, nativeImage } = require('electron')
const log = require('./log')
const paths = require('./paths')

let mainWindow = null
/** Whether the user actually wants to quit (vs. hide to tray). */
let quitting = false

function rendererDir() {
  return path.join(__dirname, '..', 'renderer')
}

function trayIconPath() {
  return path.join(paths.resourcesRoot(), 'icons', 'tray.png')
}

/**
 * @param {{ onClosed?: () => void }} opts
 * @returns {BrowserWindow}
 */
function createMainWindow(opts = {}) {
  const windowIcon = nativeImage.createFromPath(trayIconPath())

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    icon: windowIcon,
    autoHideMenuBar: true,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // Keep navigation inside the harness origin; anything else opens externally.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isHarnessUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isHarnessUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // A renderer that fails to load (server crash) gets the error page.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame) return
    log.error(`renderer failed to load: ${code} ${desc}`)
    showError(`页面加载失败（${code} ${desc}）`)
  })

  mainWindow.on('close', (event) => {
    // Close = minimize to tray; only an explicit quit closes for real.
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
      return
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    if (opts.onClosed) opts.onClosed()
  })

  return mainWindow
}

/** @param {string} url */
function isHarnessUrl(url) {
  return /^https?:\/\/127\.0\.0\.1(:\d+)?\//.test(url) || url.startsWith('file://')
}

function getMainWindow() {
  return mainWindow
}

function showSplash() {
  if (!mainWindow) return
  void mainWindow.loadFile(path.join(rendererDir(), 'splash.html'))
  mainWindow.show()
}

function showApp(url) {
  if (!mainWindow) return
  void mainWindow.loadURL(url)
  mainWindow.show()
}

function showError(message) {
  if (!mainWindow) return
  const detail = encodeURIComponent(message || '未知错误')
  void mainWindow.loadFile(path.join(rendererDir(), 'error.html'), { query: { detail } })
  mainWindow.show()
}

function setQuitting(value) {
  quitting = value
}

function restore() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

module.exports = {
  createMainWindow,
  getMainWindow,
  showSplash,
  showApp,
  showError,
  setQuitting,
  restore,
  isHarnessUrl,
  rendererDir,
}
