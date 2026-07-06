import { useAzureMonitor } from '@azure/monitor-opentelemetry';

if (
  process.env.APPLICATIONINSIGHTS_ENABLED !== 'false' &&
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
) {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseFloat(
      process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO || '0.1',
    ),
  });
}
