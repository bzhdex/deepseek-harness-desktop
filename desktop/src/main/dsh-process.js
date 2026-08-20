'use strict'

/**
 * DshProcess — owns the lifecycle of the `dsh web` server process tree.
 *
 * The shell never talks to the harness directly; it spawns the watchdog
 * launcher (bundled node + launcher script), reads the server URL back from
 * stdout, and tears the whole tree down on quit.
 */

const { spawn, execFile } = require('node:child_process')
const { EventEmitter } = require('node:events')
const path = require('node:path')
const log = require('./log')
const paths = require('./paths')
const { findFreePort, HOST } = require('./ports')

/** Matches the harness ready line: `dsh web: http://127.0.0.1:3080`. */
const READY_RE = /dsh web:\s+(https?:\/\/\S+)/

/** Upper bound for first boot (native module load + client assembly). */
const READY_TIMEOUT_MS = 90_000

class DshProcess extends EventEmitter {
  constructor() {
    super()
    /** @type {import('node:child_process').ChildProcess | null} */
    this.launcher = null
    this.url = null
    this.port = null
    this.startedAt = 0
    this._readyTimer = null
    this._stderrTail = ''
    this._exited = false
  }

  /**
   * Spawn the harness server tree and resolve once its URL is announced.
   * @returns {Promise<string>} the ready URL, e.g. http://127.0.0.1:3080
   */
  async start() {
    if (this.launcher) throw new Error('dsh process already started')

    const node = paths.nodeExecutable()
    const bin = paths.harnessBin()
    const launcher = paths.launcherScript()

    this.port = await findFreePort()
    log.info(`starting dsh web on ${HOST}:${this.port} (node=${node})`)

    const env = {
      ...process.env,
      // Persistent harness home; upgrades never touch this.
      DSH_HOME: paths.dshHome(),
      // Make the bundled Node (and its npm/npx/corepack) resolvable for any
      // harness-internal `node` reference.
      PATH: [
        path.dirname(node),
        path.join(paths.harnessRoot(), 'node_modules', '.bin'),
        process.env.PATH || '',
      ].join(path.delimiter),
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    }

    this.startedAt = Date.now()
    this._stderrTail = ''
    this._exited = false
    this.url = null

    this.launcher = spawn(node, [
      launcher,
      '--harness-bin', bin,
      '--port', String(this.port),
      '--parent-pid', String(process.pid),
    ], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.launcher.stdout.setEncoding('utf8')
    this.launcher.stderr.setEncoding('utf8')

    this.launcher.stdout.on('data', (chunk) => this._onStdout(chunk))
    this.launcher.stderr.on('data', (chunk) => this._onStderr(chunk))
    this.launcher.on('error', (err) => this._onError(err))
    this.launcher.on('exit', (code, signal) => this._onExit(code, signal))

    return new Promise((resolve, reject) => {
      this._readyTimer = setTimeout(() => {
        const detail = this._stderrTail.trim()
        reject(new Error(
          `dsh web did not become ready within ${READY_TIMEOUT_MS / 1000}s` +
          (detail ? `\n--- stderr tail ---\n${detail}` : ''),
        ))
      }, READY_TIMEOUT_MS)

      this.once('ready', (url) => {
        clearTimeout(this._readyTimer)
        resolve(url)
      })
      this.once('exit', (code) => {
        clearTimeout(this._readyTimer)
        reject(new Error(`dsh web exited before ready (code ${code})\n--- stderr tail ---\n${this._stderrTail.trim()}`))
      })
    })
  }

  _onStdout(chunk) {
    process.stdout.write(chunk)
    const match = chunk.match(READY_RE)
    if (match && !this.url) {
      this.url = match[1]
      log.info(`dsh web ready at ${this.url}`)
      this.emit('ready', this.url)
    }
  }

  _onStderr(chunk) {
    process.stderr.write(chunk)
    // Keep a bounded tail for diagnostics.
    this._stderrTail = (this._stderrTail + chunk).slice(-8000)
  }

  _onError(err) {
    log.error('launcher spawn error:', err.message)
    this.emit('error', err)
  }

  _onExit(code, signal) {
    if (this._exited) return
    this._exited = true
    clearTimeout(this._readyTimer)
    log.info(`dsh process tree exited (code=${code}, signal=${signal})`)
    this.launcher = null
    this.emit('exit', code)
  }

  /**
   * Tear the whole tree down. Asks the watchdog launcher first (a normal
   * quit), then force-reaps the tree as a belt-and-braces fallback.
   * @returns {Promise<void>}
   */
  async stop() {
    const launcher = this.launcher
    if (!launcher) return

    const exitPromise = new Promise((resolve) => {
      launcher.once('exit', () => resolve())
      // In case 'exit' already fired.
      if (launcher.exitCode !== null || launcher.signalCode !== null) resolve()
    })

    // Graceful request to the watchdog.
    try {
      launcher.stdin.write('SHUTDOWN\n')
    } catch {
      /* stdin may already be gone */
    }

    // Give the watchdog a moment, then force-kill its tree.
    const timedOut = await Promise.race([
      exitPromise.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 2500)),
    ])

    if (timedOut) {
      log.warn('graceful shutdown timed out; force-killing the process tree')
      const pid = launcher.pid
      try {
        launcher.kill()
      } catch {
        /* ignore */
      }
      if (process.platform === 'win32' && pid !== undefined) {
        await new Promise((resolve) => {
          execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => resolve())
        })
      }
    }

    this.launcher = null
    this.url = null
    log.info('dsh process tree stopped')
  }

  /** @returns {boolean} */
  get running() {
    return this.launcher !== null && !this._exited
  }
}

module.exports = { DshProcess }
