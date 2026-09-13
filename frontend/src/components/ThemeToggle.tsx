import { useTheme, type ThemeChoice } from '../lib/theme'
import { Monitor, Moon, Sun } from './icons'

const ORDER: ThemeChoice[] = ['system', 'light', 'dark']
const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme follows your device',
  light: 'Day mode',
  dark: 'Night mode',
}

/**
 * Round icon button that cycles day, night and follow-the-device.
 * The accessible label names the current mode and the next one, so the cycle
 * is never a guess for a screen-reader user.
 */
export default function ThemeToggle() {
  const { choice, setChoice } = useTheme()
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]
  const Icon = choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      aria-label={`${LABEL[choice]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={LABEL[choice]}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-colors duration-200 hover:border-line-strong hover:text-ink"
    >
      <Icon size={17} />
    </button>
  )
}
