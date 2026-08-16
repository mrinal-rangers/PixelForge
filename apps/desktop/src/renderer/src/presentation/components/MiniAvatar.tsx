import { useEffect, useRef } from 'react'
import { DOWN_IDLE } from '../scene/sprites'
import { CHARACTER_CELL_H, CHARACTER_CELL_W } from '../scene/types'
import type { CharacterSpec } from '../scene/types'
import { drawGrid } from '../scene/symbolColor'

interface MiniAvatarProps {
  spec: CharacterSpec
  scale?: number
  className?: string
  alt?: string
}

/** Renders a character's standing pose into a small pixelated canvas. */
export function MiniAvatar({
  spec,
  scale = 2,
  className,
  alt
}: MiniAvatarProps): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false
    drawGrid(ctx, spec, DOWN_IDLE, scale)
  }, [spec, scale])

  return (
    <canvas
      ref={ref}
      width={CHARACTER_CELL_W * scale}
      height={CHARACTER_CELL_H * scale}
      className={className}
      style={{ imageRendering: 'pixelated', width: CHARACTER_CELL_W * scale, height: CHARACTER_CELL_H * scale }}
      role="img"
      aria-label={alt ?? spec.name}
    />
  )
}