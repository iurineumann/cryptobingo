import { useState } from 'react';
import type { ContentImage } from '@/types/content';

interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  zoomable?: boolean;
}

export function Figure({ src, alt, caption, zoomable = true }: FigureProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <figure
      data-testid="content-figure"
      className={`my-8 ${zoomed ? 'fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4' : 'relative'}`}
    >
      <div className={zoomed ? 'max-w-5xl max-h-[90vh]' : ''}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onClick={() => zoomable && setZoomed(!zoomed)}
          className={`rounded-lg ${zoomable ? 'cursor-zoom-in' : ''} ${zoomed ? 'cursor-zoom-out w-full h-auto' : 'w-full h-auto'} bg-surface-800`}
          data-testid="figure-image"
        />
      </div>
      {caption && (
        <figcaption
          data-testid="figure-caption"
          className="mt-3 text-center text-sm text-gray-500 italic"
        >
          {caption}
        </figcaption>
      )}
      {zoomed && (
        <button
          data-testid="figure-close"
          onClick={() => setZoomed(false)}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors text-2xl"
          aria-label="Fechar zoom"
        >
          ✕
        </button>
      )}
    </figure>
  );
}

interface FigureGalleryProps {
  images: ContentImage[];
  zoomable?: boolean;
}

export function FigureGallery({ images, zoomable = true }: FigureGalleryProps) {
  if (!images.length) return null;

  return (
    <div data-testid="figure-gallery" className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
      {images.map((img, i) => (
        <Figure key={`${img.src}-${i}`} {...img} zoomable={zoomable} />
      ))}
    </div>
  );
}
