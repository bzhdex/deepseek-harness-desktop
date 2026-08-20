'use strict'

/**
 * Path resolution for the desktop shell. Everything the harness needs at
 * runtime is bundled as unpacked resources (not inside app.asar) so the
 * bundled Node.js can resolve and execute it as a real filesystem tree.
 */

const path = require('node:path')
const { app } = require('electron')

/** Human-facing product directory under %APPDATA%. */
const PRODUCT_DIR_NAME = 'DeepSeek Harness'

/**
 * Root for all persistent user data. This is the harness home (DSH_HOME):
 * sessions, settings, plugins, presets, and credentials live here so an
 * upgrade install never loses them.
 * @returns {string} absolute path, e.g. C:\Users\<u>\AppData\Roaming\DeepSeek Harness
 */
function appDataRoot() {
  return path.join(app.getPath('appData'), PRODUCT_DIR_NAME)
}

/**
 * Point Electron's own cache/localStorage/userData at a subfolder so it stays
 * separate from the harness data in %APPDATA%\DeepSeek Harness. Must run
 * before `ready` and before any userData consumer touches the path.
 */
function configureUserData() {
  app.setPath('userData', path.join(appDataRoot(), 'desktop'))
}

/**
 * Root of the bundled, unpacked resources. In a packaged build this is
 * <installDir>\resources; in development it is the project's resources folder.
 * @returns {string}
 */
function resourcesRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..', 'resources')
}

/** @returns {string} the bundled Node.js executable. */
function nodeExecutable() {
  return path.join(resourcesRoot(), 'runtime', 'node.exe')
}

/** @returns {string} the `dsh` CLI entry (bundled npm closure). */
function harnessBin() {
  return path.join(
    resourcesRoot(),
    'harness',
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js',
  )
}

/** @returns {string} the harness closure root (has node_modules). */
function harnessRoot() {
  return path.join(resourcesRoot(), 'harness')
}

/** @returns {string} the process-tree watchdog launcher script. */
function launcherScript() {
  return path.join(resourcesRoot(), 'launcher', 'harness-launcher.cjs')
}

/**
 * The harness home handed to the child via DSH_HOME. The desktop app owns its
 * own stable location (default %APPDATA%\DeepSeek Harness) and deliberately
 * does NOT read the ambient DSH_HOME (that variable belongs to the CLI). An
 * advanced override is available via DSH_DESKTOP_HOME.
 * @returns {string}
 */
function dshHome() {
  const override = process.env.DSH_DESKTOP_HOME
  if (override && override.trim().length > 0) return path.resolve(override)
  return appDataRoot()
}

module.exports = {
  PRODUCT_DIR_NAME,
  appDataRoot,
  configureUserData,
  resourcesRoot,
  nodeExecutable,
  harnessBin,
  harnessRoot,
  launcherScript,
  dshHome,
}
