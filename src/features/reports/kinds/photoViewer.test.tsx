import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeclarationFiledData, MockDrillData, ReportDetail } from '@dk/shared/types';

// The viewer is the chat's own, tested there. Here it is a probe that shows what it was given.
const viewer = vi.hoisted(() => ({ props: null as null | { items: Array<Record<string, unknown>>; initialKey: string; onClose: () => void } }));
vi.mock('@/features/chat/MediaViewer', () => ({
  MediaViewer: (props: NonNullable<typeof viewer.props>) => {
    viewer.props = props;
    return (
      <div data-testid="viewer">
        <button type="button" onClick={props.onClose}>
          close viewer
        </button>
      </div>
    );
  },
}));

const { reportOf } = await import('./_paperwork.fixtures');
const { photoUrl, PhotoFrame } = await import('./_paperwork');
const { view: declarationView } = await import('./declaration_filed');
const { view: drillView } = await import('./mock_drill');

afterEach(() => {
  cleanup();
  viewer.props = null;
});

const withPhotos = (kind: 'declaration_filed' | 'mock_drill', photos: ReportDetail['photos'], attachments: ReportDetail['attachments'] = []) => ({
  ...reportOf(kind, attachments),
  ...(photos ? { photos } : {}),
});

const washroom: DeclarationFiledData = {
  kind: 'declaration_filed',
  v: 1,
  declaration: 'washroom',
  how: 'submitted',
  day: '2026-11-23',
  filedAt: '2026-11-23T17:10:00.000Z',
  late: false,
  everyDays: 7,
  nextDueDay: '2026-11-30',
  outletCode: '1E',
  previousDay: '2026-11-16',
  photos: [
    { slot: 'inside', key: 'k/inside.jpg', mime: 'image/jpeg', size: 1 },
    { slot: 'outside', key: 'k/outside.jpg', mime: 'image/jpeg', size: 1 },
  ],
  ref: 'row2',
};

const drill: MockDrillData = {
  kind: 'mock_drill',
  v: 1,
  outletCode: '1E',
  stage: 'filed',
  submissionId: 's1',
  mode: 'new',
  scenario: { id: 'sc1', family: 'fire', label: 'Fire' },
  drillDay: '2026-11-22',
  startTime: '11:00',
  durationMinutes: 30,
  level: '1',
  photos: [
    { key: 'k/p1.jpg', mime: 'image/jpeg', size: 1 },
    { key: 'k/p2.jpg', mime: 'image/png', size: 1 },
  ],
  filedAt: '2026-11-23T08:00:00.000Z',
  portalState: 'pending_approval',
};

describe('photoUrl: the signed copies the report route sends', () => {
  it('reads `photos` first, by storage key', () => {
    const report = withPhotos('mock_drill', [{ key: 'k/p1.jpg', url: 'https://signed/new' }], [
      { storageKey: 'k/p1.jpg', filename: 'p', contentType: 'image/jpeg', size: 1, kind: 'image', url: 'https://signed/old' },
    ]);
    expect(photoUrl(report, 'k/p1.jpg')).toBe('https://signed/new');
  });

  it('falls back to a copy in `attachments`, and is undefined for a photo nobody signed', () => {
    const report = withPhotos('mock_drill', [{ key: 'k/p1.jpg', url: 'https://signed/new' }], [
      { storageKey: 'k/p2.jpg', filename: 'p', contentType: 'image/jpeg', size: 1, kind: 'image', url: 'https://signed/att' },
    ]);
    expect(photoUrl(report, 'k/p2.jpg')).toBe('https://signed/att');
    expect(photoUrl(report, 'k/p3.jpg')).toBeUndefined();
    expect(photoUrl({ attachments: [] }, 'k/p1.jpg')).toBeUndefined();
  });
});

