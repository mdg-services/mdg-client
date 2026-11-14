import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';

import { PdfViewer } from './PdfViewer';

// pdf.js cannot run in jsdom; the engine is a double, the drawing is what is tested.
const h = vi.hoisted(() => ({ openPdf: vi.fn(), render: vi.fn(), destroy: vi.fn() }));
vi.mock('@/lib/pdf', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  openPdf: h.openPdf,
}));

function fakeDoc(numPages: number) {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: (...args: unknown[]) => {
      h.render(...args);
      return { promise: Promise.resolve(), cancel: vi.fn() };
    },
  };
  return { numPages, getPage: vi.fn(() => Promise.resolve(page)), destroy: h.destroy };
}

const bytes = () => Promise.resolve(new ArrayBuffer(8));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.openPdf.mockReset();
  h.render.mockReset();
  h.destroy.mockReset();
  // The scroll lock pins the page with scrollTo, which jsdom does not have.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // jsdom draws nothing; a context object is enough for pdf.js's double.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PdfViewer', () => {
  it('says it is opening the file, then draws every page inside the app', async () => {
    h.openPdf.mockResolvedValue(fakeDoc(3));
    renderWithProviders(<PdfViewer title="certificate.pdf" load={bytes} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'certificate.pdf' });
    expect(within(dialog).getByText('Opening the file…')).toBeInTheDocument();
    expect(await within(dialog).findByText('3 pages')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('img', { name: /^Page \d$/ })).toHaveLength(3);
    await waitFor(() => expect(h.render).toHaveBeenCalledTimes(3));
    // Never a link out: that is what the phone app hands to the browser.
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('passes the bytes the caller loads to the engine', async () => {
    const data = new ArrayBuffer(16);
    h.openPdf.mockResolvedValue(fakeDoc(1));
    renderWithProviders(
      <PdfViewer title="a.pdf" load={() => Promise.resolve(data)} onClose={() => {}} />,
    );
    await screen.findByText('1 pages');
    expect(h.openPdf).toHaveBeenCalledWith(data);
  });

  it('says so in words when the file will not open, and Try again loads it again', async () => {
    const load = vi.fn(bytes);
    h.openPdf.mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(fakeDoc(2));
    const onSave = vi.fn();
    renderWithProviders(
      <PdfViewer title="a.pdf" load={load} onSave={onSave} onClose={() => {}} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be opened here");
    // The way out that always works: keep the file.
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 pages')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Save hands the file to the caller; no Save when the caller gives none', async () => {
    h.openPdf.mockResolvedValue(fakeDoc(1));
    const onSave = vi.fn();
    const { unmount } = renderWithProviders(
      <PdfViewer title="a.pdf" load={bytes} onSave={onSave} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    unmount();
    renderWithProviders(<PdfViewer title="a.pdf" load={bytes} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('closes on ✕ and on the phone Back button, and lets go of the file', async () => {
    h.openPdf.mockResolvedValue(fakeDoc(1));
    const onClose = vi.fn();
    const { unmount } = renderWithProviders(
      <PdfViewer title="a.pdf" load={bytes} onClose={onClose} />,
    );
    await screen.findByText('1 pages');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(h.destroy).toHaveBeenCalled();
  });

  it('zooms in and out a step at a time, and redraws the pages bigger', async () => {
    h.openPdf.mockResolvedValue(fakeDoc(1));
    renderWithProviders(<PdfViewer title="a.pdf" load={bytes} onClose={() => {}} />);
    await screen.findByText('1 pages');
    const page = () => screen.getByRole('img', { name: 'Page 1' }).parentElement!;
    const before = parseFloat(page().style.width);
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(parseFloat(page().style.width)).toBeCloseTo(before * 1.5, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(parseFloat(page().style.width)).toBeCloseTo(before, 0);
  });

  it('draws at most 40 pages and says how to read the rest', async () => {
    h.openPdf.mockResolvedValue(fakeDoc(55));
    renderWithProviders(<PdfViewer title="big.pdf" load={bytes} onClose={() => {}} />);
    expect(await screen.findByText('55 pages')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Page \d+$/ })).toHaveLength(40);
    expect(screen.getByText(/Showing the first 40 pages/)).toBeInTheDocument();
  });

  it('speaks Hindi first', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    h.openPdf.mockResolvedValue(fakeDoc(2));
    renderWithProviders(<PdfViewer title="a.pdf" load={bytes} onSave={() => {}} onClose={() => {}} />);
    expect(await screen.findByText('2 पेज')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'सेव करें' })).toBeInTheDocument();
  });
});
