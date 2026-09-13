import { expect, test } from '@playwright/test'

import { addDegree, signUp, uniqueEmail } from './helpers'

/**
 * The vault, through the UI.
 *
 * This is where the Indian education model meets the form that produces it:
 * the level switch changes which fields exist, and the backend rejects
 * mismatched combinations, so the two have to agree or the student hits a 422.
 */

test.beforeEach(async ({ page }) => {
  await signUp(page, { name: 'Ananya Krishnan', email: uniqueEmail('vault') })
})

test('contact details persist across a reload', async ({ page }) => {
  await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210')
  await page.getByLabel('GitHub username').fill('ananyak')
  await page.getByRole('button', { name: 'Save contact details' }).click()

  await expect(page.getByText('Saved.')).toBeVisible()

  await page.reload()
  // The field holds the username only; the prefix is shown as a static addon.
  await expect(page.getByLabel('GitHub username')).toHaveValue('ananyak')
})

test('a degree is saved with month-and-year dates and a CGPA', async ({ page }) => {
  await addDegree(page)

  await expect(page.getByText('B.Tech Computer Science')).toBeVisible()
  await expect(page.getByText('CGPA 8.74')).toBeVisible()
  await expect(page.getByText('Aug 2022 - May 2026')).toBeVisible()
})

test('the education form changes shape with the level', async ({ page }) => {
  await page.getByRole('button', { name: 'Add qualification' }).click()

  // College: a degree and months, no board.
  await expect(page.getByLabel('Degree')).toBeVisible()
  await expect(page.getByLabel('Start month')).toBeVisible()
  await expect(page.getByLabel('Board')).toBeHidden()

  // Class XII: board and stream, and only the year of passing.
  await page.getByRole('button', { name: 'Class XII (Senior Secondary)' }).click()
  await expect(page.getByLabel('Board')).toBeVisible()
  await expect(page.getByLabel('Stream / specialisation')).toBeVisible()
  await expect(page.getByLabel('Degree')).toBeHidden()
  await expect(page.getByLabel('Start month')).toBeHidden()
  await expect(page.getByLabel('Start year')).toBeHidden()
  await expect(page.getByLabel('Year of passing')).toBeVisible()

  // Class X: a board, but no stream - the curriculum is common.
  await page.getByRole('button', { name: 'Class X (Secondary)' }).click()
  await expect(page.getByLabel('Board')).toBeVisible()
  await expect(page.getByLabel('Stream / specialisation')).toBeHidden()
  await expect(page.getByLabel('Start year')).toBeHidden()

  // School: the whole tenure, with per-exam results instead of one board.
  await page.getByRole('button', { name: 'School (X & XII together)' }).click()
  await expect(page.getByLabel('Start year')).toBeVisible()
  await expect(page.getByLabel('Class XII board')).toBeVisible()
  await expect(page.getByLabel('Class X board')).toBeVisible()
  await expect(page.getByLabel('Board', { exact: true })).toBeHidden()
})

test('a Class XII entry records its board and stream', async ({ page }) => {
  await page.getByRole('button', { name: 'Add qualification' }).click()
  await page.getByRole('button', { name: 'Class XII (Senior Secondary)' }).click()

  await page.getByLabel('School name').fill('Delhi Public School')
  await page.getByLabel('Board').selectOption('CBSE')
  await page.getByLabel('Stream / specialisation').selectOption('PCMC')
  await page.getByLabel('Year of passing').selectOption('2022')
  await page.getByLabel('Percentage').fill('94.2')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // Rendered the way it will read on the resume.
  await expect(page.getByText('CBSE - Class XII (PCMC)')).toBeVisible()
  await expect(page.getByText('94.2%')).toBeVisible()
  // Only the year of passing, not a range.
  await expect(page.getByText('2022', { exact: true })).toBeVisible()
})

