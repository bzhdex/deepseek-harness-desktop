/**
 * Generate the app icon (build/icon.png) and tray icon (resources/icons/tray.png).
 *
 * The mark is an ORIGINAL, trademark-safe design for this community wrapper
 * (deliberately NOT the DeepSeek whale): a bold rounded "H" (for "Harness")
 * with a central "port" node, on an indigo→violet gradient tile. The "H" +
 * node motif evokes the harness's plugin/connection architecture without using
 * any DeepSeek brand material.
 *
 * Rendered with `sharp` (a desktop devDependency).
 */

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function iconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5B5FEF"/>
      <stop offset="1" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g fill="#FFFFFF">
    <rect x="132" y="136" width="56" height="240" rx="28"/>
    <rect x="324" y="136" width="56" height="240" rx="28"/>
    <rect x="132" y="228" width="248" height="56" rx="28"/>
  </g>
  <circle cx="256" cy="256" r="14" fill="url(#bg)"/>
</svg>`
}

async function main() {
  mkdirSync(resolve(ROOT, 'build'), { recursive: true })
  mkdirSync(resolve(ROOT, 'resources', 'icons'), { recursive: true })

  const iconPath = resolve(ROOT, 'build', 'icon.png')
  const trayPath = resolve(ROOT, 'resources', 'icons', 'tray.png')

  await sharp(Buffer.from(iconSvg(512))).png().toFile(iconPath)
  await sharp(Buffer.from(iconSvg(64))).png().toFile(trayPath)

  console.log(`wrote ${iconPath}`)
  console.log(`wrote ${trayPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
