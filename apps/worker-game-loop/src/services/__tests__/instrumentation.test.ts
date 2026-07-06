jest.mock('@azure/monitor-opentelemetry', () => ({
  useAzureMonitor: jest.fn(),
}));

import { useAzureMonitor } from '@azure/monitor-opentelemetry';

describe('instrumentation (worker-game-loop)', () => {
  const OGENABLED = process.env.APPLICATIONINSIGHTS_ENABLED;
  const OGCS = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  const OGSR = process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPLICATIONINSIGHTS_ENABLED = OGENABLED;
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = OGCS;
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = OGSR;
  });

  it('nao inicializa se APPLICATIONINSIGHTS_ENABLED=false', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'false';
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('inicializa com samplingRatio 0.1 (default worker)', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-worker';
    delete process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledTimes(1);
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.1,
        azureMonitorExporterOptions: {
          connectionString: 'InstrumentationKey=test-worker',
        },
      }),
    );
  });
});
