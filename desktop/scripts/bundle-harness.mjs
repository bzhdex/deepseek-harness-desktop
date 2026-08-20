/**
 * Stage the harness runtime closure into resources/harness.
 *
 * The harness is a large monorepo published as one version per release. We pin
 * ONE exact release (default 0.1.0-rc.8, matching the bundled source tree) and
 * keep the install reproducible via a lockfile. No monorepo build is needed:
 * the published CLI already contains its built `lib/` and the frontend `dist/`.
 *
 * Uses pnpm when available (the upstream tool; far faster at resolving this
 * peer-dependency-heavy tree, with --node-linker=hoisted producing a flat,
 * symlink-free node_modules that packages cleanly). Falls back to npm.
 *
 * Usage: node scripts/bundle-harness.mjs [dshVersion]
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HARNESS_DIR = resolve(__dirname, '..', 'resources', 'harness')

const DSH_VERSION = process.argv[2] || process.env.DSH_VERSION || '0.1.0-rc.8'
const PACKAGE_NAME = '@deepseek-ai/dsh'
const WINDOWS = process.platform === 'win32'

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: HARNESS_DIR,
      shell: WINDOWS && opts.shell !== false,
      ...opts,
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

/** Run npm through the current Node + its bundled npm-cli.js (no .cmd shim). */
function runNpm(args) {
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(npmCli)) throw new Error(`npm-cli.js not found next to ${process.execPath}`)
  return run(process.execPath, [npmCli, ...args], { shell: false })
}

async function hasPnpm() {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['--version'], { stdio: 'ignore', shell: WINDOWS })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function main() {
  mkdirSync(HARNESS_DIR, { recursive: true })

  // Pin the exact release so the transitive @deepseek-ai/* family stays aligned.
  const pkgJson = {
    name: 'dsh-desktop-harness',
    version: '0.0.0',
    private: true,
    dependencies: { [PACKAGE_NAME]: DSH_VERSION },
  }
  writeFileSync(resolve(HARNESS_DIR, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`)

  // pnpm 11 blocks install scripts until reviewed. Allow the native builds the
  // harness needs (mirrors upstream's pnpm-workspace.yaml): koffi = JSONL
  // durability write-through, node-pty = ConPTY terminal, dsh-subprocess-local
  // = its reviewed postinstall. Deny the no-op scripts (@google/genai,
  // protobufjs) to keep the tree clean.
  const workspaceYaml = resolve(HARNESS_DIR, 'pnpm-workspace.yaml')
  if (!existsSync(workspaceYaml)) {
    writeFileSync(workspaceYaml, [
      'allowBuilds:',
      "  '@deepseek-ai/dsh-subprocess-local': true",
      "  '@google/genai': false",
      '  koffi: true',
      '  node-pty: true',
      '  protobufjs: false',
      '',
    ].join('\n'))
  }

  if (await hasPnpm()) {
    // hoisted = flat node_modules (no symlinks), safe to copy into the installer.
    await run('pnpm', ['install', '--node-linker=hoisted'])
  } else {
    console.warn('pnpm not found; falling back to npm (slower). Install pnpm for faster builds.')
    await runNpm(['install', '--omit=dev', '--no-audit', '--no-fund'])
  }

  const bin = resolve(HARNESS_DIR, 'node_modules', PACKAGE_NAME, 'lib', 'bin.js')
  if (!existsSync(bin)) {
    throw new Error(`expected dsh entry not found: ${bin}`)
  }
  console.log(`harness staged: ${bin}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
