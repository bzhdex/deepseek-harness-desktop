/**
 * One-shot orchestrator: generate icons, stage the Node runtime and the
 * harness closure, then run electron-builder for the Windows NSIS installer.
 *
 * Usage: node scripts/build.mjs [--dir]
 *   --dir   produce an unpacked build only (faster smoke test)
 */

import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const wantDir = process.argv.includes('--dir')

// Mirror electron-builder's winCodeSign/NSIS downloads (GitHub can be flaky).
if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
}
if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
  })
}

async function main() {
  await run(process.execPath, ['scripts/gen-icons.mjs'])
  await run(process.execPath, ['scripts/fetch-node.mjs'])
  await run(process.execPath, ['scripts/bundle-harness.mjs'])

  // Invoke electron-builder through Node + its cli.js (never a .cmd shim).
  const builderCli = resolve(ROOT, 'node_modules', 'electron-builder', 'cli.js')
  const args = wantDir ? ['--win', 'dir'] : ['--win', 'nsis']
  await run(process.execPath, [builderCli, ...args])
  console.log('\nBuild complete. Artifacts are in the `dist/` directory.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
