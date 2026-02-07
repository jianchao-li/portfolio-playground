import { useEffect, RefObject } from 'react';

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  callback: () => void
) {
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const clickedOutsideAll = refs.every(
        (ref) => ref.current && !ref.current.contains(e.target as Node)
      );
      if (clickedOutsideAll) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs, callback]);
}
