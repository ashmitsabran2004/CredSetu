import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors';

export type AuthRequest = Request & { userId?: number };
export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
