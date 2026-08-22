import { spawn } from 'node:child_process'

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

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Starting Katala API and Vite development server...')
start('api')
start('dev:web')