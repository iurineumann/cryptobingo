import { analyticsEventHandler } from './analyticsController';

// Mock global fetch (Node 18+)
const mockFetch = jest.fn().mockResolvedValue({ ok: true } as Response);
(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;

function makeRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  const sent: { status?: number; body?: unknown } = {};
  const resObj = {
    status(code: number) {
      sent.status = code;
      return resObj;
    },
    json(payload: unknown) {
      sent.body = payload;
      return resObj;
    },
    end() {
      return resObj;
    },
  } as unknown as Response;
  return { resObj: resObj as Response, sent };
}

describe('analyticsEventHandler — consent gate + client_id', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    process.env.GA4_API_SECRET = 'test_secret';
  });

  test('consent NEGADO (sem cookie cb_consent) → 204, NÃO envia MP', async () => {
    const { resObj, sent } = makeRes();
    const req = {
      headers: { cookie: 'foo=bar' },
      body: { event: 'page_view', page_path: '/' },
    } as unknown as Request;

    await analyticsEventHandler(req, resObj);

    expect(sent.status).toBe(204);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('consent CONCEDIDO (cookie cb_consent=1) → MP chamado com client_id real', async () => {
    const { resObj, sent } = makeRes();
    const req = {
      headers: { cookie: 'cb_consent=1; _cb_cid=real-user-123' },
      body: { event: 'page_view', client_id: 'real-user-123', page_path: '/' },
    } as unknown as Request;

    await analyticsEventHandler(req, resObj);

    expect(sent.status).toBe(204);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.client_id).toBe('real-user-123');
    expect(body.events[0].name).toBe('page_view');
  });

  test('consent via header x-consent=granted → MP chamado', async () => {
    const { resObj } = makeRes();
    const req = {
      headers: { 'x-consent': 'granted' },
      body: { event: 'buyin', client_id: 'hdr-1' },
    } as unknown as Request;

    await analyticsEventHandler(req, resObj);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('campo event ausente → 400', async () => {
    const { resObj, sent } = makeRes();
    const req = {
      headers: { cookie: 'cb_consent=1' },
      body: { page_path: '/' },
    } as unknown as Request;

    await analyticsEventHandler(req, resObj);
    expect(sent.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
