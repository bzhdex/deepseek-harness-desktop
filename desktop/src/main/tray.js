'use strict'

/**
 * System tray: show/hide, open in the default browser, auto-start toggle,
 * update check, and quit. Close-to-tray is the default desktop behavior.
 */

const path = require('node:path')
const { Tray, Menu, nativeImage, app, shell } = require('electron')
const log = require('./log')
const paths = require('./paths')
const window = require('./window')

let tray = null
/** @type {{ url?: string } & Record<string, unknown>} */
let context = { url: undefined }

function setLaunchAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function isLaunchAtLogin() {
  return app.getLoginItemSettings().openAtLogin
}

function buildMenu() {
  const items = [
    { label: '显示窗口', click: () => window.restore() },
    { type: 'separator' },
    {
      label: '在浏览器中打开',
      enabled: Boolean(context.url),
      click: () => {
        if (context.url) void shell.openExternal(context.url)
      },
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: isLaunchAtLogin(),
      click: (item) => {
        try {
          setLaunchAtLogin(item.checked)
        } catch (err) {
          log.error('failed to toggle launch-at-login:', err.message)
        }
      },
    },
    { type: 'separator' },
    {
      label: '检查更新…',
      click: () => {
        const updater = require('./updater')
        updater.checkNow()
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { window.setQuitting(true); app.quit() } },
  ]
  return Menu.buildFromTemplate(items)
}

/**
 * @param {{ url?: string }} ctx
 */
function create(ctx = {}) {
  context = ctx
  const icon = nativeImage.createFromPath(path.join(paths.resourcesRoot(), 'icons', 'tray.png'))
  if (icon.isEmpty()) {
    log.warn('tray icon missing; using empty icon')
  }
  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(buildMenu())
  tray.on('double-click', () => window.restore())
  return tray
}

/** Refresh dynamic menu state (url availability, auto-start). */
function refresh(url) {
  context = { ...context, url }
  if (tray) tray.setContextMenu(buildMenu())
}

function destroy() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

module.exports = { create, refresh, destroy }
