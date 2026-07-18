import { ContractEventClient, ContractEvent } from '../contractEventClient';

// ── Mock Stream simples (sem globais) ─────────────────────

interface MockStream {
  emitData(data: any): void;
  emitError(err: Error): void;
  emitEnd(): void;
  getDataCallbacks(): Array<(data: any) => void>;
  getErrorCallbacks(): Array<(err: Error) => void>;
  getEndCallbacks(): Array<() => void>;
}

function createMockStream(): MockStream {
  const dataCbs: Array<(data: any) => void> = [];
  const errorCbs: Array<(err: Error) => void> = [];
  const endCbs: Array<() => void> = [];

  return {
    emitData(data: any) { dataCbs.forEach(cb => cb(data)); },
    emitError(err: Error) { errorCbs.forEach(cb => cb(err)); },
    emitEnd() { endCbs.forEach(cb => cb()); },
    getDataCallbacks() { return dataCbs; },
    getErrorCallbacks() { return errorCbs; },
    getEndCallbacks() { return endCbs; },
  };
}

function makeStreamLikeObject(mockStream: MockStream) {
  return {
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      if (event === 'data') mockStream.getDataCallbacks().push(cb);
      else if (event === 'error') mockStream.getErrorCallbacks().push(cb);
      else if (event === 'end') mockStream.getEndCallbacks().push(cb);
      return null;
    }),
    removeListener: jest.fn(),
    destroy: jest.fn(),
    cancelled: false,
  };
}

// ── Factory ───────────────────────────────────────────────

function buildMockClient(mockStream: MockStream) {
  const streamLike = makeStreamLikeObject(mockStream);
  return {
    blocks: jest.fn().mockReturnValue(streamLike),
  };
}

// ── Fixtures Firehose ─────────────────────────────────────

function makeTrace(name: string, data: any, globalSeq: number) {
  return {
    receipt: { global_sequence: globalSeq, receiver: 'bingogamectr' },
    action: {
      account: 'bingogamectr',
      name,
      json_data: JSON.stringify(data),
      raw_data: Buffer.from([]),
    },
    creator_action_ordinal: '1',
    closest_unnotified_ancestor_action_ordinal: '0',
    context_free: false,
  };
}

function makeBlock(blockNum: number, traces: any[], step = 0) {
  return {
    block: {
      id: `block_${blockNum}`,
      number: blockNum,
      filtered_transaction_traces: traces.map(t => ({
        id: Buffer.from([]),
        index: 0,
        status: 'executed',
        action_traces: Array.isArray(t) ? t : [t],
      })),
    },
    step: { step },
  };
}

// ── Fixtures Hyperion ─────────────────────────────────────

