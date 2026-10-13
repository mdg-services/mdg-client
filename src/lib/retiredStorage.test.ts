import { afterEach, describe, expect, it, vi } from 'vitest';

import { RETIRED_STORAGE_KEYS, clearRetiredStorage } from './retiredStorage';

describe('clearRetiredStorage', () => {
  afterEach(() => localStorage.clear());

  it('names the offline ask queue as retired', () => {
    expect(RETIRED_STORAGE_KEYS).toContain('mdg.client.askQueue');
  });

  it('removes the leftover ask queue and touches nothing else', () => {
    localStorage.setItem('mdg.client.askQueue', '{"state":{"items":[{"id":"x"}]}}');
    localStorage.setItem('mdg.client.auth', 'keep-me');
    localStorage.setItem('mdg.client.staffDraft', 'keep-me-too');

    clearRetiredStorage();

    expect(localStorage.getItem('mdg.client.askQueue')).toBeNull();
    expect(localStorage.getItem('mdg.client.auth')).toBe('keep-me');
    expect(localStorage.getItem('mdg.client.staffDraft')).toBe('keep-me-too');
  });

  it('is fine when there is nothing to clear — it runs on every start', () => {
    expect(() => clearRetiredStorage()).not.toThrow();
    expect(() => clearRetiredStorage()).not.toThrow();
  });

  // A WebView with site data blocked throws on access. The app has to start anyway.
  it('does not throw when storage itself throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearRetiredStorage()).not.toThrow();
  });
});
