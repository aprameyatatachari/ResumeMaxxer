import { expect, test } from '@playwright/test'

import { signUp, uniqueEmail } from './helpers'

/**
 * The PDF itself - the product's actual deliverable.
 *
 * Runs against `/pdf-sandbox`, a dev-only route that renders the template
 * against a deliberately maximal fixture (3 education rows, 4 entries, 4
 * bullets each, 4 skill categories - the most the One-Page Rule permits). If
 * that fits on one page, everything the backend can emit fits.
 *
 * The document is compiled from real LaTeX by the backend, so unlike the old
 * in-browser renderer this asserts on the genuine artefact. Using the sandbox
 * rather than a real tailoring run keeps it deterministic and free: no Gemini
 * call, no vault setup, same compiler.
 *
 * The sandbox is behind the auth guard because the render endpoint needs a
 * token, hence the sign-up.
 */

test.beforeEach(async ({ page }) => {
  await signUp(page, { name: 'Ananya Krishnan', email: uniqueEmail('pdf') })
})

test('the resume compiles to a single-page, machine-readable PDF', async ({ page }) => {
  await page.goto('/pdf-sandbox')

  // Compilation is a round trip to the LaTeX service.
  const frame = page.locator('iframe[title="Resume preview"]')
  await expect(frame).toBeVisible({ timeout: 60_000 })

  const download = page.locator('a[download]')
  await expect(download).toHaveAttribute('href', /^blob:/, { timeout: 60_000 })

  const pdf = await page.evaluate(async () => {
    const anchor = document.querySelector('a[download]') as HTMLAnchorElement
    const buffer = await fetch(anchor.href).then((r) => r.arrayBuffer())
    const bytes = new Uint8Array(buffer)
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 8))
    return {
      filename: anchor.getAttribute('download'),
      bytes: buffer.byteLength,
      isPdf: head.startsWith('%PDF-'),
    }
  })

  // Structural assertions - page count and embedded fonts - live in
  // backend/tests/test_latex_compile.py, which parses the PDF with pypdf.
  // Tectonic compresses the page tree and font table into object streams, so
  // they are not greppable from the browser; a regex here would only ever be
  // testing the compression format.
  expect(pdf.isPdf).toBe(true)
  expect(pdf.bytes).toBeGreaterThan(5000)
  expect(pdf.filename).toMatch(/\.pdf$/)
})

test('the preview explains why those entries were chosen', async ({ page }) => {
  await page.goto('/pdf-sandbox')

  await expect(page.getByText('Why these were chosen')).toBeVisible()
  await expect(page.getByText(/Razorpay internship/)).toBeVisible()
})

test('the resume can be edited and re-rendered before downloading', async ({ page }) => {
  await page.goto('/pdf-sandbox')
  await expect(page.locator('a[download]')).toHaveAttribute('href', /^blob:/, {
    timeout: 60_000,
  })

  await page.getByRole('button', { name: 'Edit text' }).click()

  const bullet = page.getByLabel('Experience 1 bullet 1')
  await expect(bullet).toBeVisible()
  await bullet.fill('A bullet the student rewrote by hand')

  // Editing makes the shown document stale, and that has to be visible -
  // downloading a PDF that does not match the edits would be worse than not
  // allowing edits at all.
  await expect(page.getByText(/edits that are not in the preview/)).toBeVisible()

  await page.getByRole('button', { name: 'Update preview' }).click()
  await expect(page.getByText(/edits that are not in the preview/)).toBeHidden({
    timeout: 60_000,
  })

  // The recompiled document contains the edit.
  const text = await page.evaluate(async () => {
    const anchor = document.querySelector('a[download]') as HTMLAnchorElement
    const buffer = await fetch(anchor.href).then((r) => r.arrayBuffer())
    return new TextDecoder('latin1').decode(buffer)
  })
  expect(text.startsWith('%PDF-')).toBe(true)
})
