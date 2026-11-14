import { Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { MAX_PDF_PAGES, openPdf, PDF_ZOOMS, pageRenderScale } from '@/lib/pdf';
import { useBackToClose } from '@/lib/useBackToClose';
import { useScrollLock } from '@/lib/useScrollLock';

export interface PdfViewerProps {
  /** The file's name, shown at the top. */
  title: string;
  /** The PDF's bytes. Called on open, and again on Try again. */
  load: () => Promise<ArrayBuffer>;
  /** Save the file to the phone. Absent: no Save button. */
  onSave?: () => void;
  onClose: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; doc: PDFDocumentProxy };

/**
 * A PDF, read inside the app: every page drawn one under the other, − / + to
 * get closer, Save to keep the file, and ✕ or the phone's Back to close.
 *
 * WHY THIS EXISTS
 * ---------------
 * Inside the Android app a PDF could only leave: the phone app hands any
 * outside address to Chrome, and its WebView cannot draw a PDF itself. So a
 * paper in chat, or the certificate in the DU OTP box, took the owner out of
 * the app to read it. This draws the pages here (`lib/pdf.ts` has the engine).
 *
 * Mounted on `document.body`, like `PhotoViewer`: a chat bubble may sit inside
 * a transformed parent, and a `fixed` overlay there would be pinned to it.
 */
export function PdfViewer({ title, load, onSave, onClose }: PdfViewerProps) {
  const t = useT();
  useBackToClose(onClose);
  useScrollLock();
  const [state, setState] = React.useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [zoomIdx, setZoomIdx] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const enqueue = useRenderQueue();

  // The caller's `load` is usually an inline arrow; only a new attempt reloads.
  const loadRef = React.useRef(load);
  loadRef.current = load;

  React.useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    setState({ status: 'loading' });
    loadRef
      .current()
      .then(openPdf)
      .then((doc) => {
        opened = doc;
        if (cancelled) void doc.destroy();
        else setState({ status: 'ready', doc });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [attempt]);

  const zoom = PDF_ZOOMS[zoomIdx] ?? 1;
  // 16px either side of the page, as the chat's own gutters.
  const pageWidth = Math.max(120, (width - 32) * zoom);
  const pages = state.status === 'ready' ? Math.min(state.doc.numPages, MAX_PDF_PAGES) : 0;
  const cut = state.status === 'ready' && state.doc.numPages > MAX_PDF_PAGES;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      data-no-swipe
      className="fixed inset-0 z-50 flex flex-col bg-neutral-800 text-white"
    >
      <div className="safe-top flex shrink-0 items-center gap-2 bg-neutral-900 px-2 py-2">
        <button
          type="button"
          aria-label={t('common.cancel')}
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-white/15"
        >
          <X width={22} strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{title}</p>
          {state.status === 'ready' ? (
            <p className="text-[12px] text-white/70">
              {t('pdf.pageCount', { n: state.doc.numPages })}
            </p>
          ) : null}
        </div>
        {onSave ? (
          <button
            type="button"
            onClick={onSave}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium active:bg-white/15"
          >
            <Download width={18} strokeWidth={2} aria-hidden />
            {t('pdf.save')}
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {state.status === 'loading' ? (
          <div role="status" className="flex h-full flex-col items-center justify-center gap-3">
            <Spinner size={24} />
            <p className="text-[14px] text-white/80">{t('pdf.loading')}</p>
          </div>
        ) : state.status === 'failed' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p role="alert" className="text-[15px]">
              {t('pdf.failed')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="min-h-11 rounded-full bg-white px-4 text-[14px] font-medium text-neutral-900 active:bg-white/80"
              >
                {t('common.retry')}
              </button>
              {onSave ? (
                <button
                  type="button"
                  onClick={onSave}
                  className="min-h-11 rounded-full border border-white/40 px-4 text-[14px] font-medium active:bg-white/15"
                >
                  {t('pdf.save')}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex w-max min-w-full flex-col items-center gap-3 px-4 py-4">
            {Array.from({ length: pages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={state.doc}
                pageNumber={i + 1}
                cssWidth={pageWidth}
                label={t('pdf.pageN', { n: i + 1 })}
                root={scrollRef}
                enqueue={enqueue}
              />
            ))}
            {cut ? (
              <p className="max-w-xs text-center text-[13px] text-white/80">
                {t('pdf.firstPagesOnly', { n: MAX_PDF_PAGES })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {state.status === 'ready' ? (
        <div className="safe-bottom pointer-events-none absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            type="button"
            aria-label={t('pdf.zoomIn')}
            disabled={zoomIdx >= PDF_ZOOMS.length - 1}
            onClick={() => setZoomIdx((z) => Math.min(z + 1, PDF_ZOOMS.length - 1))}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900/90 shadow-lg active:bg-neutral-700 disabled:opacity-40"
          >
            <ZoomIn width={22} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={t('pdf.zoomOut')}
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((z) => Math.max(z - 1, 0))}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900/90 shadow-lg active:bg-neutral-700 disabled:opacity-40"
          >
            <ZoomOut width={22} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** The width of an element, kept current. Falls back to the window before it is laid out. */
function useElementWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = React.useState(() =>
    typeof window === 'undefined' ? 360 : window.innerWidth,
  );
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * Pages are drawn ONE AT A TIME, in the order asked, as pdf.js's own viewer does,
 * each onto a canvas kept in ordinary memory (`willReadFrequently`) rather than
 * on the graphics chip.
 *
 * Both were found on a Pixel 9 emulator (Android WebView 133), inside the real
 * phone app, with a seven-page file that desktop Chrome drew correctly:
 *  - drawn all at once, page 2 showed the cover page, and page 1 carried scraps
 *    of page 2's text down its left edge. One at a time fixed that;
 *  - a line from the cover's dark box still showed at the top of page 2, and the
 *    canvases read back as blank. On an ordinary-memory canvas both went away.
 * A page or three is quick to draw either way; correctness is what matters.
 */
type Enqueue = (job: () => Promise<void>) => void;

function useRenderQueue(): Enqueue {
  const tail = React.useRef<Promise<void>>(Promise.resolve());
  return React.useCallback((job: () => Promise<void>) => {
    tail.current = tail.current.then(job, job).catch(() => undefined);
  }, []);
}

/**
 * One page: a white box of the page's own shape at once (so the scroll does not
 * jump), drawn only when it comes near the screen — a forty-page file drawn all
 * at once is more memory than a cheap phone has.
 */
function PdfPage({
  doc,
  pageNumber,
  cssWidth,
  label,
  root,
  enqueue,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  label: string;
  root: React.RefObject<HTMLElement>;
  enqueue: Enqueue;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [page, setPage] = React.useState<PDFPageProxy | null>(null);
  const [near, setNear] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    doc
      .getPage(pageNumber)
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber]);

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: '100% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !near || !canvas) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy['render']> | null = null;
    enqueue(async () => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const base = page.getViewport({ scale: 1 });
      const scale = pageRenderScale(base.width, base.height, cssWidth, window.devicePixelRatio);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: ctx, viewport });
      // A cancelled draw rejects; the queue moves on either way.
      await task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [page, near, cssWidth, enqueue]);

  const ratio = page
    ? page.getViewport({ scale: 1 }).height / page.getViewport({ scale: 1 }).width
    : Math.SQRT2;
  return (
    <div
      ref={boxRef}
      className="shrink-0 bg-white shadow-lg"
      style={{ width: cssWidth, height: cssWidth * ratio }}
    >
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />
    </div>
  );
}
