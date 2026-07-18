import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import type { ClientReadableStream } from '@grpc/grpc-js';

/** Evento normalizado de contrato — formato comum Firehose e Hyperion. */
export interface ContractEvent {
  game_id: string;
  action: string;
  data: any;
  block_num: number;
  global_seq: number;
  step: number;
}

/** Callbacks que o consumidor registra para receber eventos. */
export interface ContractEventHandlers {
  onEvent: (event: ContractEvent) => void;
  onError?: (error: Error) => void;
  onSourceChange?: (source: 'firehose' | 'hyperion') => void;
}

export interface ContractEventClientOptions {
  pinaxKey?: string;
  firehoseEndpoint?: string;
  hyperionUrl?: string;
  contractAccount?: string;
  /** Bloco inicial para cursor de replay. */
  startBlock?: number;
  /** global_seq inicial para cursor de replay (evita duplicatas). */
  startGlobalSeq?: number;
  /** Intervalo de poll do Hyperion em ms (default: 30s). */
  hyperionPollIntervalMs?: number;
  /**
   * Factory para criar cliente Firehose gRPC.
   * Injete mock em testes; em produção usa lazy-load de @grpc/grpc-js.
   */
  firehoseClientFactory?: () => Promise<any>;
  /**
   * Função fetch customizada (mock em testes).
   */
  fetchFn?: typeof fetch;
}

const DEFAULT_FIREHOSE_ENDPOINT = 'waxtest.firehose.pinax.network:443';
const DEFAULT_HYPERION_URL = 'https://testnet.waxsweden.org';
const DEFAULT_CONTRACT_ACCOUNT = 'bingogamectr';
const DEFAULT_HYPERION_POLL_MS = 30_000;

/**
 * Cliente de eventos on-chain para o contrato bingogamectr.
 *
 * Primário: Firehose gRPC (Pinax) — streaming em tempo real.
 * Fallback: Hyperion REST — poll quando Firehose indisponível.
 *
 * Uso:
 *   const client = new ContractEventClient({ pinaxKey: '...' });
 *   const unsub = client.subscribe({ onEvent: (ev) => console.log(ev) });
 *   // depois: unsub();
 */
export class ContractEventClient {
  private emitters = new Map<ContractEventHandlers, EventEmitter>();
  private firehoseEndpoint: string;
  private hyperionUrl: string;
  private contractAccount: string;
  private pinaxKey: string;
  private startBlock: number;
  private startGlobalSeq: number;
  private hyperionPollIntervalMs: number;

  private currentSource: 'firehose' | 'hyperion' | 'none' = 'none';
  private firehoseStream: ClientReadableStream<any> | null = null;
  private hyperionTimer: ReturnType<typeof setInterval> | null = null;
  private lastGlobalSeq = 0;
  private lastBlockNum = 0;

  /** Caminho absoluto para o diretório de protos. */
  private protoDir: string;
  /** Caminho absoluto para firehose_v2.proto. */
  private firehoseProtoPath: string;
  // lazy-loaded para não quebrar em ambientes sem @grpc/grpc-js
  private grpcModule: any = null;
  private protoLoaderModule: any = null;
  private firehoseClient: any = null;
  /** Descriptor da message sf.antelope.type.v1.Block (para unpack do Any). */
  private blockMessageType: any = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private firehoseErrorCount = 0;
  private readonly MAX_FIREHOSE_ERRORS = 5;
  private firehoseClientFactory: (() => Promise<any>) | null;
  private fetchFn: typeof fetch;

  constructor(options: ContractEventClientOptions = {}) {
    this.pinaxKey = options.pinaxKey ?? process.env.PINAX_KEY ?? '';
    this.firehoseEndpoint = options.firehoseEndpoint ?? DEFAULT_FIREHOSE_ENDPOINT;
    this.hyperionUrl = options.hyperionUrl ?? process.env.HYPERION_URL ?? DEFAULT_HYPERION_URL;
    this.contractAccount = options.contractAccount ?? process.env.CONTRACT_ACCOUNT ?? DEFAULT_CONTRACT_ACCOUNT;
    this.startBlock = options.startBlock ?? 0;
    this.startGlobalSeq = options.startGlobalSeq ?? 0;
    this.hyperionPollIntervalMs = options.hyperionPollIntervalMs ?? DEFAULT_HYPERION_POLL_MS;

    this.firehoseClientFactory = options.firehoseClientFactory ?? null;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);

