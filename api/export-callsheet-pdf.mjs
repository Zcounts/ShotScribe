import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const MAX_HTML_LENGTH = 1_500_000

function getRequestBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  if (req.body && typeof req.body === 'object') return req.body
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = getRequestBody(req)
  const html = typeof body?.html === 'string' ? body.html : ''
  const fileName = String(body?.fileName || 'callsheet.pdf')
    .replace(/[^\w.\- ]+/g, '')
    .trim() || 'callsheet.pdf'

  if (!html || html.length > MAX_HTML_LENGTH) {
    res.status(400).json({ error: 'Invalid callsheet HTML payload.' })
    return
  }

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.55in',
        left: '0.5in',
      },
      preferCSSPageSize: false,
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.status(200).send(Buffer.from(pdfBuffer))
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate callsheet PDF.',
      details: error?.message || 'unknown',
    })
  } finally {
    if (browser) await browser.close()
  }
}
