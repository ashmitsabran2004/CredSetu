import { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } });
    return;
  }
  if (error?.name === 'ZodError') {
    res.status(400).json({ error: { message: 'Invalid request', details: error.issues } });
    return;
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: { message: 'Receipt must be 5 MB or smaller' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
