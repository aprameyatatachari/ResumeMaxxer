import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'

import ResumeDocument from '../pdf/ResumeDocument'
import type { ResumePayload } from '../lib/types'

/** Filesystem-safe filename: "Jane Doe" + "Backend Intern" -> Jane_Doe_Backend_Intern.pdf */
function buildFilename(name: string, jobTitle: string): string {
  const clean = (value: string) =>
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
  return `${clean(name) || 'Resume'}_${clean(jobTitle) || 'Tailored'}.pdf`
}

/**
 * Live PDF preview plus a download button.
 *
 * Both are rendered by @react-pdf/renderer in the browser - the file never
 * touches the server, so nothing is stored beyond the JSON payload.
 */
export default function ResumePreview({
  resume,
  jobTitle,
}: {
  resume: ResumePayload
  jobTitle: string
}) {
  const filename = buildFilename(resume.header.full_name, jobTitle)
  const document = <ResumeDocument resume={resume} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Preview</h2>
          <p className="text-xs text-slate-500">
            This is the exact file you will download.
          </p>
        </div>

        {/* PDFDownloadLink generates the blob lazily and hands back render
            state, so the button can say what it is doing. */}
        <PDFDownloadLink document={document} fileName={filename}>
          {({ loading, error }) =>
            error ? (
              <span className="text-sm text-red-600">Could not build the PDF.</span>
            ) : (
              <span className="btn-primary">
                {loading ? 'Building PDF…' : `Download ${filename}`}
              </span>
            )
          }
        </PDFDownloadLink>
      </div>

      {/* Letter aspect ratio (8.5 x 11) so the preview matches the real page. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <PDFViewer
          showToolbar={false}
          style={{ width: '100%', height: '820px', border: 'none' }}
        >
          {document}
        </PDFViewer>
      </div>
    </div>
  )
}
