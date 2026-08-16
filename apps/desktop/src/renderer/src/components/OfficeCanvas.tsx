import { useCallback, useEffect, useRef, useState } from 'react'
import { OfficeRenderer } from '../office/renderOffice'
import { useOfficeStore } from '../office/store'

export type ZoomLevel = 'fit' | 1 | 2 | 3

const ZOOM_OPTIONS: ZoomLevel[] = ['fit', 1, 2, 3]

export function OfficeCanvas(): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<OfficeRenderer | null>(null)
  const zoomRef = useRef<ZoomLevel>('fit')
  const [zoom, setZoom] = useState<ZoomLevel>('fit')
  const requestFocus = useOfficeStore((s) => s.requestFocus)

  zoomRef.current = zoom

  const fit = useCallback((): void => {
    const el = stageRef.current
    if (!el) {
      return
    }
    rendererRef.current?.resize(el.clientWidth, el.clientHeight, zoomRef.current)
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
      <div className="office-canvas-stage" ref={stageRef} />
      <div className="office-toolbar">
        <span className="office-toolbar-title">STUDIO FLOOR</span>
        <div className="office-zoom">
          {ZOOM_OPTIONS.map((level) => (
            <button
              key={String(level)}
              className={`office-zoom-btn ${zoom === level ? 'active' : ''}`}
              onClick={() => setZoom(level)}
              title={level === 'fit' ? 'Fit to window' : `${level}× zoom`}
            >
              {level === 'fit' ? 'FIT' : `${level}×`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}