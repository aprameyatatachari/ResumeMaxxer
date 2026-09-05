import type { ResumePayload } from '../lib/types'

/**
 * Edit the resume before downloading it.
 *
 * The document is a compiled PDF, so text cannot be typed into it directly.
 * This edits the payload the PDF is built from instead, which gets to the same
 * place: fix a bullet here, hit "Update preview", and the real document
 * rebuilds. Every field that appears on the page is editable.
 *
 * Changes are held in the parent's state and only persisted when the student
 * hits "Save changes", so experimenting is free.
 */
export default function ResumeEditor({
  resume,
  onChange,
}: {
  resume: ResumePayload
  onChange: (next: ResumePayload) => void
}) {
  /** Structured clone before mutating: the payload is nested, and a shallow
   *  copy would let React miss the change or share arrays between renders. */
  function edit(mutate: (draft: ResumePayload) => void) {
    const draft = structuredClone(resume)
    mutate(draft)
    onChange(draft)
  }

  return (
    <div className="card space-y-5">
      <p className="text-xs text-slate-500">
        Editing the text below rebuilds the PDF. Nothing is saved until you
        press <strong>Save changes</strong>.
      </p>

      {/* --- Header ------------------------------------------------------ */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-900">Header</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            aria-label="Full name"
            value={resume.header.full_name}
            onChange={(e) => edit((d) => { d.header.full_name = e.target.value })}
            placeholder="Full name"
          />
          <input
            className="input"
            aria-label="Phone"
            value={resume.header.phone}
            onChange={(e) => edit((d) => { d.header.phone = e.target.value })}
            placeholder="Phone"
          />
        </div>
      </fieldset>

      {/* --- Experience -------------------------------------------------- */}
      {resume.experience.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Experience</legend>
          {resume.experience.map((entry, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  aria-label={`Experience ${i + 1} title`}
                  value={entry.title}
                  onChange={(e) => edit((d) => { d.experience[i].title = e.target.value })}
                />
                <input
                  className="input"
                  aria-label={`Experience ${i + 1} organization`}
                  value={entry.organization}
                  onChange={(e) =>
                    edit((d) => { d.experience[i].organization = e.target.value })
                  }
                />
              </div>
              {entry.bullets.map((bullet, b) => (
                <textarea
                  key={b}
                  className="input mt-2 text-sm"
                  rows={2}
                  aria-label={`Experience ${i + 1} bullet ${b + 1}`}
                  value={bullet}
                  onChange={(e) =>
                    edit((d) => { d.experience[i].bullets[b] = e.target.value })
                  }
                />
              ))}
            </div>
          ))}
        </fieldset>
      )}

      {/* --- Projects ---------------------------------------------------- */}
      {resume.projects.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Projects</legend>
          {resume.projects.map((entry, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  aria-label={`Project ${i + 1} name`}
                  value={entry.name}
                  onChange={(e) => edit((d) => { d.projects[i].name = e.target.value })}
                />
                <input
                  className="input"
                  aria-label={`Project ${i + 1} tech stack`}
                  value={entry.tech_stack}
                  onChange={(e) =>
                    edit((d) => { d.projects[i].tech_stack = e.target.value })
                  }
                  placeholder="Up to 5, comma separated"
                />
              </div>
              {entry.bullets.map((bullet, b) => (
                <textarea
                  key={b}
                  className="input mt-2 text-sm"
                  rows={2}
                  aria-label={`Project ${i + 1} bullet ${b + 1}`}
                  value={bullet}
                  onChange={(e) =>
                    edit((d) => { d.projects[i].bullets[b] = e.target.value })
                  }
                />
              ))}
            </div>
          ))}
        </fieldset>
      )}

      {/* --- Skills ------------------------------------------------------ */}
      {resume.skills.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-900">
            Technical skills
          </legend>
          {resume.skills.map((group, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input w-48 shrink-0"
                aria-label={`Skill category ${i + 1}`}
                value={group.category}
                onChange={(e) => edit((d) => { d.skills[i].category = e.target.value })}
              />
              <input
                className="input"
                aria-label={`Skill category ${i + 1} items`}
                value={group.items}
                onChange={(e) => edit((d) => { d.skills[i].items = e.target.value })}
              />
            </div>
          ))}
        </fieldset>
      )}
    </div>
  )
}
