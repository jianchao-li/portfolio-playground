import { useEffect, useRef as useReactRef, RefObject } from 'react';

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  callback: () => void
) {
  const refsRef = useReactRef(refs);
  refsRef.current = refs;

  const callbackRef = useReactRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const clickedOutsideAll = refsRef.current.every(
        (ref) => ref.current && !ref.current.contains(e.target as Node)
      );
      if (clickedOutsideAll) {
        callbackRef.current();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
}
