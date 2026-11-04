import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EXTENSION_ORIGIN,
  embedOrigins,
  isEmbedded,
  resetEmbeddedForTests,
  withEmbed,
} from './embedMode';

/**
 * A fresh tab at this address: the module's memory and the tab's session storage both
 * empty. It is the panel's frame unless `framed` is false (a page opened on its own).
 */
function openAt(url: string, framed = true) {
  window.history.replaceState({}, '', url);
  sessionStorage.clear();
  resetEmbeddedForTests({ framed });
}

beforeEach(() => openAt('/'));
afterEach(() => openAt('/'));

describe('isEmbedded', () => {
  it('is false for the web app and the phone shell: no flag, nothing stored', () => {
    openAt('/chat');
    expect(isEmbedded()).toBe(false);
    expect(sessionStorage.getItem('dk.embed')).toBeNull();
  });

  it('is true when the address says ?embed=extension', () => {
    openAt('/chat?embed=extension');
    expect(isEmbedded()).toBe(true);
  });

  it('ignores any other value of the flag', () => {
    openAt('/chat?embed=yes');
    expect(isEmbedded()).toBe(false);
  });

  it('stays true after the first in-app move drops the query from the address', () => {
    openAt('/chat?embed=extension');
    expect(isEmbedded()).toBe(true);
    window.history.pushState({}, '', '/chat/abc');
    expect(isEmbedded()).toBe(true);
  });

  it('stays true across a reload that no longer carries the flag in its address', () => {
    openAt('/chat?embed=extension');
    expect(isEmbedded()).toBe(true);
    // A reload after a new deploy, from /chat/abc: a fresh page, the same tab.
    window.history.replaceState({}, '', '/chat/abc');
    // The page's memory is gone; the tab's session storage is not.
    resetEmbeddedForTests({ framed: true });
    expect(isEmbedded()).toBe(true);
  });

  describe('a page opened on its own, not inside a frame', () => {
    it('ignores ?embed=extension: a link sent over WhatsApp opens the ordinary app', () => {
      openAt('/chat?embed=extension', false);
      expect(isEmbedded()).toBe(false);
    });

    it('writes no flag, so nothing is left behind for a later screen to find', () => {
      openAt('/chat?embed=extension', false);
      isEmbedded();
      expect(sessionStorage.getItem('dk.embed')).toBeNull();
      // Typing /login afterwards: still the ordinary app.
      window.history.replaceState({}, '', '/login');
      resetEmbeddedForTests({ framed: false });
      expect(isEmbedded()).toBe(false);
    });

    it('ignores a flag already stored in the tab', () => {
      openAt('/chat', false);
      sessionStorage.setItem('dk.embed', 'extension');
      resetEmbeddedForTests({ framed: false });
      expect(isEmbedded()).toBe(false);
    });

    it('is what the real window says when nothing is overridden: jsdom is not framed', () => {
      window.history.replaceState({}, '', '/chat?embed=extension');
      sessionStorage.clear();
      resetEmbeddedForTests();
      expect(isEmbedded()).toBe(false);
    });
  });

  it('still answers when session storage throws', () => {
    openAt('/chat?embed=extension');
    const realGet = Storage.prototype.getItem;
    const realSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('off');
    };
    Storage.prototype.setItem = () => {
      throw new Error('off');
    };
    try {
      expect(isEmbedded()).toBe(true);
      openAt('/chat');
      expect(isEmbedded()).toBe(false);
    } finally {
      Storage.prototype.getItem = realGet;
      Storage.prototype.setItem = realSet;
    }
  });
});

describe('withEmbed', () => {
  it('leaves an address alone when not embedded', () => {
    openAt('/chat');
    expect(withEmbed('/chat')).toBe('/chat');
  });

  it('keeps the flag on an address a full page load will open', () => {
    openAt('/chat?embed=extension');
    expect(withEmbed('/chat')).toBe('/chat?embed=extension');
    expect(withEmbed('/chat?c=abc')).toBe('/chat?c=abc&embed=extension');
    expect(withEmbed('/chat#top')).toBe('/chat?embed=extension#top');
    expect(withEmbed('/chat?embed=extension')).toBe('/chat?embed=extension');
  });

  it('leaves an address alone on a page opened on its own, even with the flag in the address', () => {
    openAt('/chat?embed=extension', false);
    expect(withEmbed('/chat')).toBe('/chat');
  });
});

describe('embedOrigins', () => {
  it('is the published extension alone when nothing is configured', () => {
    expect(embedOrigins(undefined)).toEqual([DEFAULT_EXTENSION_ORIGIN]);
    expect(embedOrigins('  ,  ')).toEqual([DEFAULT_EXTENSION_ORIGIN]);
    expect(DEFAULT_EXTENSION_ORIGIN).toBe('chrome-extension://fdeceedgoipgpnkcodehalppchjndped');
  });

  it('adds a comma list beside the published extension, which a short list cannot lock out', () => {
    expect(embedOrigins('chrome-extension://aaa, chrome-extension://bbb ')).toEqual([
      DEFAULT_EXTENSION_ORIGIN,
      'chrome-extension://aaa',
      'chrome-extension://bbb',
    ]);
  });

  it('lists the published extension once when the list names it too', () => {
    expect(embedOrigins(`${DEFAULT_EXTENSION_ORIGIN},chrome-extension://aaa`)).toEqual([
      DEFAULT_EXTENSION_ORIGIN,
      'chrome-extension://aaa',
    ]);
  });
});
