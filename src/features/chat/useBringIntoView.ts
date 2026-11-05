import * as React from 'react';

/**
 * Bring a field to the middle of the screen once the keyboard has risen over the
 * lower half of a phone, so what is being typed is visible. Use the returned
 * handler as the field's `onFocus`.
 */
export function useBringIntoView() {
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return React.useCallback((e: React.FocusEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 300);
  }, []);
}
