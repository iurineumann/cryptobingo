import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware, getRequestId } from '../requestId';

function mockReq(headers?: Record<string, string>): Partial<Request> {
  return { headers: headers ?? {} } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  res.setHeader = jest.fn() as any;
  return res as unknown as Response;
}

describe('requestIdMiddleware', () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    res = mockRes();
    next = jest.fn();
  });

  it('deve definir x-request-id se ausente', () => {
    req = mockReq({});
    requestIdMiddleware(req as Request, res, next);
    expect(req.headers['x-request-id']).toBeDefined();
    expect(typeof req.headers['x-request-id']).toBe('string');
    expect(next).toHaveBeenCalled();
  });

  it('deve preservar x-request-id existente', () => {
    req = mockReq({ 'x-request-id': 'existing-id-123' });
    requestIdMiddleware(req as Request, res, next);
    expect(req.headers['x-request-id']).toBe('existing-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('deve gerar UUID válido quando ausente', () => {
    req = mockReq({});
    requestIdMiddleware(req as Request, res, next);
    const id = req.headers['x-request-id'] as string;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('getRequestId', () => {
  it('deve retornar "unknown" fora do contexto ALS', () => {
    expect(getRequestId()).toBe('unknown');
  });

  it('deve retornar o ID dentro do contexto ALS', () => {
    const { als } = require('../requestId');
    const testId = 'test-id-456';
    als.run(testId, () => {
      expect(getRequestId()).toBe(testId);
    });
  });
});
