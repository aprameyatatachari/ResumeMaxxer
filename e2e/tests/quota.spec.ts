import { expect, test } from '@playwright/test'

import { signUp, uniqueEmail } from './helpers'

/**
 * The free allowance and the bring-your-own-key loop.
 *
 * Costs nothing to run: the allowance is reported by `GET /api/tailor/quota`,
 * and saving a key is browser-side, so none of this triggers a Gemini call or
 * a tailoring run. That is why it is worth having here rather than leaving the
 * whole feature to unit tests - it exercises the real wiring between
 * localStorage, the request header and the API's reading of it, which is
 * exactly the seam that unit tests on either side cannot see.
 *
 * The quota arithmetic itself lives in backend/tests/test_quota.py, and the
 * endpoint behaviour in backend/tests/test_byok_and_quota_api.py.
 */

test.beforeEach(async ({ page }) => {
  await signUp(page, { name: 'Ananya Krishnan', email: uniqueEmail('quota') })
  await page.goto('/tailor')
})

test('a new student is shown their full free allowance', async ({ page }) => {
  // A fresh account has spent nothing, and the count has to be visible BEFORE
  // a run - it changes whether a student bothers tailoring for a role they are
  // lukewarm about.
  await expect(page.getByText(/free tailoring runs left this week/)).toBeVisible()
  await expect(page.getByText(/3 of 3/)).toBeVisible()
})

test('a student can save their own key, and the app stops counting', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Use your own key instead' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // The instructions are the point of the dialog, not decoration: someone who
  // has just hit the wall needs walking through minting a key, and a link
  // alone loses them.
  await expect(dialog.getByText('How to get one')).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: 'aistudio.google.com/apikey' }),
  ).toHaveAttribute('href', 'https://aistudio.google.com/apikey')

  // A mis-paste is caught locally, before a request is spent finding out.
  await dialog.getByLabel('Your Gemini API key').fill('AIzaShort')
  await dialog.getByRole('button', { name: 'Save key' }).click()
  await expect(dialog.getByText(/looks too short/)).toBeVisible()

  await dialog
    .getByLabel('Your Gemini API key')
    .fill('AIzaSyE2EPlaceholderKeyLongEnough00000000')
  await dialog.getByRole('button', { name: 'Save key' }).click()

  // The banner flips, which proves the round trip: the key reached
  // localStorage, went out as a header, and the API read it back as
  // `using_own_key`.
  await expect(page.getByText(/Running on your own Gemini key/)).toBeVisible()
  await expect(page.getByText(/free tailoring runs left/)).toBeHidden()
})

test('removing the key puts the student back on the free allowance', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Use your own key instead' }).click()
  await page
    .getByRole('dialog')
    .getByLabel('Your Gemini API key')
    .fill('AIzaSyE2EPlaceholderKeyLongEnough00000000')
  await page.getByRole('dialog').getByRole('button', { name: 'Save key' }).click()
  await expect(page.getByText(/Running on your own Gemini key/)).toBeVisible()

  await page.getByRole('button', { name: 'Manage key' }).click()
  const dialog = page.getByRole('dialog')

  // Masked, never whole - enough to recognise the key you chose and useless to
  // anyone reading over a shoulder.
  await expect(dialog.getByText(/^AIza…0000$/)).toBeVisible()
  await expect(dialog.getByText('AIzaSyE2EPlaceholderKeyLongEnough00000000')).toBeHidden()

  await dialog.getByRole('button', { name: 'Remove' }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByText(/3 of 3/)).toBeVisible()

  // And it is really gone, not merely hidden.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('resumemaxxer.gemini_api_key'),
  )
  expect(stored).toBeNull()
})
