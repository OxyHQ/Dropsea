import http from 'node:http';
import { OxyServer } from '@oxy.so/core/server';
import { createAwsWorkloadCredentialProvider } from '@oxy.so/core/server/aws';
import { createApp } from './app';
import { config } from './config';
import { closePostgres, connectPostgres } from './db/postgres';
import { createOxyPhotoSource } from './services/photos.service';

async function main(): Promise<void> {
  await connectPostgres();

  // One client for verifying sessions and for reading Oxy Files as Dropsea's
  // own service identity (the attested task role on ECS).
  const oxy = new OxyServer({
    baseURL: config.oxyApiUrl,
    workloadCredentials: createAwsWorkloadCredentialProvider(),
  });
  const server = http.createServer(createApp(oxy, createOxyPhotoSource(oxy)));

  server.listen(config.port, () => {
    console.log(`Dropsea backend listening on port ${config.port}`);
  });

  let isShuttingDown = false;
  const shutdown = (signal: string): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    // Force-exit if close hangs rather than leaving the task to be killed cold.
    const forceExit = setTimeout(() => {
      console.error('Force exit after 30s grace period');
      process.exit(1);
    }, 30_000);
    forceExit.unref();

    server.close(() => {
      closePostgres()
        .then(() => {
          clearTimeout(forceExit);
          console.log('Graceful shutdown complete');
          process.exit(0);
        })
        .catch((error: unknown) => {
          console.error('Error during shutdown:', error);
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Dropsea backend failed to start:', error);
  process.exitCode = 1;
});
