import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEVANAGARI, announcement, renderOverlay } from './_supplyTestKit';
import { linksIn, view } from './announcement';

vi.mock('@/features/help/GuideVideoSheet', () => ({
  GuideVideoSheet: ({ id, title, onClose }: { id: string; title: string; onClose: () => void }) => (
    <div data-testid="player" data-id={id} data-title={title}>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

afterEach(cleanup);

describe('announcement: the letter', () => {
  it('draws the flap with a different tone glyph for each tone, and says the tone in words', () => {
    const seen = new Set<string>();
    const words: Record<string, string> = { new: 'New', notice: 'Notice', important: 'Important' };
    for (const tone of ['new', 'notice', 'important'] as const) {
      const { unmount } = renderOverlay(view, announcement({ tone }));
      expect(screen.getByTestId('announcement-flap')).toHaveAttribute('data-tone', tone);
      expect(screen.getByTestId('announcement-tone')).toHaveTextContent(words[tone]!);
      seen.add(screen.getByTestId('announcement-flap').innerHTML);
      unmount();
    }
    expect(seen.size).toBe(3);
  });

  it('gives an important letter a thicker border', () => {
    const { unmount } = renderOverlay(view, announcement({ tone: 'important' }));
    expect(screen.getByTestId('announcement-letter').className).toContain('border-2');
    unmount();
    renderOverlay(view, announcement({ tone: 'new' }));
    expect(screen.getByTestId('announcement-letter').className).not.toContain('border-[3px]');
  });

  it('shows the admin title and text exactly as written, with *bold* as real bold', () => {
    renderOverlay(view, announcement());
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('TT Acknowledgement ab raat ko hum karenge');
    const bold = screen.getByText('hamari team');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getByTestId('announcement-body')).not.toHaveTextContent('*');
    // the same words whatever the reader's language
    cleanup();
    renderOverlay(view, announcement(), 'hi');
    expect(screen.getByTestId('announcement-title')).toHaveTextContent('TT Acknowledgement ab raat ko hum karenge');
    expect(screen.getByTestId('announcement-tone').textContent).toMatch(DEVANAGARI);
  });

  it('keeps a long text readable: body size, roomy lines, 1.75 for Devanagari, and it wraps', () => {
    const long = 'लंबा पाठ '.repeat(300);
    const { unmount } = renderOverlay(view, announcement({ body: long }), 'hi');
    const body = screen.getByTestId('announcement-body');
    expect(body.className).toContain('text-body');
    expect(body.className).toContain('leading-[1.75]');
    expect(body.className).toContain('break-words');
    unmount();
    renderOverlay(view, announcement({ body: 'x' }), 'en');
    expect(screen.getByTestId('announcement-body').className).toContain('leading-[1.6]');
  });

  it('puts the news title in the title size', () => {
    renderOverlay(view, announcement());
    expect(screen.getByTestId('announcement-title').className).toContain('text-title');
  });

  it('turns each link into a 48 px button that opens in the browser, with the host as a hint', () => {
    renderOverlay(view, announcement());
    const list = screen.getByTestId('announcement-links');
    const a = within(list).getByRole('link');
    expect(a).toHaveAttribute('href', 'https://mdgservices.in/guide/tt-ack');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a.className).toContain('min-h-12');
    expect(a).toHaveTextContent('Open the link');
    expect(a).toHaveTextContent('mdgservices.in');
    expect(a.getAttribute('aria-label')).toContain('opens in the browser');
  });

  it('finds each distinct link once, without the full stop after it', () => {
    expect(linksIn('See https://a.in/x. And https://a.in/x, then (https://b.in/y).')).toEqual(['https://a.in/x', 'https://b.in/y']);
    expect(linksIn('no link here')).toEqual([]);
  });

  it('opens the attached video in the app player and closes it again', () => {
    renderOverlay(view, announcement({ videoId: 'svc_tt_ack' }));
    expect(screen.queryByTestId('player')).toBeNull();
    const play = screen.getByTestId('announcement-video');
    expect(play).toHaveTextContent('Watch the video');
    expect(play).toHaveAttribute('aria-label', 'Play the video: TT Acknowledgement ab raat ko hum karenge');
    fireEvent.click(play);
    const player = screen.getByTestId('player');
    expect(player).toHaveAttribute('data-id', 'svc_tt_ack');
    fireEvent.click(within(player).getByRole('button'));
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('has no video button when no video came with it', () => {
    renderOverlay(view, announcement());
    expect(screen.queryByTestId('announcement-video')).toBeNull();
  });

  it('says who it is for only when the service is stored', () => {
    renderOverlay(view, announcement({ serviceId: 'water-ingress-testing' }));
    expect(screen.getByTestId('announcement-target')).toHaveTextContent('For outlets with Water ingress testing');
    cleanup();
    renderOverlay(view, announcement({ serviceId: null }));
    expect(screen.queryByTestId('announcement-target')).toBeNull();
  });

  it('asks for a careful read only for an important letter, and never names a button the app does not have', () => {
    const { unmount } = renderOverlay(view, announcement({ tone: 'important', ackable: true }));
    expect(screen.getByTestId('announcement-ack-hint')).toHaveTextContent('This one is important. Please read it all.');
    expect(screen.getByTestId('announcement-ack-hint')).not.toHaveTextContent(/Got it/);
    expect(view.actions).toBeUndefined();
    unmount();
    renderOverlay(view, announcement({ tone: 'notice', ackable: false }));
    expect(screen.queryByTestId('announcement-ack-hint')).toBeNull();
  });

  it('survives an unknown tone and an empty body', () => {
    renderOverlay(view, announcement({ tone: 'odd' as never, body: '' }));
    expect(screen.getByTestId('announcement-flap')).toHaveAttribute('data-tone', 'notice');
    expect(screen.queryByTestId('announcement-links')).toBeNull();
  });
});

describe('announcement: tile, alert, headline, share', () => {
  it('has no tile', () => {
    expect(view.tile(announcement(), 'en')).toBeNull();
  });

  it('alerts only for an important letter that is marked as needing an ack', () => {
    expect(view.alert(announcement({ tone: 'important', ackable: true }), 'en')).toEqual({
      headline: 'TT Acknowledgement ab raat ko hum karenge',
      line: 'MDG has something important. Please read it.',
      severity: 'attention',
    });
    expect(view.alert(announcement({ tone: 'important', ackable: false }), 'en')).toBeNull();
    expect(view.alert(announcement({ tone: 'new' }), 'en')).toBeNull();
  });

  it('uses the admin title as the headline and shares title and text as written', () => {
    expect(view.headline(announcement(), 'hi')).toBe('TT Acknowledgement ab raat ko hum karenge');
    expect(view.headline(announcement({ title: '' }), 'en')).toBe('News from MDG');
    const text = view.share(announcement(), 'en');
    expect(text.split('\n')[0]).toBe('TT Acknowledgement ab raat ko hum karenge');
    expect(text).toContain('*hamari team*');
    expect(text).toContain('https://mdgservices.in/guide/tt-ack');
  });
});

describe('announcement: sizes in rem', () => {
  it('draws the link buttons and the letter without a fixed pixel height, width or text size', () => {
    const { container } = renderOverlay(view, announcement());
    expect(container.innerHTML).not.toMatch(/text-\[\d|h-\[\d+px|w-\[\d+px|rounded-\[\d+px/);
    expect(within(screen.getByTestId('announcement-links')).getByRole('link').className).toContain('rounded-lg');
  });
});
