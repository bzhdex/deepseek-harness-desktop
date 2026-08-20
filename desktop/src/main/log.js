'use strict'

/**
 * Minimal file logger for the desktop shell. Writes one line per entry to a
 * timestamped file under Electron's userData directory so a broken startup can
 * be diagnosed from %APPDATA%\DeepSeek Harness\desktop\logs.
 */

const fs = require('node:fs')
const path = require('node:path')

let logDir = null

function init(dir) {
  logDir = path.join(dir, 'logs')
  try {
    fs.mkdirSync(logDir, { recursive: true })
  } catch {
    /* logging is best-effort */
  }
}

function stamp() {
  return new Date().toISOString()
}

function write(level, args) {
  const line = `[${stamp()}] [${level}] ${args.map(String).join(' ')}\n`
  try {
    if (logDir) {
      const file = path.join(logDir, `desktop-${new Date().toISOString().slice(0, 10)}.log`)
      fs.appendFileSync(file, line)
    }
  } catch {
    /* never let logging crash the app */
  }
  // Mirror to the console so `electron .` in dev shows progress.
  if (process.env.DSH_DESKTOP_DEBUG || !process.defaultApp) {
    // keep default quiet-ish in prod
  }
  // Always echo to stdout for the packaged app's console (harmless when hidden).
  // eslint-disable-next-line no-console
  process.stdout.write(line)
}

module.exports = {
  init,
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
}
