import { useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Link } from 'react-router-dom'

import Alert from '../components/Alert'
import Spinner from '../components/Spinner'
import { ArrowRight } from '../components/icons'
import EducationSection from '../components/vault/EducationSection'
import AchievementsSection from '../components/vault/AchievementsSection'
import ExperienceSection from '../components/vault/ExperienceSection'
import ProfileSection from '../components/vault/ProfileSection'
import ProjectSection from '../components/vault/ProjectSection'
import { groupBullets, useVault } from '../hooks/useVault'

/**
 * The Master Vault - everything the student has ever done, in one place.
 *
 * All three sections mutate through the same `reload` callback, so any write
 * anywhere refreshes the single source of truth rather than each section
 * keeping its own copy that can drift.
 */
export default function VaultPage() {
  const { vault, loading, error, reload } = useVault()

  // Bullets arrive as one flat list (the backend cannot nest them - the parent
  // pointer is polymorphic), so the join happens here, once per vault change.
  const groupedBullets = useMemo(
    () => groupBullets(vault?.bullets ?? []),
    [vault?.bullets],
  )

  // Only the first load blanks the page; later refetches update in place so
  // forms, scroll position and save confirmations survive.
  if (loading && !vault) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner label="Loading your vault…" />
      </div>
    )
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>
  }

  if (!vault) return null

  const bulletCount = vault.bullets.length

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-sm text-[clamp(2rem,4vw,3rem)] text-ink">
            Your vault
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {bulletCount === 0
              ? 'Add experience below, then tailor a resume to any job description.'
              : `${bulletCount} achievement ${bulletCount === 1 ? 'line' : 'lines'} ready to tailor.`}
          </p>
        </div>
        <Link
          to="/tailor"
          className={bulletCount === 0 ? 'btn-secondary' : 'btn-primary'}
          aria-disabled={bulletCount === 0}
        >
          Tailor a resume
          <ArrowRight size={16} />
        </Link>
      </header>

      {bulletCount === 0 && (
        <Alert variant="info">
          The tailoring engine can only select from what is in here. Import a
          GitHub repo or add a role with a few bullets to get started.
        </Alert>
      )}

      {/* One drag-and-drop context for the page. Each section scopes its
          own drag type, so entries only ever move within their own list. */}
      <DndProvider backend={HTML5Backend}>
        <ProfileSection user={vault.user} links={vault.links} onChange={reload} />
        <EducationSection educations={vault.educations} onChange={reload} />
        <ExperienceSection
          kind="WORK"
          experiences={vault.experiences}
          groupedBullets={groupedBullets}
          onChange={reload}
        />
        <ProjectSection
          projects={vault.projects}
          groupedBullets={groupedBullets}
          onChange={reload}
        />
        <ExperienceSection
          kind="EXTRACURRICULAR"
          experiences={vault.experiences}
          groupedBullets={groupedBullets}
          onChange={reload}
        />
        <AchievementsSection achievements={vault.achievements} onChange={reload} />
      </DndProvider>
    </div>
  )
}
