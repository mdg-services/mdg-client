import * as React from 'react';

/**
 * The bar remembers whether this pump's Kavach was on (spec 2.2), so it never jumps from three
 * doors to four after the Kavach answer arrives. The browser's storage key is `mdg.client.kavachOn`
 * with "1" or "0". Reads and writes sit in try/catch and the bar draws correctly without it
 * (a private window, blocked site data): the answer simply decides, as it did before. Only a
 * first-ever visit can still see one jump.
 */
export const KAVACH_MEMORY_KEY = 'mdg.client.kavachOn';

export function readKavachMemory(): boolean | null {
  try {
    const v = window.localStorage.getItem(KAVACH_MEMORY_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export function writeKavachMemory(on: boolean): void {
  try {
    window.localStorage.setItem(KAVACH_MEMORY_KEY, on ? '1' : '0');
  } catch {
    /* a convenience, not a record */
  }
}

/**
 * Whether to draw the Kavach door. `live` is what the Kavach query says once it has answered
 * (undefined while it has not, or when it failed). Until then the remembered value is used; when
 * the answer comes it wins, and is written down for next time.
 */
export function useKavachMemory(live: boolean | undefined): boolean {
  const [remembered] = React.useState<boolean | null>(readKavachMemory);
  React.useEffect(() => {
    if (live !== undefined) writeKavachMemory(live);
  }, [live]);
  return live ?? remembered ?? false;
}
