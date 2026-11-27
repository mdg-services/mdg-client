import * as React from 'react';

/**
 * The clock the first screen reads, ticking once a minute: a feed that was fresh at 9:40 is "old" at
 * 10:10 with no new answer in between, so the verdict has to be asked again by the clock and not only
 * by the network.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Is the phone online? An unknown answer reads as online (the verdict only turns cautious on a clear "offline"). */
export function useOnline(): boolean {
  const read = () => (typeof navigator === 'undefined' || navigator.onLine === undefined ? true : navigator.onLine);
  const [online, setOnline] = React.useState(read);
  React.useEffect(() => {
    const update = () => setOnline(read());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
