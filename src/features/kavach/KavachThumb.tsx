import { Image as ImageIcon } from 'lucide-react';
import * as React from 'react';

import { PhotoViewer } from '@/components/PhotoViewer';

/**
 * A small photo the dealer sent, that opens large when tapped. When the file cannot be read (a storage
 * address that expired, no network, a file that is gone) it is a grey tile with a photo mark and the word
 * "Photo" instead of the browser's broken-picture icon, so a missing file never looks like a fault in the
 * app. With no address at all it is the same tile.
 */
export function KavachThumb({ url, label }: { url: string | null | undefined; label: string }) {
  const [broken, setBroken] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);

  if (!url || broken) {
    return (
      <span
        role="img"
        aria-label={label}
        data-testid="kavach-thumb-missing"
        className="flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-wa-chip px-1 py-1 text-center"
      >
        <ImageIcon width={22} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
        <span className="break-words text-meta text-text-muted">{label}</span>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="size-14 shrink-0 overflow-hidden rounded-md bg-wa-chip active:opacity-80"
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      </button>
      {open ? <PhotoViewer src={url} alt={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
