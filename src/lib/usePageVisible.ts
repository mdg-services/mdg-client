import * as React from 'react';

/** Is the page on screen right now? False while the app is in the background or the phone is locked. */
export function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** `isPageVisible`, as state that follows the page being hidden and shown again. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = React.useState(isPageVisible);
  React.useEffect(() => {
    const update = () => setVisible(isPageVisible());
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}
