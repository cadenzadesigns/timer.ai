import { useEffect, useRef, useState } from 'react';

export function useWakeLock(active: boolean): { isActive: boolean } {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!active) {
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
        setIsActive(false);
      }
      return;
    }

    if (!('wakeLock' in navigator)) return;

    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        lockRef.current = lock;
        setIsActive(true);
        lock.addEventListener('release', () => setIsActive(false));
      })
      .catch(() => { setIsActive(false); });

    return () => {
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
        setIsActive(false);
      }
    };
  }, [active]);

  return { isActive };
}
