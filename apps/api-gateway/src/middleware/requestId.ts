import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

export const als = new AsyncLocalStorage<string>();

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = id;
  als.run(id, () => next());
}

export function getRequestId(): string {
  return als.getStore() || 'unknown';
}
