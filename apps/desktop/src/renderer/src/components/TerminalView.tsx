import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useOfficeStore } from '../application/state/officeStore'

interface TerminalViewProps {
  sessionId: string
  onResize?: (cols: number, rows: number) => void
}

export function TerminalView({ sessionId, onResize }: TerminalViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      theme: {
        background: '#0f1115',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#f14c4c',
        green: '#4caf50',
        yellow: '#e0af68',
        blue: '#4fc1ff',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#ff6b6b',
        brightGreen: '#7fd962',
        brightYellow: '#f5d28f',
        brightBlue: '#82b1ff',
        brightMagenta: '#d799d7',
        brightCyan: '#8be9fd',
        brightWhite: '#ffffff'
      }
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    terminalRef.current = term
    fitRef.current = fit

    const disposeInput = term.onData((data) => {
      window.workspace.sendInput(sessionId, data)
      useOfficeStore.getState().recordInput(sessionId)
    })

    const unsubscribeOutput = window.workspace.onSessionOutput(({ sessionId: id, data }) => {
      if (id === sessionId) {
        term.write(data)
      }
    })

    const unsubscribeFocus = useOfficeStore.subscribe((state, prev) => {
      if (
        state.focusRequest &&
        state.focusRequest.sessionId === sessionId &&
        state.focusRequest.nonce !== prev.focusRequest?.nonce
      ) {
        term.focus()
      }
    })

    const unsubscribeStatus = window.workspace.onSessionStatus(({ session }) => {
      if (session.id !== sessionId) {
        return
      }
      if (session.status === 'starting' && hasStartedRef.current) {
        term.clear()
      }
      if (session.status === 'starting' || session.status === 'running') {
        hasStartedRef.current = true
      }
    })

    const doFit = (): void => {
      try {
        fit.fit()
        window.workspace.resizeSession(sessionId, term.cols, term.rows)
        onResize?.(term.cols, term.rows)
      } catch {
        // container not measurable yet
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(doFit)
    })
    resizeObserver.observe(container)

    const focusTerminal = (): void => {
      term.focus()
    }
    container.addEventListener('click', focusTerminal)
    setTimeout(() => term.focus(), 50)

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener('click', focusTerminal)
      disposeInput.dispose()
      unsubscribeOutput()
      unsubscribeStatus()
      unsubscribeFocus()
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [sessionId, onResize])

  return <div ref={containerRef} className="terminal-container" />
}