describe('PhotoFrame: a photo that can be opened', () => {
  it('is one big button with the photo\'s name and what a tap does, and calls onOpen', () => {
    const onOpen = vi.fn();
    render(<PhotoFrame src="https://signed/o" label="Outside photo" size={156} lang="en" onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: /Outside photo.*Open full screen/ });
    expect(screen.getByAltText('Outside photo')).toHaveAttribute('src', 'https://signed/o');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is a plain picture without onOpen, and a calm box (no button) when there is nothing to open', () => {
    const { unmount } = render(<PhotoFrame src="https://signed/o" label="Outside photo" size={156} lang="en" />);
    expect(screen.queryByTestId('photo-open')).toBeNull();
    unmount();
    render(<PhotoFrame src={undefined} label="Outside photo" size={156} lang="en" onOpen={() => undefined} />);
    expect(screen.queryByTestId('photo-open')).toBeNull();
    expect(screen.getByText('Photo is not shown here')).toBeInTheDocument();
  });

  it('keeps the frame inside the screen at any width (it never sets a width the screen cannot hold)', () => {
    const { container } = render(<PhotoFrame src="https://signed/o" label="x" size={156} lang="en" onOpen={() => undefined} />);
    const figure = container.querySelector('figure') as HTMLElement;
    expect(figure.style.maxWidth).toBe('100%');
  });
});

describe('a declaration\'s washroom photos open in the app', () => {
  const Overlay = declarationView.Overlay;
  const report = withPhotos('declaration_filed', [
    { key: 'k/outside.jpg', url: 'https://signed/o' },
    { key: 'k/inside.jpg', url: 'https://signed/i' },
  ]);

  it('draws them from the signed copies and opens the in-app viewer on the tapped one, never a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<Overlay data={washroom} report={report} lang="en" />);
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Inside photo/ }));
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    const items = viewer.props!.items;
    // Outside first, as drawn, then inside; the tapped one is where it opens.
    expect(items.map((i) => (i.attachment as { storageKey: string }).storageKey)).toEqual(['k/outside.jpg', 'k/inside.jpg']);
    expect((items[0]!.attachment as { url: string }).url).toBe('https://signed/o');
    expect(viewer.props!.initialKey).toBe(items[1]!.key);
    expect(items[1]!.source).toEqual({ conversationId: 'c1', messageId: 'm1' });
    expect(items[1]!.caption).toBe('Inside photo');
    expect(open).not.toHaveBeenCalled();
  });

  it('closes the viewer back to the report', () => {
    render(<Overlay data={washroom} report={report} lang="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Outside photo/ }));
    fireEvent.click(screen.getByText('close viewer'));
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(screen.getByAltText('Outside photo')).toBeInTheDocument();
  });

  it('leaves a photo nobody could sign out of the viewer, and makes it no button', () => {
    const half = withPhotos('declaration_filed', [{ key: 'k/outside.jpg', url: 'https://signed/o' }]);
    render(<Overlay data={washroom} report={half} lang="en" />);
    expect(screen.getAllByTestId('photo-open')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Outside photo/ }));
    expect(viewer.props!.items).toHaveLength(1);
  });
});

describe('a mock drill\'s photos open in the app', () => {
  const Overlay = drillView.Overlay;
  const report = withPhotos('mock_drill', [
    { key: 'k/p1.jpg', url: 'https://signed/1' },
    { key: 'k/p2.jpg', url: 'https://signed/2' },
  ]);

  it('opens the viewer on the tapped photo, with both photos to swipe, in the language of the screen', () => {
    render(<Overlay data={drill} report={report} lang="hl" />);
    fireEvent.click(screen.getByRole('button', { name: /Photo 2/ }));
    const items = viewer.props!.items;
    expect(items.map((i) => (i.attachment as { url: string }).url)).toEqual(['https://signed/1', 'https://signed/2']);
    expect(viewer.props!.initialKey).toBe(items[1]!.key);
    expect((items[1]!.attachment as { contentType: string }).contentType).toBe('image/png');
  });

  it('names the tap in Hindi', () => {
    render(<Overlay data={drill} report={report} lang="hi" />);
    expect(screen.getByRole('button', { name: /फोटो 1.*बड़ा करके देखें/ })).toBeInTheDocument();
  });
});
