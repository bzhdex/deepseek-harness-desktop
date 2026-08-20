/**
 * Fetch and stage the bundled Node.js runtime (Windows x64) into
 * resources/runtime. The app never relies on a system-installed Node.
 *
 * Usage: node scripts/fetch-node.mjs [version]
 * Defaults to a Node 22+ LTS satisfying the harness `engines` range.
 */

import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { chmodSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESOURCES = resolve(__dirname, '..', 'resources')
const RUNTIME_DIR = join(RESOURCES, 'runtime')

const NODE_VERSION = process.argv[2] || process.env.DSH_NODE_VERSION || '24.19.0'
const PLATFORM = 'win-x64'
const DIST_NAME = `node-v${NODE_VERSION}-${PLATFORM}`
const ZIP_NAME = `${DIST_NAME}.zip`
const ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${ZIP_NAME}`

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

async function download(url, dest) {
  console.log(`downloading ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  await pipeline(res.body, createWriteStream(dest))
}

async function main() {
  mkdirSync(RESOURCES, { recursive: true })

  const expectedNode = join(RUNTIME_DIR, 'node.exe')
  if (existsSync(expectedNode)) {
    const version = await new Promise((resolve) => {
      const child = spawn(expectedNode, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      let out = ''
      child.stdout.on('data', (d) => { out += d })
      child.on('exit', () => resolve(out.trim()))
      child.on('error', () => resolve(''))
    })
    if (version === `v${NODE_VERSION}`) {
      console.log(`node runtime already staged: ${version}`)
      return
    }
    console.log(`staged node is ${version || 'unknown'}, re-staging ${NODE_VERSION}`)
    rmSync(RUNTIME_DIR, { recursive: true, force: true })
  }

  const tmp = mkdtempSync(join(tmpdir(), 'dsh-node-'))
  const zipPath = join(tmp, ZIP_NAME)
  try {
    await download(ZIP_URL, zipPath)
    console.log(`extracting ${basename(zipPath)}`)
    mkdirSync(RUNTIME_DIR, { recursive: true })
    // bsdtar (tar.exe) ships with Windows 10+ and reads zip archives.
    await run('tar', ['-xf', zipPath, '--strip-components=1', '-C', RUNTIME_DIR])
    chmodSync(expectedNode, 0o755)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const version = await new Promise((resolve) => {
    const child = spawn(expectedNode, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('exit', () => resolve(out.trim()))
    child.on('error', () => resolve(''))
  })
  console.log(`bundled Node.js: ${version} at ${expectedNode}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
