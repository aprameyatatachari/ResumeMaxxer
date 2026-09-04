import { expect, type Page } from '@playwright/test'

/** Unique per run, so the suite can be re-run against the same database. */
export function uniqueEmail(prefix: string): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${suffix}@e2e.test`
}

export async function signUp(
  page: Page,
  {
    name,
    email,
    password = 'correct-horse-battery',
  }: { name: string; email: string; password?: string },
): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/vault$/)
}

/** Add a degree through the education form, asserting it saved. */
export async function addDegree(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add qualification' }).click()
  await page.getByRole('button', { name: 'College / University' }).click()

  await page.getByLabel('College / University', { exact: true }).fill('VIT Vellore')
  await page.getByLabel('Location').first().fill('Vellore, Tamil Nadu')
  await page.getByLabel('Degree').fill('B.Tech Computer Science')
  await page.getByLabel('Start month').selectOption('8')
  await page.getByLabel('Start year').selectOption('2022')
  await page.getByLabel('End month').selectOption('5')
  await page.getByLabel('End year').selectOption('2026')
  await page.getByLabel('CGPA').fill('8.74')

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('VIT Vellore')).toBeVisible()
}
