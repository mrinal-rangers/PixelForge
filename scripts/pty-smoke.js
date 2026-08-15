const { app } = require('electron')
const path = require('node:path')
const pty = require(path.join(__dirname, '..', 'node_modules', 'node-pty'))

app.whenReady().then(() => {
  const shell = process.env.SHELL || '/bin/zsh'
  const proc = pty.spawn(shell, ['-l', '-c', 'echo PTY_WORKS && exit 0'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: '/tmp',
    env: { ...process.env, TERM: 'xterm-256color' }
  })

  let output = ''
  proc.onData((data) => {
    output += data
  })

  proc.onExit(({ exitCode }) => {
    console.log('OUTPUT_START')
    console.log(output)
    console.log('OUTPUT_END')
    console.log('EXIT_CODE=' + exitCode)
    app.quit()
    process.exit(exitCode === 0 && output.includes('PTY_WORKS') ? 0 : 1)
  })
})