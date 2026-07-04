import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';

if (process.env.OTEL_ENABLED === 'true') {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [new AmqplibInstrumentation()],
  });

  sdk.start();

  process.on('SIGTERM', () => sdk.shutdown());
  process.on('SIGINT', () => sdk.shutdown());
}
