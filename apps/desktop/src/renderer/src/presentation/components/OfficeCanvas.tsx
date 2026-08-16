import { useCallback, useEffect, useRef } from 'react'
import { OfficeRenderer } from '../scene/renderOffice'
import { useOfficeStore } from '../../application/state/officeStore'

export function OfficeCanvas(): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<OfficeRenderer | null>(null)
  const requestFocus = useOfficeStore((s) => s.requestFocus)

  const fit = useCallback((): void => {
    const el = stageRef.current
    if (!el) {
      return
    }
    rendererRef.current?.resize(el.clientWidth, el.clientHeight)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    let cancelled = false
    const renderer = new OfficeRenderer({
      onFocus: (id) => requestFocus(id)
    })
    rendererRef.current = renderer

    const boot = async (): Promise<void> => {
      try {
        await document.fonts.load('8px "PressStart"')
      } catch {
        // webfont may be unavailable; fall back to the monospace stack
      }
      if (cancelled || !stageRef.current) {
        return
      }
      try {
        await renderer.init(stageRef.current)
        fit()
      } catch (err) {
        console.error('[office] renderer init failed', err)
      }
    }
    void boot()

    return () => {
      cancelled = true
      renderer.destroy()
      rendererRef.current = null
    }
  }, [requestFocus, fit])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    const observer = new ResizeObserver(() => fit())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [fit])

  return (
    <div className="office-canvas">
      <div className="office-toolbar">
        <span className="office-toolbar-title">STUDIO FLOOR</span>
        <span className="office-toolbar-title">SELECT A COWORKER</span>
      </div>
      <div className="office-canvas-stage" ref={stageRef} />
    </div>
  )
}