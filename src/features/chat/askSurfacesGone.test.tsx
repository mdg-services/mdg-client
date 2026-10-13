import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppBar } from '@/components/AppBar';

import { ChatSearchBar } from './ChatBars';

/**
 * ASKS LIVE IN THE CHAT (ADR 0019). The "N things to send" strip under every top
 * bar, the engine behind it, and the screens it led to are gone — these pin that
 * they stay gone.
 */

const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('the ask bar is gone', () => {
  // A guard that scanned nothing would pass for ever.
  it('is actually looking at the app\'s source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(Object.keys(sources)).toContain('/src/AppShell.tsx');
  });

  it('no source file draws, mounts or names an AskBarSlot or an AskBar', () => {
    const offenders = Object.entries(sources)
      // The i18n catalog and a handful of comments explain what used to be; code is
      // what this guards, so look for an identifier or an import.
      .filter(([, text]) => /\bAskBar(Slot(Context)?)?\b|askBarSlot|features\/asks\//.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('nothing imports the removed ask surfaces', () => {
    const gone = [
      'useAskQueueSync',
      'store/askQueue',
      'useAskCapture',
      'uploadDocumentAsk',
      'uploadDensityPhoto',
      'uploadKavachProof',
      'hooks/api/useAsks',
      'hooks/api/useDocuments',
      'hooks/api/useDensity',
      'hooks/api/useKavach',
      'pages/DocumentsPage',
      'pages/DensityPage',
      'pages/KavachPage',
      'features/documents/',
      'features/density/',
      'features/kavach/',
    ];
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      gone.filter((g) => new RegExp(`from '[^']*${g}`).test(text)).map((g) => `${path} → ${g}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the top bar draws nothing under itself', () => {
    const { container } = render(<AppBar title="Settings" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.children).toHaveLength(1);
  });

  it('neither does the search bar that takes the chat bar\'s place', () => {
    const { container } = render(
      <ChatSearchBar
        value=""
        onChange={() => undefined}
        onClose={() => undefined}
        status={null}
        onOlder={() => undefined}
        onNewer={() => undefined}
        canOlder={false}
        canNewer={false}
      />,
    );
    expect(container.firstElementChild!.children).toHaveLength(1);
  });
});