test('a student who changed schools adds one School entry for each', async ({ page }) => {
  // Class X at one school...
  await page.getByRole('button', { name: 'Add qualification' }).click()
  await page.getByRole('button', { name: 'School (X & XII together)' }).click()
  await page.getByLabel('School name').fill('Kendriya Vidyalaya')
  await page.getByLabel('From grade').fill('LKG')
  await page.getByLabel('To grade').fill('Class X')
  await page.getByLabel('Start year').selectOption('2010')
  await page.getByLabel('End year').selectOption('2020')
  await page.getByLabel('I took Class XII at this school').uncheck()
  await page.getByLabel('Class X board').selectOption('CBSE')
  await page.getByLabel('Class X score').fill('96')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // ...and Class XII at another.
  await page.getByRole('button', { name: 'Add qualification' }).click()
  await page.getByRole('button', { name: 'School (X & XII together)' }).click()
  await page.getByLabel('School name').fill('Narayana Junior College')
  await page.getByLabel('Start year').selectOption('2020')
  await page.getByLabel('End year').selectOption('2022')
  await page.getByLabel('I took Class X at this school').uncheck()
  await page.getByLabel('Class XII board').selectOption('STATE')
  await page.getByLabel('Class XII stream').selectOption('PCM')
  await page.getByLabel('Class XII score').fill('94.2')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // Each school is its own heading with its tenure, results as bullets.
  await expect(page.getByText('Kendriya Vidyalaya')).toBeVisible()
  // Typed grades describe the span in place of the exam name.
  await expect(page.getByText('CBSE - LKG to Class X', { exact: true })).toBeVisible()
  await expect(page.getByText('2010 - 2020')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Class X: 96%' })).toBeVisible()

  await expect(page.getByText('Narayana Junior College')).toBeVisible()
  await expect(page.getByText('State Board - Class XII', { exact: true })).toBeVisible()
  await expect(page.getByText('2020 - 2022')).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Class XII (PCM): 94.2%' }),
  ).toBeVisible()
})

test('an experience with bullets can be added and removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Add role' }).click()
  await page.getByLabel('Title').fill('Software Engineering Intern')
  await page.getByLabel('Organization').fill('Razorpay')
  await page.getByLabel('Started').fill('2025-05-01')
  await page.getByLabel('Ended (blank = current)').fill('2025-07-31')
  await page.getByRole('button', { name: 'Save role' }).click()

  await expect(page.getByText('Software Engineering Intern')).toBeVisible()

  await page.getByLabel('Bullet text').fill('Built a reconciliation service in FastAPI')
  await page.getByLabel('Tags, comma separated').fill('python, fastapi')
  await page.getByRole('button', { name: 'Add bullet' }).click()

  await expect(
    page.getByText('Built a reconciliation service in FastAPI'),
  ).toBeVisible()
  // The empty-vault prompt is replaced once there is something to tailor from.
  await expect(page.getByText(/achievement line/)).toBeVisible()
})

test('a project can be added manually', async ({ page }) => {
  await page.getByRole('button', { name: 'Add manually' }).click()
  await page.getByLabel('Title').fill('Course Scheduler')
  await page.getByLabel('Tech stack').fill('Python, FastAPI, PostgreSQL')
  await page.getByRole('button', { name: 'Save project' }).click()

  await expect(page.getByText('Course Scheduler')).toBeVisible()
  await expect(page.getByText('Python, FastAPI, PostgreSQL')).toBeVisible()
})

