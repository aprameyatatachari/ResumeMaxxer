import { expect, test } from '@playwright/test'

import { signUp, uniqueEmail } from './helpers'

/**
 * Authentication, across all three services.
 *
 * The value of doing this end to end is the seam: Better Auth issues a JWT,
 * the browser forwards it, and FastAPI verifies it against a JWKS endpoint.
 * Unit tests cover each half; only this proves they agree.
 */

test('a new student can sign up and lands in their vault', async ({ page }) => {
  const email = uniqueEmail('signup')

  await signUp(page, { name: 'Ananya Krishnan', email })

  // Landing on /vault is the assertion that matters: it means the session
  // store settled before the redirect, and the guarded route let us through.
  await expect(page).toHaveURL(/\/vault$/)
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible()
  // Scope to the header: the email also appears in the contact-details help
  // text, and an unscoped match is a strict-mode violation.
  await expect(page.getByRole('banner').getByText(email)).toBeVisible()

  // The vault only renders once the API accepted our JWT and provisioned the
  // user, and the name was split out of the token's `name` claim.
  await expect(page.getByLabel('First name')).toHaveValue('Ananya')
  await expect(page.getByLabel('Last name')).toHaveValue('Krishnan')
})

test('signing out clears the session and re-guards the vault', async ({ page }) => {
  await signUp(page, { name: 'Rohan Mehta', email: uniqueEmail('signout') })

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Sign in' }),
  ).toBeVisible()

  await page.goto('/vault')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('signing back in returns to the vault with the data still there', async ({ page }) => {
  const email = uniqueEmail('return')
  const password = 'correct-horse-battery'

  await signUp(page, { name: 'Priya Nair', email, password })
  await page.getByLabel('Phone').fill('+91 98765 43210')
  await page.getByRole('button', { name: 'Save contact details' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/vault$/)
  await expect(page.getByLabel('Phone')).toHaveValue('+91 98765 43210')
})

test('a wrong password is refused without revealing whether the account exists', async ({
  page,
}) => {
  const email = uniqueEmail('wrongpass')
  await signUp(page, { name: 'Test User', email, password: 'the-right-password' })
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the-wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('signing up twice with the same email is refused', async ({ page }) => {
  const email = uniqueEmail('duplicate')
  await signUp(page, { name: 'First', email })
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.goto('/sign-up')
  await page.getByLabel('Full name').fill('Second')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('another-password')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toContainText('already exists')
})

test('guarded routes redirect when signed out', async ({ page }) => {
  for (const path of ['/vault', '/tailor', '/history']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in$/)
  }
})
