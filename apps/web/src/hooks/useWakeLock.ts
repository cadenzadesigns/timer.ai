import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }

    if (!('wakeLock' in navigator)) return;

    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        lockRef.current = lock;
      })
      .catch(() => {}); // Not available or denied — ignore

    return () => {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