function makeHyperionBody(acts: Array<{ name: string; data: any; seq: number; blk: number }>) {
  return {
    actions: acts.map(a => ({
      action_trace: {
        act: { account: 'bingogamectr', name: a.name, data: a.data },
        receipt: { global_sequence: a.seq },
        block_num: a.blk,
      },
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────

type HandlerCallbacks = {
  events: ContractEvent[];
  errors: Error[];
  sources: string[];
};

function setupClientWithFactory(
  mockStream: MockStream,
  overrides: any = {},
): { client: ContractEventClient; cb: HandlerCallbacks; unsub: () => void } {
  const mockClient = buildMockClient(mockStream);
  const cb: HandlerCallbacks = { events: [], errors: [], sources: [] };

  const client = new ContractEventClient({
    pinaxKey: 'test-key',
    firehoseClientFactory: async () => mockClient,
    fetchFn: jest.fn() as any,
    ...overrides,
  });

  const unsub = client.subscribe({
    onEvent: (e) => cb.events.push(e),
    onError: (e) => cb.errors.push(e),
    onSourceChange: (s) => cb.sources.push(s),
  });

  return { client, cb, unsub };
}

function setupClientWithFactoryAndFetch(
  mockStream: MockStream,
  fetchFn: any,
  overrides: any = {},
): { client: ContractEventClient; cb: HandlerCallbacks; unsub: () => void } {
  const mockClient = buildMockClient(mockStream);
  const cb: HandlerCallbacks = { events: [], errors: [], sources: [] };

  const client = new ContractEventClient({
    pinaxKey: 'test-key',
    firehoseClientFactory: async () => mockClient,
    fetchFn,
    ...overrides,
  });

  const unsub = client.subscribe({
    onEvent: (e) => cb.events.push(e),
    onError: (e) => cb.errors.push(e),
    onSourceChange: (s) => cb.sources.push(s),
  });

  return { client, cb, unsub };
}

// ── Testes ────────────────────────────────────────────────

describe('ContractEventClient', () => {
  // ── Teste 1: Filtro action vazia ────────────────────────

  test('filtra ação com nome vazio e emite evento válido', async () => {
    const ms = createMockStream();
    const { cb } = setupClientWithFactory(ms);

    // Aguarda setup do stream (registro de listeners)
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(100, [
      makeTrace('creategame', { game_id: '42' }, 500),
      makeTrace('', {}, 501),
    ]));

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0]).toMatchObject({
      game_id: '42',
      action: 'creategame',
      block_num: 100,
      global_seq: 500,
    });
  });

  // ── Teste 2: Normalização ───────────────────────────────

  test('normaliza resposta Firehose para ContractEvent', async () => {
    const ms = createMockStream();
    const { cb } = setupClientWithFactory(ms);
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(200, [
      makeTrace('fundgame', { game_id: '7', amount: '10.0000 WAX' }, 1000),
      makeTrace('lockgame', { game_id: '7' }, 1001),
    ], 1));

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(2);

    expect(cb.events[0]).toMatchObject({
      game_id: '7', action: 'fundgame', block_num: 200, global_seq: 1000, step: 1,
    });
    expect(cb.events[0].data).toEqual({ game_id: '7', amount: '10.0000 WAX' });

    expect(cb.events[1]).toMatchObject({
      game_id: '7', action: 'lockgame', block_num: 200, global_seq: 1001, step: 1,
    });
  });

  // ── Teste 3: Cursor startGlobalSeq ──────────────────────

  test('ignora eventos com global_seq <= startGlobalSeq', async () => {
    const ms = createMockStream();
    const { cb } = setupClientWithFactory(ms, { startGlobalSeq: 500 });
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(50, [
      makeTrace('creategame', { game_id: '1' }, 400),
      makeTrace('fundgame', { game_id: '1' }, 500),
      makeTrace('lockgame', { game_id: '1' }, 501),
    ]));

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0].action).toBe('lockgame');
    expect(cb.events[0].global_seq).toBe(501);
  });

  // ── Teste 4: json_data inválido ─────────────────────────

  test('json_data inválido retorna data vazia sem erro', async () => {
    const ms = createMockStream();
    const { cb } = setupClientWithFactory(ms);
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(10, [{
      receipt: { global_sequence: 1, receiver: 'bingogamectr' },
      action: {
        account: 'bingogamectr',
        name: 'abortgame',
        json_data: 'not-json{{{',
        raw_data: Buffer.from([]),
      },
      creator_action_ordinal: '1',
      closest_unnotified_ancestor_action_ordinal: '0',
      context_free: false,
    }]));

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0].action).toBe('abortgame');
    expect(cb.events[0].data).toEqual({});
  });

  // ── Teste 5: fallback data.id para game_id ──────────────

  test('usa data.id como game_id quando data.game_id ausente', async () => {
    const ms = createMockStream();
    const { cb } = setupClientWithFactory(ms);
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(300, [
      makeTrace('setconfig', { id: '99' }, 2000),
    ]));

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0].game_id).toBe('99');
  });

  // ── Teste 6: Hyperion fallback ──────────────────────────

  test('Hyperion fallback processa get_actions', async () => {
    const ms = createMockStream();
    const fetchFn = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeHyperionBody([
        { name: 'startdraw', data: { game_id: '55' }, seq: 700, blk: 400 },
        { name: 'drawn', data: { game_id: '55' }, seq: 701, blk: 400 },
      ]),
    });

    const { cb } = setupClientWithFactoryAndFetch(ms, fetchFn);
    await new Promise(r => setTimeout(r, 50));

    // Força erro no Firehose → fallback Hyperion
    ms.emitError(new Error('test connection refused'));

    await new Promise(r => setTimeout(r, 200));

    expect(cb.events.length).toBeGreaterThanOrEqual(2);
    const sd = cb.events.find(e => e.action === 'startdraw');
    expect(sd).toBeDefined();
    expect(sd!.game_id).toBe('55');
    expect(sd!.global_seq).toBe(700);
  });

  // ── Teste 7: Hyperion duplicatas ────────────────────────

  test('Hyperion ignora ações com global_seq <= cursor', async () => {
    const ms = createMockStream();
    const fetchFn = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeHyperionBody([
        { name: 'startdraw', data: { game_id: '55' }, seq: 699, blk: 400 },
        { name: 'drawn', data: { game_id: '55' }, seq: 700, blk: 400 },
        { name: 'claimwin', data: { game_id: '55' }, seq: 701, blk: 401 },
      ]),
    });

    const { cb } = setupClientWithFactoryAndFetch(ms, fetchFn, { startGlobalSeq: 700 });
    await new Promise(r => setTimeout(r, 50));

    ms.emitError(new Error('unavailable'));

    await new Promise(r => setTimeout(r, 200));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0].action).toBe('claimwin');
  });

  // ── Teste 8: onSourceChange ─────────────────────────────

  test('emite sourceChange firehose → hyperion', async () => {
    const ms = createMockStream();
    const fetchFn = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ actions: [] }),
    });

    const { cb } = setupClientWithFactoryAndFetch(ms, fetchFn);
    await new Promise(r => setTimeout(r, 50));

    expect(cb.sources).toContain('firehose');

    ms.emitError(new Error('dead'));

    await new Promise(r => setTimeout(r, 200));
    expect(cb.sources).toContain('hyperion');
  });

  // ── Teste 9: unsubscribe ────────────────────────────────

  test('unsubscribe remove listener', async () => {
    const ms = createMockStream();
    const { cb, unsub } = setupClientWithFactory(ms);
    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(1, [makeTrace('creategame', { game_id: '1' }, 1)]));
    await new Promise(r => setTimeout(r, 50));
    expect(cb.events.length).toBe(1);

    unsub();

    ms.emitData(makeBlock(2, [makeTrace('fundgame', { game_id: '2' }, 2)]));
    await new Promise(r => setTimeout(r, 50));
    expect(cb.events.length).toBe(1);
  });

  // ── Teste 10: múltiplos subscribers ─────────────────────

  test('múltiplos subscribers recebem mesmos eventos', async () => {
    const ms = createMockStream();
    const mockClient = buildMockClient(ms);
    const cbA: HandlerCallbacks = { events: [], errors: [], sources: [] };
    const cbB: HandlerCallbacks = { events: [], errors: [], sources: [] };

    const client = new ContractEventClient({
      pinaxKey: 'test-key',
      firehoseClientFactory: async () => mockClient,
      fetchFn: jest.fn() as any,
    });

    client.subscribe({ onEvent: (e) => cbA.events.push(e) });
    client.subscribe({ onEvent: (e) => cbB.events.push(e) });

    await new Promise(r => setTimeout(r, 50));

    ms.emitData(makeBlock(99, [makeTrace('closegame', { game_id: '42' }, 999)]));
    await new Promise(r => setTimeout(r, 50));

    expect(cbA.events.length).toBe(1);
    expect(cbB.events.length).toBe(1);
    expect(cbA.events[0]).toEqual(cbB.events[0]);
  });

  // ── Teste 11: onError handler ───────────────────────────

  test('propaga erro para onError quando onSourceChange falha', async () => {
    const ms = createMockStream();
    // Firehose conecta normalmente, sem erro
    const { cb } = setupClientWithFactory(ms);
    await new Promise(r => setTimeout(r, 50));

    // Força queda → vai para Hyperion (fetch mock não configurado → erro)
    ms.emitError(new Error('stream died'));
    await new Promise(r => setTimeout(r, 100));

    // Deve ter erro por Hyperion fetch falhar
    expect(cb.errors.length).toBeGreaterThan(0);
  });

  // ── Teste 12: source getter ─────────────────────────────

  test('source getter retorna fonte atual', async () => {
    const ms = createMockStream();
    const { client } = setupClientWithFactory(ms);

    expect(client.source).toBe('none');

    await new Promise(r => setTimeout(r, 50));
    expect(client.source).toBe('firehose');
  });

  // ── Teste 13: unpack REAL de google.protobuf.Any -> Block ─
  // Cobre o caminho de runtime do servidor Pinax: response.block é um Any
  // empacotado, e extractBlock faz unpack via blockMessageType. Usa o proto
  // REAL (loadPackageDefinition) para provar que .deserialize funciona.

  test('unpack real do Any->Block via extractBlock (proto Pinax)', async () => {
    // Carrega os protos reais como no runtime (getFirehoseClient).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const protoLoader = require('@grpc/proto-loader');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const grpc = require('@grpc/grpc-js');

    const path = require('path');
    const protoDir = path.resolve(__dirname, '..', 'proto');
    const pd = protoLoader.loadSync(path.join(protoDir, 'firehose_v2.proto'), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [protoDir],
    });
    const proto = grpc.loadPackageDefinition(pd);
    const Block = proto.sf.antelope.type.v1.Block;
    const Any = proto.google.protobuf.Any;

    const ms = createMockStream();
    const { client, cb } = setupClientWithFactory(ms);

    // Injeta o descriptor real do Block (o que getFirehoseClient carregaria).
    (client as any).blockMessageType = Block;

    await new Promise(r => setTimeout(r, 50));

    // Monta um bloco real e empacota em Any (exatamente como o servidor manda).
    const blockObj = {
      id: '0'.repeat(64),
      number: 4242,
      filtered_transaction_traces: [
        {
          id: 'trace-1',
          action_traces: [
            {
              receipt: { receiver: 'bingogamectr', global_sequence: 555 },
              action: {
                account: 'bingogamectr',
                name: 'creategame',
                json_data: JSON.stringify({ game_id: 'ZXC-99', amount: '5.0000 WAX' }),
              },
            },
          ],
        },
      ],
    };
    const anyWrapped = {
      type_url: 'type.googleapis.com/sf.antelope.type.v1.Block',
      value: Block.serialize(blockObj),
    };

    // Response no formato do servidor Pinax (block é Any, step=6).
    ms.emitData({ block: anyWrapped, step: { step: 1 } });

    await new Promise(r => setTimeout(r, 50));

    expect(cb.events.length).toBe(1);
    expect(cb.events[0]).toMatchObject({
      game_id: 'ZXC-99',
      action: 'creategame',
      block_num: 4242,
      global_seq: 555,
      step: 1,
    });
    expect(cb.events[0].data).toEqual({ game_id: 'ZXC-99', amount: '5.0000 WAX' });
  });
});
