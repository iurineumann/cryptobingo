import { useReadingProgress } from '@/hooks/useReadingProgress';

interface ContentBodyProps {
  html: string;
}

export function ContentBody({ html }: ContentBodyProps) {
  const { progress } = useReadingProgress(html);

  return (
    <>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed top-0 left-0 h-0.5 bg-brand-500 z-50 transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
