const { spawn } = require('node:child_process')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const PORT = 9333
const ROOT = resolve(__dirname, '..')
const projectDir = mkdtempSync(join(tmpdir(), 'aw-e2e-'))

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
    const events = []

    ws.onopen = () => resolveWs({ send, wait, events })
    ws.onerror = (e) => rejectWs(e)
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      } else if (msg.method) {
        events.push(msg)
      }
    }

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    }

    async function wait(ms) {
      await sleep(ms)
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
      'Evaluation failed: ' +
        (result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text)
    )
  }
  return result.result.value
}

async function main() {
  const app = spawn(
    resolve(ROOT, 'node_modules', '.bin', 'electron'),
    [ROOT, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let stderr = ''
  app.stderr.on('data', (d) => (stderr += d.toString()))
  app.stdout.on('data', (d) => (stderr += d.toString()))

  try {
    const target = await getPageTarget()
    const ws = await connect(target)

    const hasApi = await evaluate(ws, 'typeof window.workspace')
    console.log('window.workspace type:', hasApi)

    const apiChecks = await evaluate(
      ws,
      `['selectProject','listClis','listCliDefs','detectCli','installCli','createSession','sendInput','resizeSession','stopSession','restartSession','onSessionOutput','onSessionStatus','onCliInstallOutput','onCliInstallStatus'].map(k => k + ':' + typeof window.workspace[k]).join(', ')`
    )
    console.log('api:', apiChecks)

    const defs = await evaluate(ws, 'window.workspace.listCliDefs()')
    console.log(
      'defs:',
      JSON.stringify(defs.map((c) => `${c.id}:${c.detected}`))
    )

    const detectedClaude = await evaluate(ws, 'window.workspace.detectCli("claude")')
    console.log('detectCli(claude):', detectedClaude.detected, detectedClaude.version)
    const detectedCodex = await evaluate(ws, 'window.workspace.detectCli("codex")')
    console.log('detectCli(codex):', detectedCodex.detected)

    await ws.wait(1200)
    const theme = await evaluate(ws, 'document.documentElement.dataset.theme')
    console.log('initial theme:', theme)

    await evaluate(ws, 'document.querySelector(".theme-toggle").click(); true')
    await ws.wait(300)
    const themeAfter = await evaluate(ws, 'document.documentElement.dataset.theme')
    console.log('theme after toggle:', themeAfter)

    await evaluate(ws, 'document.querySelector(".theme-toggle").click(); true')
    await ws.wait(300)

    const clis = await evaluate(ws, 'window.workspace.listClis()')
    console.log('detected CLIs:', JSON.stringify(clis.map((c) => `${c.id}:${c.detected}`)))

    const cliId = clis.find((c) => c.detected)?.id
    if (!cliId) {
      console.log('No detected CLI; skipping session test')
      app.kill('SIGTERM')
      return
    }
    console.log('using CLI:', cliId, 'project:', projectDir)

    await evaluate(
      ws,
      `window.__out=[]; window.__status=[]; window.__u1=window.workspace.onSessionOutput(p=>window.__out.push(p)); window.__u2=window.workspace.onSessionStatus(p=>window.__status.push(p)); true`
    )

    const { sessionId } = await evaluate(
      ws,
      `window.workspace.createSession({ projectPath: ${JSON.stringify(projectDir)}, cliId: ${JSON.stringify(cliId)}, cols: 80, rows: 24 })`
    )
    console.log('sessionId:', sessionId)

    await sleep(6000)

    const statuses = await evaluate(ws, `JSON.parse(JSON.stringify(window.__status))`)
    console.log('status events:', JSON.stringify(statuses.map((s) => s.session.status)))

    const outputLen = await evaluate(ws, `window.__out.reduce((n,p)=>n+p.data.length,0)`)
    console.log('bytes of terminal output received:', outputLen)

    const sample = await evaluate(
      ws,
      `window.__out.slice(0,3).map(p=>p.data).join('').slice(0,300)`
    )
    console.log('output sample:', JSON.stringify(sample))

    await evaluate(ws, `window.workspace.stopSession(${JSON.stringify(sessionId)})`)
    await sleep(2500)

    const statusesAfter = await evaluate(ws, `JSON.parse(JSON.stringify(window.__status))`)
    console.log('status after stop:', statusesAfter[statusesAfter.length - 1].session.status)

    await evaluate(
      ws,
      `window.workspace.restartSession(${JSON.stringify(sessionId)}, 100, 30)`
    )
    await sleep(4000)
    const statusesRestart = await evaluate(ws, `JSON.parse(JSON.stringify(window.__status))`)
    console.log('status after restart:', statusesRestart[statusesRestart.length - 1].session.status)

    await evaluate(ws, `window.workspace.resizeSession(${JSON.stringify(sessionId)}, 120, 40)`)
    await sleep(500)

    await evaluate(ws, `window.workspace.stopSession(${JSON.stringify(sessionId)})`)
    await sleep(2500)
    const final = await evaluate(ws, `JSON.parse(JSON.stringify(window.__status))`)
    console.log('final status:', final[final.length - 1].session.status)

    await evaluate(ws, `window.__u1(); window.__u2(); true`)
    console.log('E2E_PASS')
  } catch (err) {
    console.error('E2E_FAIL:', err.message)
    console.error('app stderr:', stderr.slice(-2000))
    process.exitCode = 1
  } finally {
    app.kill('SIGTERM')
    setTimeout(() => app.kill('SIGKILL'), 2000).unref()
  }
}

main()