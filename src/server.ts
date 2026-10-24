import { app } from './app';
import { env } from './config/env';
import { pool } from './db/postgres';

async function main() {
  await pool.query('SELECT 1');
  const server = app.listen(env.PORT, () => {
    console.log(`Chat API: http://localhost:${env.PORT}`);
  });
  const shutdown = () => {
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  console.error('Unable to start chat backend:', error);
  process.exitCode = 1;
  void pool.end();
});
