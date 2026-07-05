import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FAQSection } from '../FAQSection';

const mockTrackEvent = vi.fn();
vi.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

beforeEach(() => {
  mockTrackEvent.mockClear();
  localStorage.clear();
});

const items = [
  { question: 'O que é CryptoBingo?', answer: 'Plataforma GameFi na WAX.' },
  { question: 'Como comprar tickets?', answer: 'Conecte sua carteira e deposite.' },
];

describe('FAQSection', () => {
  it('renders all FAQ items with questions visible', () => {
    render(<FAQSection items={items} />);
    expect(screen.getByTestId('faq-section')).toBeInTheDocument();
    expect(screen.getByText('O que é CryptoBingo?')).toBeInTheDocument();
    expect(screen.getByText('Como comprar tickets?')).toBeInTheDocument();
  });

  it('hides answers by default', () => {
    render(<FAQSection items={items} />);
    expect(screen.queryByText('Plataforma GameFi na WAX.')).not.toBeInTheDocument();
    expect(screen.queryByText('Conecte sua carteira e deposite.')).not.toBeInTheDocument();
  });

  it('reveals answer on click', () => {
    render(<FAQSection items={items} />);
    fireEvent.click(screen.getByText('O que é CryptoBingo?'));
    expect(screen.getByText('Plataforma GameFi na WAX.')).toBeInTheDocument();
  });

  it('hides answer on second click', () => {
    render(<FAQSection items={items} />);
    const btn = screen.getByText('O que é CryptoBingo?');
    fireEvent.click(btn);
    expect(screen.getByText('Plataforma GameFi na WAX.')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Plataforma GameFi na WAX.')).not.toBeInTheDocument();
  });

  it('renders JSON-LD script tag with FAQ schema', () => {
    render(<FAQSection items={items} />);
    const script = screen.getByTestId('faq-jsonld');
    expect(script).toBeInTheDocument();
    const parsed = JSON.parse(script.textContent || '');
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity).toHaveLength(2);
    expect(parsed.mainEntity[0].name).toBe('O que é CryptoBingo?');
  });

  it('fires analytics event on toggle', () => {
    render(<FAQSection items={items} locale="pt" />);
    fireEvent.click(screen.getByText('O que é CryptoBingo?'));
    expect(mockTrackEvent).toHaveBeenCalledWith('faq_toggle', {
      question: 'O que é CryptoBingo?',
      action: 'open',
      locale: 'pt',
    });
  });

  it('fires analytics event on close', () => {
    render(<FAQSection items={items} locale="en" />);
    const btn = screen.getByText('O que é CryptoBingo?');
    fireEvent.click(btn);
    expect(mockTrackEvent).toHaveBeenLastCalledWith('faq_toggle', {
      question: 'O que é CryptoBingo?',
      action: 'open',
      locale: 'en',
    });
    fireEvent.click(btn);
    expect(mockTrackEvent).toHaveBeenLastCalledWith('faq_toggle', {
      question: 'O que é CryptoBingo?',
      action: 'close',
      locale: 'en',
    });
  });

  it('persists open state to localStorage', () => {
    const storageKey = 'faq-open-test-post';
    render(<FAQSection items={items} storageKey={storageKey} />);
    fireEvent.click(screen.getByText('O que é CryptoBingo?'));
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    expect(saved).toContain(0);
  });

  it('restores open state from localStorage', () => {
    const storageKey = 'faq-open-test-post';
    localStorage.setItem(storageKey, JSON.stringify([1]));
    render(<FAQSection items={items} storageKey={storageKey} />);
    expect(screen.getByText('Conecte sua carteira e deposite.')).toBeInTheDocument();
  });

  it('uses data-testid on question buttons', () => {
    render(<FAQSection items={items} />);
    const buttons = screen.getAllByTestId('faq-question');
    expect(buttons).toHaveLength(2);
  });

  it('uses data-testid on answer panels', () => {
    render(<FAQSection items={items} />);
    fireEvent.click(screen.getByText('O que é CryptoBingo?'));
    expect(screen.getByTestId('faq-answer-0')).toBeInTheDocument();
  });
});
