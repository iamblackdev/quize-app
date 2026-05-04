'use client'

import * as pdfjs from 'pdfjs-dist'

// Use the worker matching the installed pdfjs version, fetched from a CDN.
// Bundling the worker ourselves would require Webpack config changes.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

// "12-13" → 12. Falls back to NaN for parsing failures, which the caller skips.
function firstPageNumber(ref: string): number {
  const match = ref.match(/\d+/)
  return match ? parseInt(match[0], 10) : NaN
}

export async function renderPdfPageToDataUrl(
  file: File,
  pageRef: string,
  scale = 1.5,
  jpegQuality = 0.7,
): Promise<string | null> {
  const pageNumber = firstPageNumber(pageRef)
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  try {
    if (pageNumber > pdf.numPages) return null
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', jpegQuality)
  } finally {
    await pdf.destroy()
  }
}
