import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { ResumeExperience, ResumeProject, ResumePayload } from '../lib/types'

/**
 * ResumeDocument
 * ==============
 * A faithful port of `resume-template.tex` (Jake Gutierrez's template, itself
 * based on sb2nov) to @react-pdf/renderer. The PDF is built entirely in the
 * browser - the backend never produces a file.
 *
 * This is a REPRODUCTION, not a design. Every value below traces to something
 * in the .tex file, so do not "improve" the styling: the template is a fixed
 * requirement. The mapping, for anyone maintaining this:
 *
 *   LaTeX                                    Here
 *   ---------------------------------------  ---------------------------------
 *   \documentclass[letterpaper,11pt]          Page size="LETTER", 11pt scale
 *   \addtolength{\textwidth}{1in} + margins   0.5in horizontal padding
 *   \textbf{\Huge \scshape Name}              styles.name (small caps, 24pt)
 *   \small ... $|$ ... $|$ ...                styles.contactRow, ' | ' joins
 *   \titleformat{\section}{\scshape\large}    styles.sectionTitle
 *     [\color{black}\titlerule]               borderBottom on that title
 *   \resumeSubheading{#1}{#2}{#3}{#4}         <SubHeading> - 2 rows, 4 slots
 *   \resumeProjectHeading{#1}{#2}             <ProjectHeading> - 1 row
 *   \resumeItem                               <BulletLine>
 *   \textbf{Languages}{: ...}                 styles.skillCategory
 *
 * ATS constraints the template is built around, preserved here:
 *   * Single column - multi-column layouts get interleaved by ATS parsers.
 *   * Core PDF fonts only (Helvetica/Times) so text extraction is exact.
 *   * Real text throughout; the section rules are borders, not images.
 *   * `\pdfgentounicode=1` in LaTeX ensures a machine-readable PDF; the
 *     equivalent here is simply not rasterising anything.
 *
 * One deliberate deviation: the template's Education block has no slot for a
 * score, and Indian resumes must show CGPA or board percentage. It is appended
 * to the italic qualification line, which is the only place it fits without
 * adding structure the template does not have.
 */

// The .tex uses Latin Modern (LaTeX's default). Helvetica is the closest core
// PDF font that is guaranteed present and extracts cleanly; a custom font
// would risk mojibake in ATS text extraction, which defeats the purpose.
const styles = StyleSheet.create({
  page: {
    // \addtolength moves margins to ~0.5in on all sides.
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 36, // 0.5in
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000000',
    lineHeight: 1.2,
  },

  // --- Header: \begin{center} block ------------------------------------
  name: {
    fontSize: 24, // \Huge at 11pt base
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    // \scshape - react-pdf has no small-caps, so the payload supplies the
    // name as typed and letterSpacing approximates the template's weight.
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  contactRow: {
    marginTop: 5,
    textAlign: 'center',
    fontSize: 9.5,
  },
  link: {
    color: '#000000',
    textDecoration: 'underline', // \underline{} around each href
  },

  // --- \titleformat{\section} ------------------------------------------
  sectionTitle: {
    marginTop: 11,
    marginBottom: 3,
    paddingBottom: 1,
    borderBottomWidth: 0.6, // \titlerule
    borderBottomColor: '#000000',
    fontSize: 12, // \large
    letterSpacing: 0.8,
    textTransform: 'uppercase', // stand-in for \scshape
  },

  // --- \resumeSubheading: two rows, left/right justified ---------------
  entry: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // Left cells flex so a long title wraps instead of colliding with the date.
  rowLeft: { flex: 1, paddingRight: 12 },
  primaryLeft: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  primaryRight: { fontSize: 10.5 },
  secondaryLeft: { fontFamily: 'Helvetica-Oblique', fontSize: 9.5 },
  secondaryRight: { fontFamily: 'Helvetica-Oblique', fontSize: 9.5 },

  // --- \resumeItem ------------------------------------------------------
  bulletRow: {
    flexDirection: 'row',
    marginTop: 1.5,
    paddingLeft: 14, // \resumeItemListStart indentation
  },
  bulletGlyph: { width: 8, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5 },

  // --- Technical Skills -------------------------------------------------
  skillLine: { marginTop: 1.5, fontSize: 9.5 },
  skillCategory: { fontFamily: 'Helvetica-Bold' },
})

/** `\resumeSubheading{#1}{#2}{#3}{#4}` - bold/plain row, then italic pair. */
function SubHeading({
  primaryLeft,
  primaryRight,
  secondaryLeft,
  secondaryRight,
}: {
  primaryLeft: string
  primaryRight: string
  secondaryLeft: string
  secondaryRight: string
}) {
  return (
    <>
      <View style={styles.row}>
        <Text style={[styles.rowLeft, styles.primaryLeft]}>{primaryLeft}</Text>
        {primaryRight ? <Text style={styles.primaryRight}>{primaryRight}</Text> : null}
      </View>
      <View style={styles.row}>
        <Text style={[styles.rowLeft, styles.secondaryLeft]}>{secondaryLeft}</Text>
        {secondaryRight ? (
          <Text style={styles.secondaryRight}>{secondaryRight}</Text>
        ) : null}
      </View>
    </>
  )
}

/** `\resumeItem{...}` */
function BulletLine({ children }: { children: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletGlyph}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

/** One Experience block. `wrap={false}` keeps an entry off a page break. */
function ExperienceEntry({ entry }: { entry: ResumeExperience }) {
  return (
    <View style={styles.entry} wrap={false}>
      <SubHeading
        primaryLeft={entry.title}
        primaryRight={entry.date_range}
        secondaryLeft={entry.organization}
        secondaryRight={entry.location}
      />
      {entry.bullets.map((bullet, index) => (
        <BulletLine key={index}>{bullet}</BulletLine>
      ))}
    </View>
  )
}

/**
 * One Project block, matching `\resumeProjectHeading`:
 *   **Name** | *Tech, Stack*                             Date range
 * A single row, unlike the two-row experience heading.
 */
function ProjectEntry({ entry }: { entry: ResumeProject }) {
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.row}>
        <Text style={styles.rowLeft}>
          <Text style={styles.primaryLeft}>{entry.name}</Text>
          {entry.tech_stack ? (
            <Text style={styles.secondaryLeft}> | {entry.tech_stack}</Text>
          ) : null}
        </Text>
        {entry.date_range ? (
          <Text style={styles.primaryRight}>{entry.date_range}</Text>
        ) : null}
      </View>
      {entry.bullets.map((bullet, index) => (
        <BulletLine key={index}>{bullet}</BulletLine>
      ))}
    </View>
  )
}

