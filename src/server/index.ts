import { createApp } from './app.js';
import { loadConfig } from './config.js';

// Load .env for local development if present (Node >= 20.12). Real environment
// variables always win, and a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

const config = loadConfig();
const { app, close } = createApp({ config });

const server = app.listen(config.port, config.host, () => {
  const mode = config.gemini.apiKey ? `AI enabled (${config.gemini.model})` : 'offline mode (set GEMINI_API_KEY to enable AI)';
  console.info(`Plainly is running on http://localhost:${config.port} - ${mode}`);
});

function shutdown(signal: string): void {
  console.info(`${signal} received, shutting down...`);
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason instanceof Error ? reason.name : typeof reason));
