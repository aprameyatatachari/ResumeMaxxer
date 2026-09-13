import { useEffect } from 'react'

/**
 * Scroll reveal for every `[data-reveal]` element on the page.
 *
 * Content is visible by default; the page is only "armed" (elements hidden,
 * waiting to animate in) when IntersectionObserver exists and the visitor has
 * not asked for reduced motion. `--reveal-delay` on an element staggers it.
 */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) return

    const root = document.documentElement
    root.classList.add('reveal-armed')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      root.classList.remove('reveal-armed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
