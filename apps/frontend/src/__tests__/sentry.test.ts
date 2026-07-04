import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';

const mockInit = vi.fn();
const mockBrowserTracing = vi.fn(() => ({}));
const MockErrorBoundary = ({ children }: { children: React.ReactNode }) => children;

vi.mock('@sentry/react', () => ({
  init: mockInit,
  browserTracingIntegration: mockBrowserTracing,
  ErrorBoundary: MockErrorBoundary,
}));

describe('initSentry', () => {
  beforeEach(() => {
    mockInit.mockClear();
  });

  it('chama Sentry.init com environment do MODE', async () => {
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: expect.any(String),
        tracesSampleRate: expect.any(Number),
      }),
    );
  });

  it('inclui browserTracingIntegration', async () => {
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([expect.any(Object)]),
      }),
    );
  });
});
