import { useEffect, useRef } from 'react'

/**
 * A paragraph that inks itself in as it scrolls through the viewport: every
 * word starts faint and turns solid in reading order, tied directly to
 * scroll position (scrub, not a one-shot animation).
 *
 * Words are written to from one rAF-throttled scroll handler; no React state
 * per frame. Reduced motion renders the paragraph solid.
 */
export default function ScrubText({ text, className = '' }: { text: string; className?: string }) {
  const rootRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const words = Array.from(root.querySelectorAll<HTMLSpanElement>('[data-word]'))
    let frame = 0
    const update = () => {
      frame = 0
      const rect = root.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the paragraph's top reaches 85% of the viewport, 1 when its
      // bottom reaches 45%.
      const start = vh * 0.85
      const end = vh * 0.45
      const total = start - end + rect.height
      const p = Math.min(1, Math.max(0, (start - rect.top) / total))
      const lit = p * words.length
      words.forEach((word, i) => {
        const amount = Math.min(1, Math.max(0, lit - i))
        word.style.opacity = String(0.18 + amount * 0.82)
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [text])

  return (
    <p ref={rootRef} className={className}>
      {text.split(' ').map((word, i, all) => (
        <span key={i}>
          <span data-word className="transition-opacity duration-150">
            {word}
          </span>
          {i < all.length - 1 ? ' ' : null}
        </span>
      ))}
    </p>
  )
}
