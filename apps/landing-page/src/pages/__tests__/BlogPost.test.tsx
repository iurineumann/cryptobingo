import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import BlogPost from '../BlogPost';

vi.mock('react-router-dom', () => ({
  useLoaderData: () => ({
    title: 'Test Post',
    description: 'Test description',
    body: '<p>Hello world</p>',
  }),
  useParams: () => ({ slug: 'test', locale: 'en' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/Seo', () => ({ default: () => null }));
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/components/Footer', () => ({ default: () => null }));

describe('BlogPost', () => {
  test('renders body with prose classes', () => {
    render(<BlogPost />);
    const article = screen.getByRole('article');
    const bodyDiv = article.querySelector('.prose');
    expect(bodyDiv).toBeInTheDocument();
    expect(bodyDiv).toHaveClass('prose-invert');
  });
});
