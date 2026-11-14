/**
 * The PDF reader's engine: pdf.js, loaded only the first time someone opens a PDF.
 *
 * WHY THE APP READS PDFs ITSELF
 * -----------------------------
 * Android's WebView cannot show a PDF at all — an <iframe> is a grey box, and a
 * link is handed by the phone app to Chrome, which takes the owner out of the
 * app to read a paper they were sent. So the app draws the pages itself.
 *
 * pdf.js is about a megabyte with its worker, which a low-end phone should not
 * pay for on every start, so it is a separate download fetched on the first
 * open and kept for the rest of the visit. The LEGACY build: it carries the
 * fallbacks an older WebView needs.
 *
 * The file is fetched whole, then handed over as bytes. The storage allows the
 * app's own addresses to read it (CORS), and a paper is a few hundred kilobytes,
 * so one plain fetch is simpler and surer than pdf.js's ranged requests.
 */
import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';

type PdfLib = typeof PdfJs;
type PDFDocumentProxy = PdfJs.PDFDocumentProxy;

let pdfLib: Promise<PdfLib> | null = null;

/** pdf.js and its worker, fetched once. A failed fetch is forgotten, so Try again can work. */
export function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLib) {
    pdfLib = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    pdfLib.catch(() => {
      pdfLib = null;
    });
  }
  return pdfLib;
}

/** A PDF's bytes from a signed link. Throws on anything but a 2xx. */
export async function fetchPdfBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The file could not be fetched (${res.status}).`);
  return res.arrayBuffer();
}

/** Open a PDF from its bytes. The caller destroys the document when done with it. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await loadPdfLib();
  return lib.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    // Pictures decoded the plain way, not on a worker's off-screen canvas: the
    // combination checked inside the Android app (see PdfViewer's render queue).
    isOffscreenCanvasSupported: false,
  }).promise;
}

/** The most pages drawn. A paper is a page or three; past this, Save opens the whole file. */
export const MAX_PDF_PAGES = 40;

/** Zoom steps of the − / + buttons; 1 = the page fills the screen's width. */
export const PDF_ZOOMS = [1, 1.5, 2, 3] as const;

/**
 * The scale a page is drawn at: sharp on the phone's screen (up to 2 device
 * pixels per CSS pixel), but never a canvas over `maxPixels` — a 3× zoom of an
 * A4 page at full sharpness is ~30 million pixels, which a cheap phone's
 * memory does not have.
 */
export function pageRenderScale(
  pageWidth: number,
  pageHeight: number,
  cssWidth: number,
  devicePixelRatio: number,
  maxPixels = 4_000_000,
): number {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
  const wanted = (cssWidth * dpr) / pageWidth;
  const cap = Math.sqrt(maxPixels / (pageWidth * pageHeight));
  return Math.max(0.1, Math.min(wanted, cap));
}
