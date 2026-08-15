const { spawn } = require('node:child_process')
const { resolve } = require('node:path')

const PORT = 9444
const ROOT = resolve(__dirname, '..')
const CLI = process.argv[2] || 'aider'
const TIMEOUT_MS = 5 * 60 * 1000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page) return page
    } catch {}
    await sleep(500)
  }
  throw new Error('Timed out waiting for renderer target')
}

let msgId = 0
function connect(target) {
  return new Promise((resolveWs, rejectWs) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const pending = new Map()
    ws.onopen = () =>
      resolveWs({
        send(method, params = {}) {
          return new Promise((resolve, reject) => {
            const id = ++msgId
            pending.set(id, { resolve, reject })
            ws.send(JSON.stringify({ id, method, params }))
          })
        }
      })
    ws.onerror = (e) => rejectWs(e)
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }
  })
}

async function evaluate(ws, expression) {
  const result = await ws.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(
      'Evaluation failed: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    )
  }
  return result.result.value
}

async function main() {
  const app = spawn(
    resolve(ROOT, 'node_modules', '.bin', 'electron'),
    [ROOT, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, stdio: 'ignore' }
  )
  try {
    const target = await getPageTarget()
    const ws = await connect(target)

    await evaluate(
      ws,
      `window.__st=[]; window.__log=''; window.__u1=window.workspace.onCliInstallStatus(p=>window.__st.push(p)); window.__u2=window.workspace.onCliInstallOutput(p=>window.__log+=p.data); true`
    )

    console.log(`installing: ${CLI}`)
    await evaluate(ws, `window.workspace.installCli(${JSON.stringify(CLI)}); true`)

    const deadline = Date.now() + TIMEOUT_MS
    let finalStatus = null
    while (Date.now() < deadline) {
      const statuses = await evaluate(ws, `JSON.parse(JSON.stringify(window.__st))`)
      const last = statuses[statuses.length - 1]
      if (last && (last.status === 'done' || last.status === 'error')) {
        finalStatus = last
        break
      }
      await sleep(1000)
    }

    if (!finalStatus) {
      console.log('INSTALL_TIMEOUT')
      return
    }
    console.log('install status:', JSON.stringify(finalStatus))
    const logTail = await evaluate(ws, `window.__log.slice(-600)`)
    console.log('log tail:', JSON.stringify(logTail))
    const detected = await evaluate(ws, `window.workspace.listClis()`)
    console.log('after install, detected:', detected.find((c) => c.id === CLI)?.detected)
    console.log('INSTALL_TEST_DONE')
  } catch (err) {
    console.error('INSTALL_TEST_FAIL:', err.message)
    process.exitCode = 1
  } finally {
    app.kill('SIGTERM')
    setTimeout(() => app.kill('SIGKILL'), 2000).unref()
  }
}

main()