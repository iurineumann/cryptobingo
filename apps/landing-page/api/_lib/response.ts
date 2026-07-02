import type { HttpResponseInit } from '@azure/functions';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function ok<T>(data: T, status = 200): HttpResponseInit {
  return { status, headers, body: JSON.stringify(data) };
}

export function created<T>(data: T): HttpResponseInit {
  return ok(data, 201);
}

export function noContent(): HttpResponseInit {
  return { status: 204, headers };
}

export function badRequest(message: string): HttpResponseInit {
  return { status: 400, headers, body: JSON.stringify({ error: message }) };
}

export function notFound(message = 'Not found'): HttpResponseInit {
  return { status: 404, headers, body: JSON.stringify({ error: message }) };
}

export function unauthorized(message = 'Unauthorized'): HttpResponseInit {
  return { status: 401, headers, body: JSON.stringify({ error: message }) };
}

export function serverError(error: unknown): HttpResponseInit {
  console.error('[500]', error);
  return {
    status: 500,
    headers,
    body: JSON.stringify({ error: 'Internal server error' }),
  };
}
