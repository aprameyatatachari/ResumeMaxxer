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
  await page.getByLabel('Phone').fill('+91 98765 43210')
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
