import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import router from './routes/api';
import { HttpError } from './lib/http-error';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(router);
app.use((_req, res) => { res.status(404).json({ error: 'Endpoint not found' }); });

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.flatten() });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  console.error('Unhandled server error:', error);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);
