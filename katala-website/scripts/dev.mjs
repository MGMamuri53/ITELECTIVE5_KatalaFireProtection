import { spawn } from 'node:child_process'
import net from 'node:net'

const children = new Set()
let shuttingDown = false

function start(script) {
  const child = spawn(`npm run ${script}`, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  })

  children.add(child)

  child.on('error', (error) => {
    children.delete(child)
    if (shuttingDown) return
    console.error(`\nFailed to start ${script}:`, error.message)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (shuttingDown) return

    const failed = typeof code === 'number' ? code !== 0 : Boolean(signal)
    if (failed) {
      console.error(
        `\n${script} stopped unexpectedly. Shutting down the development environment.`
      )
      shutdown(typeof code === 'number' ? code : 1)
    }
  })

  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  setTimeout(() => process.exit(exitCode), 200).unref()
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Starting Katala development environment...')
if (await isPortInUse(Number(process.env.PORT || 3001))) {
  console.error('Port 3001 is already in use. Stop the existing API/dev server, then run this command again so the latest backend code is loaded.')
  shutdown(1)
} else {
  start('api')
  start('dev:web')
}
