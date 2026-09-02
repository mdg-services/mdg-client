import * as React from 'react';

/**
 * Is the phone on a network right now?
 *
 * `navigator.onLine` is a weak signal and is treated as one: it says the device
 * has A connection, not that anything can be reached over it, and a forecourt
 * 2G link is "online" for hours at a time while nothing completes. So nothing in
 * this app is BLOCKED on it — the ask queue sends regardless and retries on
 * failure. It is used only to choose which true sentence to show the dealer:
 * "sent" when the phone thinks it has signal, "saved, it will go as soon as the
 * internet is back" when it knows it does not.
 *
 * Defaults to `true` when there is no `navigator` (jsdom, a server render) and
 * when the property is absent, because the honest default for an unknown is
 * "try it" rather than "tell them it will not work".
 *
 * `DensityCaptureSheet` keeps a private copy of this. It is left alone
 * deliberately: that sheet has no queue behind it, and its copy of the hook is
 * wired into a rule this one no longer has — it DISABLES the send button when
 * the phone is off the network. Rewriting it to point here would be changing a
 * shipped screen's behaviour while nobody asked.
 */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
