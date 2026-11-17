import { useEffect, useRef } from 'react';

import useStableEvent from './use-stable-event.ts';

export function useDeferredCleanup(_cb: () => void) {
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useStableEvent(_cb);

  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(cb, 200);
    };
  }, [cb]);
}
