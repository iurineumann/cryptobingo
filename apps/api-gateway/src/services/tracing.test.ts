import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/exporter-trace-otlp-proto');
jest.mock('@opentelemetry/auto-instrumentations-node');

describe('tracing (api-gateway)', () => {
  const OGENV = process.env.OTEL_ENABLED;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.OTEL_ENABLED = OGENV;
  });

  it('starts OTel SDK when OTEL_ENABLED is true', () => {
    process.env.OTEL_ENABLED = 'true';
    jest.isolateModules(() => {
      require('./tracing');
    });
    expect(NodeSDK).toHaveBeenCalledTimes(1);
    expect(NodeSDK.prototype.start).toHaveBeenCalledTimes(1);
  });

  it('skips OTel start when OTEL_ENABLED is not true', () => {
    process.env.OTEL_ENABLED = 'false';
    jest.isolateModules(() => {
      require('./tracing');
    });
    expect(NodeSDK).not.toHaveBeenCalled();
    expect(NodeSDK.prototype.start).not.toHaveBeenCalled();
  });

  it('uses OTLPTraceExporter with OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318/v1/traces';
    jest.isolateModules(() => {
      require('./tracing');
    });
    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://collector:4318/v1/traces',
    });
  });

  it('registers shutdown handlers on SIGTERM and SIGINT', () => {
    process.env.OTEL_ENABLED = 'true';
    const sigTermSpy = jest.spyOn(process, 'on');
    jest.isolateModules(() => {
      require('./tracing');
    });
    expect(sigTermSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(sigTermSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    sigTermSpy.mockRestore();
  });
});
