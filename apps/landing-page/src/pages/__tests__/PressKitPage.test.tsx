import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PressKitPage from '../PressKitPage';

const mockParams = vi.hoisted(() => ({ locale: 'en' }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

vi.mock('@/components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('@/components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('@/components/Seo', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

describe('PressKitPage', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
  });

  it('should render brand colors', () => {
    render(<PressKitPage />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('#8B5CF6')).toBeInTheDocument();
  });

  it('should push press_kit_download for logo download', () => {
    render(<PressKitPage />);
    fireEvent.click(screen.getByTestId('download-logo'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'press_kit_download',
        item: 'logo',
      })
    );
  });

  it('should push press_kit_download for icon download', () => {
    render(<PressKitPage />);
    fireEvent.click(screen.getByTestId('download-icon'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'press_kit_download',
        item: 'icon',
      })
    );
  });

  it('should push press_kit_download for screenshots download', () => {
    render(<PressKitPage />);
    fireEvent.click(screen.getByTestId('download-screenshots'));
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'press_kit_download',
        item: 'screenshots',
      })
    );
  });

  it('should handle missing locale', () => {
    mockParams.locale = '';
    render(<PressKitPage />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });
});