export default function ResumeDocument({ resume }: { resume: ResumePayload }) {
  const { header, education, experience, projects, skills } = resume

  // The contact line drops empty fields so it never renders " |  | ".
  const contactParts = [header.phone, header.email, header.linkedin, header.github, header.portfolio]
    .map((part) => part?.trim())
    .filter(Boolean)

  return (
    <Document
      title={`${header.full_name} - Resume`}
      author={header.full_name}
      // Lands in the PDF metadata, which some ATS platforms index.
      subject="Resume"
      creator="ResumeMaxxer"
    >
      <Page size="LETTER" style={styles.page}>
        {/* ---------- HEADING ---------- */}
        <Text style={styles.name}>{header.full_name}</Text>
        {contactParts.length > 0 && (
          <Text style={styles.contactRow}>
            {contactParts.map((part, index) => (
              <Text key={index}>
                {index > 0 ? '  |  ' : ''}
                {/* The template underlines every contact item except the
                    phone number, which is plain text. */}
                <Text style={index === 0 && part === header.phone ? undefined : styles.link}>
                  {part}
                </Text>
              </Text>
            ))}
          </Text>
        )}

        {/* ---------- EDUCATION ---------- */}
        {education.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((item, index) => (
              <View key={index} style={styles.entry} wrap={false}>
                <SubHeading
                  primaryLeft={item.institution}
                  primaryRight={item.location}
                  // Score is appended here: the template has no slot of its
                  // own for it. See the note at the top of this file.
                  secondaryLeft={
                    item.score
                      ? `${item.qualification}, ${item.score}`
                      : item.qualification
                  }
                  secondaryRight={item.date_range}
                />
              </View>
            ))}
          </>
        )}

        {/* ---------- EXPERIENCE ---------- */}
        {experience.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Experience</Text>
            {experience.map((entry, index) => (
              <ExperienceEntry key={index} entry={entry} />
            ))}
          </>
        )}

        {/* ---------- PROJECTS ---------- */}
        {projects.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projects.map((entry, index) => (
              <ProjectEntry key={index} entry={entry} />
            ))}
          </>
        )}

        {/* ---------- TECHNICAL SKILLS ---------- */}
        {skills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Technical Skills</Text>
            {skills.map((group, index) => (
              <Text key={index} style={styles.skillLine}>
                <Text style={styles.skillCategory}>{group.category}</Text>
                {`: ${group.items}`}
              </Text>
            ))}
          </>
        )}
      </Page>
    </Document>
  )
}