test('every vault entry can be edited in place, without deleting it', async ({ page }) => {
  // --- Education: change a field, and it survives a reload ----------------
  await addDegree(page)
  await page.getByRole('button', { name: 'Edit VIT Vellore' }).click()
  // The form opens pre-filled with what is stored.
  await expect(page.getByLabel('Degree')).toHaveValue('B.Tech Computer Science')
  await page.getByLabel('CGPA').fill('9.1')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('CGPA 9.1')).toBeVisible()

  // An edit the backend rejects shows its reason and saves nothing.
  await page.getByRole('button', { name: 'Edit VIT Vellore' }).click()
  await page.getByLabel('Start year').selectOption('2026')
  await page.getByLabel('End year').selectOption('2022')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('end year cannot be before start year')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()

  // --- Experience ---------------------------------------------------------
  await page.getByRole('button', { name: 'Add role' }).click()
  await page.getByLabel('Title').fill('Intern')
  await page.getByLabel('Organization').fill('Razorpay')
  await page.getByLabel('Started').fill('2025-05-01')
  await page.getByRole('button', { name: 'Save role' }).click()

  await page.getByRole('button', { name: 'Edit Intern at Razorpay' }).click()
  await page.getByLabel('Title').fill('Backend Engineering Intern')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Backend Engineering Intern')).toBeVisible()

  // --- Bullet -------------------------------------------------------------
  await page.getByLabel('Bullet text').fill('Built a service')
  await page.getByRole('button', { name: 'Add bullet' }).click()
  await page.getByRole('button', { name: 'Edit bullet' }).click()
  await page.getByLabel('Edit bullet text').fill('Built a reconciliation service in FastAPI')
  await page.getByLabel('Edit tags').fill('python, fastapi')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Built a reconciliation service in FastAPI')).toBeVisible()
  await expect(page.getByText('Built a service', { exact: true })).toBeHidden()

  // --- Project ------------------------------------------------------------
  await page.getByRole('button', { name: 'Add manually' }).click()
  await page.getByLabel('Title').fill('Scheduler')
  await page.getByRole('button', { name: 'Save project' }).click()
  await page.getByRole('button', { name: 'Edit Scheduler' }).click()
  await page.getByLabel('Tech stack').fill('Python, OR-Tools')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Python, OR-Tools')).toBeVisible()

  // Everything is really stored, not just shown.
  await page.reload()
  await expect(page.getByText('CGPA 9.1')).toBeVisible()
  await expect(page.getByText('Backend Engineering Intern')).toBeVisible()
  await expect(page.getByText('Built a reconciliation service in FastAPI')).toBeVisible()
  await expect(page.getByText('Python, OR-Tools')).toBeVisible()
})

test('entries are shown in the order the student sets, and it persists', async ({ page }) => {
  // Added degree first, then a Class XII entry - no automatic date sorting.
  await addDegree(page)
  await page.getByRole('button', { name: 'Add qualification' }).click()
  await page.getByRole('button', { name: 'Class XII (Senior Secondary)' }).click()
  await page.getByLabel('School name').fill('Delhi Public School')
  await page.getByLabel('Board').selectOption('CBSE')
  await page.getByLabel('Stream / specialisation').selectOption('PCM')
  await page.getByLabel('Year of passing').selectOption('2022')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const headings = page.locator('section').filter({ hasText: 'Education' }).locator('h3')
  await expect(headings).toHaveText([/VIT Vellore/, /Delhi Public School/])

  // The first entry cannot move up; the last cannot move down.
  await expect(page.getByRole('button', { name: 'Move VIT Vellore up' })).toBeDisabled()
  await page.getByRole('button', { name: 'Move Delhi Public School up' }).click()
  await expect(headings).toHaveText([/Delhi Public School/, /VIT Vellore/])

  await page.reload()
  await expect(headings).toHaveText([/Delhi Public School/, /VIT Vellore/])

  // Drag-and-drop does the same thing: drag the degree's grip onto the
  // school's card and the degree takes its place.
  const cards = page.locator('[data-sortable="education"]')
  await page.getByLabel('Drag VIT Vellore to reorder').dragTo(cards.first())
  await expect(headings).toHaveText([/VIT Vellore/, /Delhi Public School/])

  await page.reload()
  await expect(headings).toHaveText([/VIT Vellore/, /Delhi Public School/])
})

