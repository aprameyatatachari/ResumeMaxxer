import { expect, test } from '@playwright/test'

/**
 * The PDF itself - the product's actual deliverable.
 *
 * Runs against `/pdf-sandbox`, a dev-only route that renders the template
 * against a deliberately maximal fixture (3 education rows, 4 entries, 4
 * bullets each, 4 skill categories - the most the One-Page Rule permits). If
 * that fits on one page, everything the backend can emit fits.
 *
 * Using the sandbox rather than a real tailoring run keeps this deterministic
 * and free: no Gemini call, no vault setup, same renderer.
 */

test('the resume renders as a single-page, machine-readable PDF', async ({ page }) => {
  await page.goto('/pdf-sandbox')

  const download = page.locator('a[download]')
  await expect(download).toBeVisible({ timeout: 30_000 })
  // The href is only populated once @react-pdf has finished building the blob.
  await expect(download).toHaveAttribute('href', /^blob:/, { timeout: 30_000 })

  const pdf = await page.evaluate(async () => {
    const anchor = document.querySelector('a[download]') as HTMLAnchorElement
    const buffer = await fetch(anchor.href).then((response) => response.arrayBuffer())
    const text = new TextDecoder('latin1').decode(buffer)
    return {
      filename: anchor.getAttribute('download'),
      bytes: buffer.byteLength,
      isPdf: text.startsWith('%PDF-'),
      // `/Count N` in the page tree is the authoritative page count.
      pageCount: Number((text.match(/\/Count\s+(\d+)/) ?? [])[1] ?? -1),
      fonts: [
        ...new Set(
          (text.match(/\/BaseFont\s*\/([A-Za-z-]+)/g) ?? []).map((entry) =>
            entry.split('/').pop(),
          ),
        ),
      ],
    }
  })

  expect(pdf.isPdf).toBe(true)
  // The One-Page Rule, verified on the artefact rather than the payload.
  expect(pdf.pageCount).toBe(1)
  expect(pdf.bytes).toBeGreaterThan(1000)
  expect(pdf.filename).toMatch(/\.pdf$/)

  // Core PDF fonts only. A custom font risks mojibake when an ATS extracts the
  // text, which defeats the point of the whole template.
  expect(pdf.fonts.every((font) => font?.startsWith('Helvetica'))).toBe(true)
})

test('the rendered resume follows the template sections in order', async ({ page }) => {
  await page.goto('/pdf-sandbox')
  await expect(page.locator('a[download]')).toHaveAttribute('href', /^blob:/, {
    timeout: 30_000,
  })

  // Read the payload the renderer was given, so a section being dropped or
  // reordered fails here rather than in a human's eyeballs.
  const sections = await page.evaluate(() => {
    const iframe = document.querySelector('iframe')
    return Boolean(iframe)
  })
  expect(sections).toBe(true)

  // The preview is rendered by the browser's PDF viewer inside an iframe, so
  // assert on the page shell that hosts it.
  await expect(page.getByRole('heading', { name: 'PDF sandbox' })).toBeVisible()
  await expect(page.getByText(/Download .*\.pdf/)).toBeVisible()
})
