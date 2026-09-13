import { useEffect, useRef } from 'react'

const GLYPHS = 'abcdeghknopqrsuvxyz0123456789' // narrow glyphs, so rolling letters stay inside their slot
const STEP_MS = 55 // how often an unsettled letter rolls to a new glyph
const STAGGER_MS = 32 // gap between neighbouring letters clicking into place
const SPIN_MS = 380 // how long the first letter rolls before it settles

/**
 * A headline that unlocks like a combination dial.
 *
 * On entering the viewport every letter rolls through random characters, and
 * they click into place one by one from left to right. Plays again each time
 * the heading scrolls back into view.
 *
 * - Each letter keeps the width of its final character (an invisible copy
 *   sizes the box), so rolling glyphs never reflow the line.
 * - Words are wrapped as unbreakable groups, so lines break where they would
 *   for plain text.
 * - Screen readers get the real text via aria-label; the animated letters are
 *   aria-hidden. Under reduced motion the text is simply rendered.
 * - Glyphs are written straight to the DOM from one rAF loop, not React state.
 */
export default function DialText({
  text,
  as: Tag = 'h2',
  className = '',
}: {
  text: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
  className?: string
}) {
  const rootRef = useRef<HTMLElement>(null)
  const glyphRefs = useRef<HTMLSpanElement[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const glyphs = glyphRefs.current.filter(Boolean)
    const finals = glyphs.map((el) => el.dataset.char ?? '')
    let frame = 0
    let playing = false

    const settleAll = () => {
      glyphs.forEach((el, i) => {
        el.textContent = finals[i]
        el.classList.remove('is-rolling')
      })
    }

    const play = () => {
      cancelAnimationFrame(frame)
      playing = true
      const start = performance.now()
      const lastStep = new Array(glyphs.length).fill(-1)
      glyphs.forEach((el) => {
        el.classList.remove('is-set')
        el.classList.add('is-rolling')
      })

      const tick = (now: number) => {
        const t = now - start
        let done = true
        glyphs.forEach((el, i) => {
          if (!el.classList.contains('is-rolling')) return
          if (t >= SPIN_MS + i * STAGGER_MS) {
            el.textContent = finals[i]
            el.classList.remove('is-rolling')
            // Restart the click animation.
            void el.offsetWidth
            el.classList.add('is-set')
            return
          }
          done = false
          const step = Math.floor(t / STEP_MS)
          if (step !== lastStep[i]) {
            lastStep[i] = step
            el.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]
          }
        })
        if (done) {
          playing = false
          return
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!playing) play()
        } else if (!playing) {
          // Scramble again off-screen so the next entrance replays.
          glyphs.forEach((el) => el.classList.remove('is-set'))
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(root)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      settleAll()
    }
  }, [text])

  let index = 0
  glyphRefs.current = []
  const words = text.split(' ')

  return (
    <Tag ref={rootRef as never} className={className} aria-label={text}>
      {words.map((word, w) => (
        <span key={w} aria-hidden="true">
          <span className="inline-block whitespace-nowrap">
            {Array.from(word).map((char) => {
              const i = index++
              return (
                <span key={i} className="dial-char">
                  <span className="invisible">{char}</span>
                  <span
                    ref={(el) => {
                      if (el) glyphRefs.current[i] = el
                    }}
                    data-char={char}
                    className="dial-glyph"
                  >
                    {char}
                  </span>
                </span>
              )
            })}
          </span>
          {w < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  )
}
