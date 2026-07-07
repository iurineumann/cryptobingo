import { useState, useEffect } from 'react';

export function useActiveHeading(headingIds: string[], offset = 100): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!headingIds.length) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      let current: string | null = null;

      for (let i = headingIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(headingIds[i]);
        if (el && el.offsetTop + offset <= scrollY) {
          current = headingIds[i];
          break;
        }
      }
      setActiveId(current);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headingIds, offset]);

  return activeId;
}
