'use strict'

/**
 * DeepSeek Harness Desktop — Electron main process.
 *
 * Responsibilities: single-instance lock, persistent user-data layout,
 * harness server lifecycle, main window + tray, and clean teardown.
 * This is a pure shell: every harness feature is served unchanged by the
 * bundled `dsh web` process.
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const log = require('./log')
const paths = require('./paths')
const { DshProcess } = require('./dsh-process')
const window = require('./window')
const tray = require('./tray')
const updater = require('./updater')

// Configure userData before anything reads it, and before `ready`.
paths.configureUserData()
log.init(app.getPath('userData'))

const dsh = new DshProcess()
let quitting = false
let restarting = false

/** Start (or restart) the harness server and point the window at it. */
async function startHarness() {
  window.showSplash()
  try {
    const url = await dsh.start()
    tray.refresh(url)
    window.showApp(url)
    updater.schedule()
  } catch (err) {
    log.error('harness failed to start:', err && err.stack ? err.stack : String(err))
    window.showError(err && err.message ? err.message : String(err))
  }
}

ipcMain.on('dsh:restart', () => {
  if (quitting) return
  log.info('restart requested')
  restarting = true
  window.showSplash()
  dsh.stop()
    .catch((err) => log.error('error stopping harness:', err && err.message))
    .finally(() => {
      restarting = false
      void startHarness()
    })
})

ipcMain.on('dsh:quit', () => {
  window.setQuitting(true)
  app.quit()
})

// One instance only: a second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    window.restore()
  })

  app.whenReady().then(() => {
    log.info(`DeepSeek Harness Desktop ${app.getVersion()} starting`)
    log.info(`harness home (DSH_HOME): ${paths.dshHome()}`)

    window.createMainWindow({ onClosed: () => { if (quitting) tray.destroy() } })
    tray.create({ url: undefined })
    updater.init()

    // If the server dies later, surface the error page instead of a blank tab.
    dsh.on('exit', () => {
      if (!quitting && !restarting) {
        log.warn('harness exited unexpectedly')
        window.showError('服务已停止，请点击“重试”重新启动。')
      }
    })

    void startHarness()
  })

  // ---- quit / teardown -----------------------------------------------------
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    window.setQuitting(true)
    log.info('quitting: stopping harness process tree')
    dsh.stop()
      .catch((err) => log.error('error stopping harness:', err && err.message))
      .finally(() => {
        tray.destroy()
        app.quit()
      })
  })

  app.on('window-all-closed', () => {
    // On Windows the app lives in the tray; an explicit quit handles teardown.
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      window.createMainWindow()
    } else {
      window.restore()
    }
  })
}
