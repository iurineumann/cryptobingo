import { useEffect, useRef } from 'react';

export function useSectionVisibility(
  trackEvent: (name: string, params?: Record<string, unknown>) => void,
  sectionRefs: { current: HTMLElement | null }[],
  sectionNames: string[],
  locale?: string,
): void {
  const firedSections = useRef(new Set<string>());
  const sectionRefsRef = useRef(sectionRefs);
  sectionRefsRef.current = sectionRefs;
  const sectionNamesRef = useRef(sectionNames);
  sectionNamesRef.current = sectionNames;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = sectionRefsRef.current.findIndex((ref) => ref.current === entry.target);
          if (idx === -1) continue;
          const name = sectionNamesRef.current[idx];
          if (firedSections.current.has(name)) continue;
          firedSections.current.add(name);
          trackEvent('section_visibility', { section: name, action: 'view', locale });
        }
      },
      { threshold: 0.3 },
    );

    for (const ref of sectionRefsRef.current) {
      if (ref.current) observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [trackEvent, locale]);
}
