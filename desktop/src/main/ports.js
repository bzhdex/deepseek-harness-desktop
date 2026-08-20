'use strict'

/**
 * Loopback port selection. The harness binds 127.0.0.1 by default; we pick a
 * free port up front so a collision (a second instance, another service) is
 * handled gracefully instead of surfacing as a failed boot.
 */

const net = require('node:net')

const DEFAULT_PORT = 3080
const HOST = '127.0.0.1'

/**
 * @param {number} port
 * @returns {Promise<boolean>} true when nothing is listening on 127.0.0.1:port
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', () => resolve(false))
    probe.listen(port, HOST, () => {
      probe.close(() => resolve(true))
    })
  })
}

/**
 * Find a free loopback port, preferring the standard one and then scanning a
 * bounded range. Returns 0 when every candidate is taken, which tells the
 * harness to let the OS assign one; the actual port is then read back from the
 * harness's ready line.
 * @param {number} [preferred]
 * @returns {Promise<number>}
 */
async function findFreePort(preferred = DEFAULT_PORT) {
  if (await isPortFree(preferred)) return preferred
  for (let port = preferred + 1; port < preferred + 200; port += 1) {
    if (await isPortFree(port)) return port
  }
  return 0
}

module.exports = { DEFAULT_PORT, HOST, isPortFree, findFreePort }
