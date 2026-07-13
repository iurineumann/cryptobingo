import express, { Express, Request, Response } from 'express';
import cors from 'cors';

export interface HttpResponseInit {
  status?: number;
  jsonBody?: unknown;
  body?: string;
  headers?: Record<string, string>;
}

class AdaptedRequest {
  constructor(private req: Request) {}

  get method(): string {
    return this.req.method;
  }

  get params(): Record<string, string> {
    return this.req.params as Record<string, string>;
  }

  get query(): { get(name: string): string | null } {
    return {
      get: (name: string): string | null => {
        const val = this.req.query[name];
        if (typeof val === 'string') return val;
        if (Array.isArray(val) && val.length > 0) return String(val[0]);
        return null;
      },
    };
  }

  get headers(): { get(name: string): string | null } {
    const h = this.req.headers;
    return {
      get: (name: string): string | null => {
        const val = h[name.toLowerCase()];
        if (typeof val === 'string') return val;
        if (Array.isArray(val) && val.length > 0) return val[0];
        return null;
      },
    };
  }

  async json<T = unknown>(): Promise<T> {
    return this.req.body as T;
  }
}

export type HttpRequest = AdaptedRequest;
export type HttpRequestLike = AdaptedRequest;

type Handler = (request: AdaptedRequest) => Promise<HttpResponseInit | void>;

interface HttpOptions {
  methods: string[];
  authLevel?: string;
  route: string;
  handler: Handler;
}

class FunctionsShim {
  private expressApp: Express;
  private registered = false;

  constructor() {
    this.expressApp = express();
    this.expressApp.use(cors());
    this.expressApp.use(express.json({ limit: '1mb' }));
  }

  http(_name: string, opts: HttpOptions): void {
    const methods = opts.methods.map((m) => m.toLowerCase());
    const route = '/api/' + opts.route.replace(/^\/+/, '').replace(/\{(\w+)\}/g, ':$1');
    for (const method of methods) {
      const m = method as 'get' | 'post' | 'put' | 'delete' | 'patch';
      this.expressApp[m](route, async (req: Request, res: Response) => {
        try {
          const adapted = new AdaptedRequest(req);
          const result = await opts.handler(adapted);
          if (!result) {
            res.status(204).end();
            return;
          }
          const status = result.status ?? 200;
          if (result.headers) {
            for (const [k, v] of Object.entries(result.headers)) {
              res.setHeader(k, v);
            }
          }
          if (result.jsonBody !== undefined) {
            res.status(status).json(result.jsonBody);
          } else if (result.body !== undefined) {
            res.status(status).send(result.body);
          } else {
            res.status(status).end();
          }
        } catch (e) {
          console.error('[shim] handler error:', e);
          res.status(500).json({ error: 'internal server error' });
        }
      });
    }
  }

  listen(port: number): void {
    if (this.registered) return;
    this.registered = true;
    this.expressApp.listen(port, () => {
      console.log(`landing-api listening on :${port}`);
    });
  }

  getApp(): Express {
    return this.expressApp;
  }
}

export const app = new FunctionsShim();

export function startServer(port = Number(process.env.PORT ?? 8080)): void {
  app.listen(port);
}
