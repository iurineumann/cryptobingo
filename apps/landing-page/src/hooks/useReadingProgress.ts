import { useState, useEffect } from 'react';

function estimateReadTime(text: string): number {
  if (!text.trim()) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function useReadingProgress(body: string) {
  const [progress, setProgress] = useState(0);
  const readTime = estimateReadTime(body);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const scrollable = docHeight - winHeight;

      if (scrollable <= 0) {
        setProgress(100);
        return;
      }

      setProgress(Math.min(100, Math.round((scrollTop / scrollable) * 100)));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return { progress, readTime };
}
