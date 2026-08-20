'use strict'

/**
 * Process-tree watchdog launcher, run by the bundled Node.js executable.
 *
 * Why this exists: the Electron shell spawns this script (with node.exe), and
 * this script spawns the real `dsh web` server. If the shell is force-killed
 * (Task Manager, crash) the OS does not run the shell's before-quit handler,
 * so a direct `dsh web` child would be orphaned. This launcher watches the
 * shell's PID and reaps the whole harness process tree when the shell dies.
 * It also turns a stdin "SHUTDOWN" line into a clean, tree-wide teardown on a
 * normal quit.
 *
 * This is shell-layer code only — it never modifies harness behavior.
 */

const { spawn, execFile } = require('node:child_process')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--harness-bin' || token === '--port' || token === '--parent-pid') {
      out[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]
      i += 1
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const port = args.port !== undefined ? String(args.port) : '3080'
const parentPid = args.parentPid !== undefined ? Number(args.parentPid) : 0
const harnessBin = args.harnessBin

let harness = null
let shuttingDown = false

function killHarnessTree() {
  const child = harness
  harness = null
  if (!child || child.pid === undefined) return
  try {
    child.kill()
  } catch {
    /* already gone */
  }
  if (process.platform === 'win32') {
    // Reap grandchildren (ConPTY shells, pwsh, tool subprocesses) in one shot.
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {})
  }
}

function startHarness() {
  if (!harnessBin) {
    process.stderr.write('harness-launcher: missing --harness-bin\n')
    process.exit(2)
  }
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  }
  harness = spawn(
    process.execPath,
    [harnessBin, 'web', '--no-open', '--host', '127.0.0.1', '--port', port],
    { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  harness.stdout.on('data', (d) => process.stdout.write(d))
  harness.stderr.on('data', (d) => process.stderr.write(d))
  harness.on('error', (err) => {
    process.stderr.write(`harness-launcher: ${err.message}\n`)
    process.exit(1)
  })
  harness.on('exit', (code) => {
    harness = null
    process.exit(shuttingDown ? 0 : code === null ? 1 : code)
  })
}

// Reap the tree when the Electron shell disappears.
if (parentPid > 0) {
  const watchdog = setInterval(() => {
    if (shuttingDown) return
    try {
      process.kill(parentPid, 0)
    } catch {
      clearInterval(watchdog)
      killHarnessTree()
      process.exit(0)
    }
  }, 2000)
  watchdog.unref()
}

// Normal quit path: the shell writes "SHUTDOWN" to stdin.
process.stdin.on('data', (chunk) => {
  if (String(chunk).includes('SHUTDOWN')) {
    shuttingDown = true
    killHarnessTree()
    setTimeout(() => process.exit(0), 300)
  }
})
process.stdin.resume()

process.on('SIGINT', () => {
  shuttingDown = true
  killHarnessTree()
  process.exit(130)
})
process.on('SIGTERM', () => {
  shuttingDown = true
  killHarnessTree()
  process.exit(0)
})

startHarness()
