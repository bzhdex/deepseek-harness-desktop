'use strict'

/**
 * Auto-update via electron-updater. The provider (GitHub Releases, generic
 * HTTP, or a private mirror) is configured in electron-builder.yml `publish`
 * and read back from the generated app-update.yml at runtime. When no feed is
 * configured the updater is a no-op, so the app still runs offline.
 */

const { app, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const log = require('./log')
const window = require('./window')

let autoUpdater = null
let checking = false

function init() {
  try {
    // Lazy-require so a build without electron-updater does not crash.
    // eslint-disable-next-line global-require
    autoUpdater = require('electron-updater').autoUpdater
    // electron-builder writes app-update.yml only when a `publish` feed is
    // configured. Without it every check throws ENOENT, so disable cleanly.
    const feedFile = path.join(process.resourcesPath, 'app-update.yml')
    if (!fs.existsSync(feedFile)) {
      log.info('auto-update disabled: no publish feed configured (app-update.yml missing)')
      autoUpdater = null
      return false
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', (info) => {
      log.info('update available:', info && info.version)
    })
    autoUpdater.on('update-downloaded', (info) => {
      log.info('update downloaded:', info && info.version)
      const win = window.getMainWindow()
      void dialog.showMessageBox(win, {
        type: 'info',
        title: '更新已就绪',
        message: `新版本 ${info.version} 已下载，重启后自动安装。`,
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true)
        }
      })
    })
    autoUpdater.on('error', (err) => {
      log.error('updater error:', err && err.message)
    })
    return true
  } catch (err) {
    log.warn('updater unavailable:', err && err.message)
    return false
  }
}

/** @returns {Promise<void>} */
async function checkNow() {
  if (!autoUpdater || checking) return
  checking = true
  try {
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (err) {
    // A missing feed or offline host is normal; surface it softly.
    log.warn('update check failed:', err && err.message)
  } finally {
    checking = false
  }
}

/** Background check a few seconds after a successful boot. */
function schedule() {
  if (!autoUpdater) return
  setTimeout(() => {
    void checkNow()
  }, 10_000)
}

module.exports = { init, checkNow, schedule }
