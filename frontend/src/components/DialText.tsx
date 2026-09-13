import { useLayoutEffect, useRef } from 'react'

const GLYPHS = 'abcdeghknopqrsuvxyz0123456789' // narrow glyphs, so rolling letters stay inside their slot
const STEP_MS = 55 // how often an unsettled letter rolls to a new glyph
const ROLL_MS = 200 // how long each letter rolls after it appears
const CLICK_MS = 240 // length of the settle animation (matches index.css)
const TOTAL_MS = 1300 // the whole headline is set within this
const MAX_STAGGER_MS = 55

/**
 * A headline that unlocks like a combination dial.
 *
 * On entering the viewport the letters appear one by one from left to right;
 * each rolls through a few random characters before clicking into place.
 * Plays again each time the heading scrolls back into view. The whole
 * headline is set within 1.3 seconds however long it is, and letters start
 * hidden (set before first paint) so the real text never flashes first.
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

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const glyphs = glyphRefs.current.filter(Boolean)
    const finals = glyphs.map((el) => el.dataset.char ?? '')
    let frame = 0
    let playing = false
    const stagger = Math.min(
      MAX_STAGGER_MS,
      (TOTAL_MS - ROLL_MS - CLICK_MS) / Math.max(glyphs.length - 1, 1),
    )
    const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0]
    const scramble = () => {
      glyphs.forEach((el) => {
        el.classList.remove('is-set', 'is-rolling')
        el.classList.add('is-hidden')
      })
    }
    scramble()

    const settleAll = () => {
      glyphs.forEach((el, i) => {
        el.textContent = finals[i]
        el.classList.remove('is-rolling', 'is-hidden')
      })
    }

    const play = () => {
      cancelAnimationFrame(frame)
      playing = true
      const start = performance.now()
      const lastStep = new Array(glyphs.length).fill(-1)
      glyphs.forEach((el) => {
        el.classList.remove('is-set', 'is-rolling')
        el.classList.add('is-hidden')
      })

      const tick = (now: number) => {
        const t = now - start
        let done = true
        glyphs.forEach((el, i) => {
          const appearAt = i * stagger
          if (el.classList.contains('is-hidden')) {
            done = false
            if (t < appearAt) return
            el.classList.remove('is-hidden')
            el.classList.add('is-rolling')
          }
          if (!el.classList.contains('is-rolling')) return
          if (t >= appearAt + ROLL_MS) {
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
            el.textContent = randomGlyph()
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
          scramble()
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