    this.lastGlobalSeq = this.startGlobalSeq;
    this.lastBlockNum = this.startBlock;

    this.lastGlobalSeq = this.startGlobalSeq;
    this.lastBlockNum = this.startBlock;

    // Resolve caminhos de proto: tenta src/proto (dev/test), depois dist/proto (build)
    const srcProto = path.resolve(__dirname, 'proto');
    if (fs.existsSync(path.join(srcProto, 'firehose_v2.proto'))) {
      this.protoDir = srcProto;
    } else {
      this.protoDir = path.resolve(__dirname, '..', 'proto');
    }
    this.firehoseProtoPath = path.join(this.protoDir, 'firehose_v2.proto');

    if (!fs.existsSync(this.firehoseProtoPath)) {
      console.warn(
        `[contractEventClient] Proto não encontrado em ${this.firehoseProtoPath}. ` +
        'Firehose gRPC indisponível — usando apenas Hyperion fallback.'
      );
    }
  }

  /**
   * Registra handlers de evento.
   * Retorna função `unsubscribe()` para remover.
   */
  subscribe(handlers: ContractEventHandlers): () => void {
    const emitter = new EventEmitter();

    if (handlers.onEvent) {
      emitter.on('event', handlers.onEvent);
    }
    if (handlers.onError) {
      emitter.on('error', handlers.onError);
    }
    if (handlers.onSourceChange) {
      emitter.on('sourceChange', handlers.onSourceChange);
    }

    this.emitters.set(handlers, emitter);

    // Inicia conexão se for o primeiro subscriber
    if (this.emitters.size === 1) {
      this.startFirehose().catch(() => {
        this.switchToHyperion();
      });
    }

    return () => {
      emitter.removeAllListeners();
      this.emitters.delete(handlers);

      if (this.emitters.size === 0) {
        this.disconnect();
      }
    };
  }

  /** Fonte atual de eventos. */
  get source(): 'firehose' | 'hyperion' | 'none' {
    return this.currentSource;
  }

  // ── Emissão ──────────────────────────────────────────────

  private emitEvent(event: ContractEvent): void {
    for (const emitter of this.emitters.values()) {
      emitter.emit('event', event);
    }
  }

  private emitError(error: Error): void {
    for (const emitter of this.emitters.values()) {
      emitter.emit('error', error);
    }
  }

  private emitSourceChange(source: 'firehose' | 'hyperion'): void {
    this.currentSource = source;
    for (const emitter of this.emitters.values()) {
      emitter.emit('sourceChange', source);
    }
  }

  // ── Desconexão ───────────────────────────────────────────

  private disconnect(): void {
    this.stopFirehose();
    this.stopHyperion();
    this.currentSource = 'none';
  }

  private stopFirehose(): void {
    if (this.firehoseStream) {
      try { this.firehoseStream.destroy(); } catch { /* ok */ }
      this.firehoseStream = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private stopHyperion(): void {
    if (this.hyperionTimer) {
      clearInterval(this.hyperionTimer);
      this.hyperionTimer = null;
    }
  }

  // ── Firehose gRPC (primário) ─────────────────────────────

  private async startFirehose(): Promise<void> {
    if (!this.pinaxKey) {
      console.warn('[contractEventClient] PINAX_KEY não configurada — usando Hyperion fallback.');
      throw new Error('PINAX_KEY ausente');
    }

    this.stopFirehose();

    // Constrói request com cursor
    const startBlock = this.lastBlockNum > 0 ? this.lastBlockNum - 1 : -50;
    const request = {
      start_block_num: startBlock,
      fork_steps: [],
    };

    const client = await this.getFirehoseClient();

    // Metadata: factory mock ignora; produção usa X-Api-Key
    let metadata: any = {};
    if (!this.firehoseClientFactory) {
      const { Metadata } = await this.loadGrpc();
      const md = new Metadata();
      md.set('X-Api-Key', this.pinaxKey);
      metadata = md;
    }

    const stream: ClientReadableStream<any> = client.blocks(request, metadata);
    this.firehoseStream = stream;
    this.firehoseErrorCount = 0;
    this.emitSourceChange('firehose');

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      stream.on('data', (response: any) => {
        try {
          const events = this.normalizeFirehoseResponse(response);
          for (const event of events) {
            if (event.action && this.isContractEvent(event)) {
              this.emitEvent(event);
            }
          }
        } catch (err) {
          this.emitError(err instanceof Error ? err : new Error(String(err)));
        }
      });

      stream.on('error', (err: Error) => {
        console.error('[contractEventClient] Erro no stream Firehose:', err.message);
        this.firehoseErrorCount++;
        if (this.firehoseErrorCount >= this.MAX_FIREHOSE_ERRORS) {
          this.stopFirehose();
          this.switchToHyperion();
        } else {
          this.scheduleFirehoseReconnect();
        }
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      stream.on('end', () => {
        this.stopFirehose();
        this.switchToHyperion();
      });

      const onFirstData = () => {
        if (!resolved) {
          resolved = true;
          stream.removeListener('data', onFirstData);
          resolve();
        }
      };
      stream.on('data', onFirstData);
    });
  }

  private scheduleFirehoseReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000); // backoff exponencial
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startFirehose().catch(() => {
        this.switchToHyperion();
      });
    }, this.reconnectDelay);
  }

  private normalizeFirehoseResponse(response: any): ContractEvent[] {
    const events: ContractEvent[] = [];

    const step = response?.step?.step ?? 0;
    // O servidor Pinax empacota o bloco em google.protobuf.Any (type_url +
    // value bytes). Em testes/mocks o bloco pode vir direto (sem value).
    const block = this.extractBlock(response?.block);
    if (!block) return events;

    const blockNum = typeof block.number === 'string' ? parseInt(block.number, 10) : block.number;
    if (blockNum) {
      this.lastBlockNum = Math.max(this.lastBlockNum, blockNum);
    }

    const traces = block.filtered_transaction_traces ?? [];
    for (const trace of traces) {
      const actionTraces = trace.action_traces ?? [];
      for (const actionTrace of actionTraces) {
        const action = actionTrace?.action;
        if (!action) continue;

        const receipt = actionTrace?.receipt;
        const globalSeq = typeof receipt?.global_sequence === 'string'
          ? parseInt(receipt.global_sequence, 10)
          : (receipt?.global_sequence ?? 0);

        if (globalSeq <= this.startGlobalSeq || globalSeq <= this.lastGlobalSeq) continue;
        this.lastGlobalSeq = Math.max(this.lastGlobalSeq, globalSeq);

        let data: any = null;
        if (action.json_data) {
          try {
            data = JSON.parse(action.json_data);
          } catch {
            data = {};
          }
        }

        events.push({
          game_id: data?.game_id ?? data?.id ?? '',
          action: action.name ?? '',
          data,
          block_num: blockNum,
          global_seq: globalSeq,
          step,
        });
      }
    }

    return events;
  }

  /**
   * Extrai o `sf.antelope.type.v1.Block` de um `response.block`.
   *
   * - Servidor real (Pinax): `block` é um `google.protobuf.Any`
   *   (`{ type_url, value: Uint8Array }`). Fazemos unpack manual via o
   *   descriptor do `Block` carregado em `getFirehoseClient`.
   * - Testes/mocks: `block` é o objeto `Block` direto (sem `value`).
   */
  private extractBlock(rawBlock: any): any {
    if (!rawBlock) return null;

    // Formato Any (servidor real)
    if (rawBlock.value && this.blockMessageType) {
      // `loadPackageDefinition` (grpc-js) expõe `.deserialize`; protobufjs puro
      // expõe `.decode`. Ambos fazem unpack dos bytes — usamos o que existir.
      const decodeFn =
        (this.blockMessageType as any).deserialize ??
        (this.blockMessageType as any).decode;
      if (typeof decodeFn === 'function') {
        try {
          return decodeFn.call(this.blockMessageType, rawBlock.value);
        } catch (err) {
          this.emitError(
            err instanceof Error ? err : new Error(`Falha ao decodar bloco Any: ${String(err)}`)
          );
          return null;
        }
      }
    }

    // Formato direto (mock/teste) — usa o objeto como está
    return rawBlock;
  }

  private isContractEvent(event: ContractEvent): boolean {
    return event.action.length > 0;
  }

  // ── Hyperion REST (fallback) ─────────────────────────────

  private async switchToHyperion(): Promise<void> {
    if (this.hyperionTimer) return; // já está no Hyperion

    this.stopFirehose();
    this.emitSourceChange('hyperion');
    console.log('[contractEventClient] Alternando para Hyperion fallback.');

    // Poll inicial imediato
    await this.pollHyperion().catch((err) => {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });

    this.hyperionTimer = setInterval(() => {
      this.pollHyperion().catch((err) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      });
    }, this.hyperionPollIntervalMs);

    // Tenta reconectar Firehose periodicamente
    this.scheduleFirehoseReconnect();
  }

  private async pollHyperion(): Promise<void> {
    const limit = 100;
    const skip = 0;

    const url = `${this.hyperionUrl}/v2/history/get_actions?account=${this.contractAccount}&limit=${limit}&skip=${skip}&sort=desc&after=${this.lastBlockNum}`;

    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Hyperion HTTP ${response.status}: ${response.statusText}`);
    }

    const body = await response.json() as Record<string, any>;
    const actions = body?.actions ?? [];

    for (const item of actions) {
      const actionTrace = item?.action_trace;
      if (!actionTrace) continue;

      const act = actionTrace.act;
      const receipt = actionTrace.receipt;
      const blockNum = actionTrace.block_num ?? item?.block_num ?? 0;
      const globalSeq = typeof receipt?.global_sequence === 'string'
        ? parseInt(receipt.global_sequence, 10)
        : (receipt?.global_sequence ?? 0);

      if (globalSeq <= this.lastGlobalSeq) continue;
      this.lastGlobalSeq = Math.max(this.lastGlobalSeq, globalSeq);
      if (blockNum) this.lastBlockNum = Math.max(this.lastBlockNum, blockNum);

      const event: ContractEvent = {
        game_id: act?.data?.game_id ?? act?.data?.id ?? '',
        action: act?.name ?? '',
        data: act?.data ?? {},
        block_num: blockNum,
        global_seq: globalSeq,
        step: 0,
      };

      if (event.action) {
        this.emitEvent(event);
      }
    }

    // Tenta retornar ao Firehose se não estiver nele
    if (this.currentSource === 'hyperion' && !this.firehoseStream) {
      this.startFirehose().then(() => {
        this.stopHyperion();
        this.reconnectDelay = 1000; // reset backoff
      }).catch(() => {
        // continua Hyperion
      });
    }
  }

  // ── Lazy load gRPC ───────────────────────────────────────

  private async loadGrpc() {
    if (!this.grpcModule) {
      try {
        this.grpcModule = await import('@grpc/grpc-js');
        this.protoLoaderModule = await import('@grpc/proto-loader');
      } catch (err) {
        throw new Error(
          '@grpc/grpc-js e @grpc/proto-loader são dependências necessárias. ' +
          'Instale com: pnpm add @grpc/grpc-js @grpc/proto-loader'
        );
      }
    }
    return {
      loadPackageDefinition: this.grpcModule.loadPackageDefinition,
      credentials: this.grpcModule.credentials,
      Metadata: this.grpcModule.Metadata,
    };
  }

  private async getFirehoseClient(): Promise<any> {
    if (this.firehoseClient) return this.firehoseClient;

    // Factory injetável (mock em testes) — evita import dinâmico real
    if (this.firehoseClientFactory) {
      this.firehoseClient = await this.firehoseClientFactory();
      return this.firehoseClient;
    }

    const { loadPackageDefinition, credentials } = await this.loadGrpc();
    const protoLoader = this.protoLoaderModule;

    const packageDefinition = protoLoader.loadSync(this.firehoseProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [this.protoDir],
    });

    const proto = loadPackageDefinition(packageDefinition);
    this.firehoseClient = new proto.sf.firehose.v2.Stream(
      this.firehoseEndpoint,
      credentials.createSsl(),
    );

    // Carrega o descriptor do Block (para unpack do google.protobuf.Any)
    if (proto.sf?.antelope?.type?.v1?.Block) {
      this.blockMessageType = proto.sf.antelope.type.v1.Block;
    }

    return this.firehoseClient;
  }
}

/** Instância singleton para uso comum. */
export const contractEventClient = new ContractEventClient();
