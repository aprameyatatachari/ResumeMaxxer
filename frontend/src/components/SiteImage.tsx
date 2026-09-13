import { useState } from 'react'

/**
 * A decorative site image that disappears if the file is missing, so a slot
 * whose artwork has not been added yet leaves the layout intact instead of
 * showing a broken-image icon.
 */
export default function SiteImage({
  src,
  className = '',
  alt = '',
  eager = false,
}: {
  src: string
  className?: string
  alt?: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
