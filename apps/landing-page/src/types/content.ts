export interface ContentHeaderProps {
  title: string;
  description?: string;
  cover?: string;
  author?: string;
  date?: string;
  tags?: string[];
  readTime: number;
  readTimeLabel?: string;
}

export interface ContentImage {
  src: string;
  alt: string;
  caption?: string;
}
