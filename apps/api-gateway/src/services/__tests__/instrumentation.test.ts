jest.mock('@azure/monitor-opentelemetry', () => ({
  useAzureMonitor: jest.fn(),
}));

import { useAzureMonitor } from '@azure/monitor-opentelemetry';

describe('instrumentation (api-gateway)', () => {
  const OGENABLED = process.env.APPLICATIONINSIGHTS_ENABLED;
  const OGCS = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  const OGSR = process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;

  function setEnv(key: string, value: string | undefined): void {
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setEnv('APPLICATIONINSIGHTS_ENABLED', OGENABLED);
    setEnv('APPLICATIONINSIGHTS_CONNECTION_STRING', OGCS);
    setEnv('APPLICATIONINSIGHTS_SAMPLING_RATIO', OGSR);
  });

  it('nao inicializa useAzureMonitor se APPLICATIONINSIGHTS_ENABLED=false', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'false';
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('inicializa useAzureMonitor com samplingRatio do env', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = '0.5';
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledTimes(1);
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.5,
        azureMonitorExporterOptions: {
          connectionString: 'InstrumentationKey=test',
        },
      }),
    );
  });

  it('usa samplingRatio 0.2 se env nao definido', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    delete process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.2,
      }),
    );
  });

  it('nao inicializa se connection string ausente', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('inicializa com http instrumentations habilitado', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    jest.isolateModules(() => {
      require('../../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentationOptions: {
          http: { enabled: true },
        },
      }),
    );
  });
});