test('extra links can be added, hidden from the resume and rearranged', async ({ page }) => {
  await page.getByLabel('New link display text').fill('LeetCode')
  await page.getByLabel('New link URL').fill('leetcode.com/u/ananya')
  await page.getByRole('button', { name: 'Add link' }).click()
  // Typing the next link straight away must not be wiped by the first save.
  await page.getByLabel('New link URL').fill('kaggle.com/ananya')
  await page.getByRole('button', { name: 'Add link' }).click()

  // A bare domain is stored as a full link; blank display text shows the URL.
  await expect(page.getByText('https://leetcode.com/u/ananya')).toBeVisible()
  await expect(page.getByText('kaggle.com/ananya', { exact: true })).toBeVisible()

  // An unsafe link is refused with a reason.
  await page.getByLabel('New link URL').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('only http and https links are allowed')).toBeVisible()
  await page.getByLabel('New link URL').fill('')

  await page.getByLabel('Show LeetCode on resume').uncheck()
  await page.getByRole('button', { name: 'Move https://kaggle.com/ananya up' }).click()

  // Contact-field switches save with the contact form.
  await page.getByLabel('Show phone on resume').uncheck()
  await page.getByRole('button', { name: 'Save contact details' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Show LeetCode on resume')).not.toBeChecked()
  await expect(page.getByLabel('Show phone on resume')).not.toBeChecked()
  const linkNames = page.locator('li').filter({ has: page.getByLabel(/^Show .* on resume$/) }).locator('p.font-medium')
  await expect(linkNames).toHaveText(['kaggle.com/ananya', 'LeetCode'])
})

test('extracurricular activities have their own section, separate from experience', async ({ page }) => {
  const experience = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Experience', exact: true }) })
  const extracurricular = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Extracurricular activities' }) })

  await page.getByRole('button', { name: 'Add activity' }).click()
  await page.getByLabel('Title').fill('Head of Technical Events')
  await page.getByLabel('Organization').fill('IEEE Student Branch')
  await page.getByLabel('Started').fill('2023-08-01')
  await page.getByRole('button', { name: 'Save activity' }).click()

  await expect(extracurricular.getByText('Head of Technical Events')).toBeVisible()
  await expect(experience.getByText('Head of Technical Events')).toBeHidden()

  // Changing the type moves it to the other section.
  await page.getByRole('button', { name: 'Edit Head of Technical Events at IEEE Student Branch' }).click()
  await page.getByLabel('Type').selectOption('WORK')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(experience.getByText('Head of Technical Events')).toBeVisible()
  await expect(extracurricular.getByText('Head of Technical Events')).toBeHidden()
})

test('achievements can be added, hidden, reordered and edited', async ({ page }) => {
  const add = async (title: string, detail = '', when = '') => {
    await page.getByRole('button', { name: 'Add achievement' }).click()
    await page.getByLabel('Achievement', { exact: true }).fill(title)
    if (detail) await page.getByLabel('Detail (optional)').fill(detail)
    if (when) await page.getByLabel('When (optional)').fill(when)
    await page.getByRole('button', { name: 'Save achievement' }).click()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
  }
  await add('Winner, Smart India Hackathon', '1st of 400 teams', 'Mar. 2024')
  await add('Knight, LeetCode')

  await page.getByLabel('Show Knight, LeetCode on resume').uncheck()
  await page.getByRole('button', { name: 'Move Knight, LeetCode up' }).click()
  await page.getByRole('button', { name: 'Edit Winner, Smart India Hackathon' }).click()
  await page.getByLabel('When (optional)').fill('2024')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await page.reload()
  const titles = page.locator('[data-sortable="achievement"] span.font-semibold')
  await expect(titles).toHaveText(['Knight, LeetCode', 'Winner, Smart India Hackathon'])
  await expect(page.getByLabel('Show Knight, LeetCode on resume')).not.toBeChecked()
  await expect(page.getByText('2024', { exact: true })).toBeVisible()
})

test('the tailor page asks about resume length and remembers the answer', async ({ page }) => {
  await page.goto('/tailor')
  const onePage = page.getByRole('radio', { name: /Keep it to one page/ })
  const longer = page.getByRole('radio', { name: /It can go past one page/ })

  // One page unless the student says otherwise.
  await expect(onePage).toBeChecked()
  await longer.check()
  await page.reload()
  await expect(longer).toBeChecked()
})

test('tailoring refuses an empty vault instead of calling the AI', async ({ page }) => {
  await page.goto('/tailor')

  // The upload input is hidden behind a styled label, so set it directly.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'jd.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Backend intern. Python, FastAPI and PostgreSQL required. Bengaluru.',
    ),
  })
  await page.getByRole('button', { name: 'Tailor my resume' }).click()

  await expect(page.getByRole('alert')).toContainText('no achievement bullets')
})

test('an unreadable job description is rejected before upload', async ({ page }) => {
  await page.goto('/tailor')

  await page.locator('input[type="file"]').setInputFiles({
    name: 'jd.doc',
    mimeType: 'application/msword',
    buffer: Buffer.from('legacy binary'),
  })

  await expect(page.getByRole('alert')).toContainText('Legacy .doc')
})
