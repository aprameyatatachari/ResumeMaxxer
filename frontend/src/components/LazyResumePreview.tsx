import { Suspense, lazy } from 'react'

import type { ResumePayload } from '../lib/types'
import Spinner from './Spinner'

/**
 * Code-split wrapper around <ResumePreview>.
 *
 * @react-pdf/renderer is roughly 1.2 MB of the bundle - it carries its own
 * layout engine and font machinery. Importing it statically made every page,
 * including the signed-out landing page, pay for a PDF renderer nobody had
 * asked for yet. Loading it on demand moves that cost to the two screens that
 * actually render a document.
 */
const ResumePreview = lazy(() => import('./ResumePreview'))

export default function LazyResumePreview(props: {
  resume: ResumePayload
  jobTitle: string
}) {
  return (
    <Suspense
      fallback={
        <div className="grid h-96 place-items-center rounded-xl border border-slate-200 bg-white">
          <Spinner label="Loading the PDF renderer…" />
        </div>
      }
    >
      <ResumePreview {...props} />
    </Suspense>
  )
}
