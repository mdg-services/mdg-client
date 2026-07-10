import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import { ImageLightbox } from './ImageLightbox';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

const attachment: Attachment = {
  storageKey: 'chat/c1/uuid-pic.jpg',
  filename: 'pic.jpg',
  contentType: 'image/jpeg',
  size: 1000,
  kind: 'image',
  // Presigned URL captured at fetch time — may be EXPIRED by open time.
  url: 'https://s3.test/expired?sig=old',
};

describe('ImageLightbox', () => {
  it('renders the embedded URL on the happy path (no refetch)', () => {
    api.get.mockReset();
    renderWithProviders(
      <ImageLightbox attachment={attachment} onClose={() => {}} />,
      { withRouter: false },
    );
    expect(screen.getByAltText('pic.jpg')).toHaveAttribute(
      'src',
      'https://s3.test/expired?sig=old',
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it('swaps in ONE fresh inline URL when the image errors (expired presign)', async () => {
    api.get.mockReset();
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    renderWithProviders(
      <ImageLightbox attachment={attachment} onClose={() => {}} />,
      { withRouter: false },
    );
    const img = screen.getByAltText('pic.jpg');
    fireEvent.error(img);
    await waitFor(() =>
      expect(img).toHaveAttribute('src', 'https://s3.test/fresh?sig=new'),
    );
    // Inline disposition: no `disposition` param on the presign request.
    expect(api.get).toHaveBeenCalledWith('/v1/uploads/download-url', {
      key: attachment.storageKey,
    });

    // A genuinely dead key must NOT refetch forever — one retry only.
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps the broken image (no crash, no loop) when the refresh itself fails', async () => {
    api.get.mockReset();
    api.get.mockRejectedValue(new Error('offline'));
    renderWithProviders(
      <ImageLightbox attachment={attachment} onClose={() => {}} />,
      { withRouter: false },
    );
    const img = screen.getByAltText('pic.jpg');
    fireEvent.error(img);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(img).toHaveAttribute('src', 'https://s3.test/expired?sig=old');
    fireEvent.error(img);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
