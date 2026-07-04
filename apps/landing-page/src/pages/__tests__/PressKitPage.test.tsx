import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PressKitPage from '../PressKitPage';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ locale: 'en' }),
}));

vi.mock('@/components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('@/components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

describe('PressKitPage analytics', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
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
});
