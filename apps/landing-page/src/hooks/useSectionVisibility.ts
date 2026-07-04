import { useEffect, useRef } from 'react';

export function useSectionVisibility(
  trackEvent: (name: string, params?: Record<string, unknown>) => void,
  sectionRefs: { current: HTMLElement | null }[],
  sectionNames: string[],
  locale?: string,
): void {
  const firedSections = useRef(new Set<string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const idx = sectionRefs.findIndex((ref) => ref.current === entry.target);
          if (idx === -1) continue;

          const name = sectionNames[idx];
          if (firedSections.current.has(name)) continue;

          firedSections.current.add(name);
          trackEvent('section_visibility', { section: name, action: 'view', locale });
        }
      },
      { threshold: 0.3 },
    );

    for (const ref of sectionRefs) {
      if (ref.current) observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [trackEvent, sectionRefs, sectionNames, locale]);
}
