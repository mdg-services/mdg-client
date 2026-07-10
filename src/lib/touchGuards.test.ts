import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { installTouchGuards } from './touchGuards';

// The guards attach capture-phase listeners to the shared jsdom `document`, just
// like main.tsx does once at startup. Their only side effect is preventDefault(),
// so installing a single time and reusing it across cases is safe (idempotent).
beforeAll(() => {
  installTouchGuards();
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Dispatch a cancelable event of `type` on `el` and report whether a
 *  document-level guard called preventDefault() on it. */
function fire(el: Element, type: string): boolean {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe('installTouchGuards', () => {
  it('cancels native drag-and-drop on a non-editable element', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(fire(div, 'dragstart')).toBe(true);
    expect(fire(div, 'dragover')).toBe(true);
    expect(fire(div, 'drop')).toBe(true);
  });

  it('cancels the drag ghost on an image (the Android WebView shell-hang bug)', () => {
    const img = document.createElement('img');
    document.body.appendChild(img);
    expect(fire(img, 'dragstart')).toBe(true);
  });

  it('cancels the iOS pinch-zoom gesturestart', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(fire(div, 'gesturestart')).toBe(true);
  });

  it('suppresses the long-press context menu on non-editable content', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(fire(div, 'contextmenu')).toBe(true);
  });

  it('leaves contextmenu ALONE on an <input> so long-press paste survives', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(fire(input, 'contextmenu')).toBe(false);
  });

  it('leaves contextmenu ALONE on a <textarea>', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(fire(ta, 'contextmenu')).toBe(false);
  });

  it('leaves contextmenu ALONE inside a [contenteditable="true"] host, even on a child node', () => {
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    host.appendChild(child);
    document.body.appendChild(host);
    // `.closest()` must walk up from the target to find the editable host.
    expect(fire(child, 'contextmenu')).toBe(false);
  });

  it('leaves contextmenu ALONE inside a .select-text message body (copy-a-message survives)', () => {
    const bubble = document.createElement('div');
    bubble.className = 'select-text';
    const child = document.createElement('span');
    bubble.appendChild(child);
    document.body.appendChild(bubble);
    // Long-press on the message text (or a child of it) must not be cancelled,
    // so Android WebView builds that route text long-press through contextmenu
    // still expose Copy.
    expect(fire(bubble, 'contextmenu')).toBe(false);
    expect(fire(child, 'contextmenu')).toBe(false);
  });

  it('still SUPPRESSES contextmenu on an image (not .select-text)', () => {
    const img = document.createElement('img');
    document.body.appendChild(img);
    expect(fire(img, 'contextmenu')).toBe(true);
  });

  it('still cancels DRAG on an <input> — only contextmenu is exempted there', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(fire(input, 'dragstart')).toBe(true);
  });
});
