// Presença efêmera (in-memory) por sala, contada por WALLET.
// Multi-socket da mesma wallet (abas/dispositivos) conta uma vez —
// guardamos a contagem de sockets por wallet e só removemos em 0.
export interface PresenceStore {
  add(roomId: string, wallet: string): void;
  remove(roomId: string, wallet: string): void;
  count(roomId: string): number;
}

export function createPresenceStore(): PresenceStore {
  const rooms = new Map<string, Map<string, number>>();

  return {
    add(roomId, wallet) {
      let wallets = rooms.get(roomId);
      if (!wallets) { wallets = new Map(); rooms.set(roomId, wallets); }
      wallets.set(wallet, (wallets.get(wallet) ?? 0) + 1);
    },
    remove(roomId, wallet) {
      const wallets = rooms.get(roomId);
      if (!wallets) return;
      const n = wallets.get(wallet);
      if (n === undefined) return;
      if (n <= 1) wallets.delete(wallet);
      else wallets.set(wallet, n - 1);
      // limpa sala vazia para evitar leak de memória
      if (wallets.size === 0) rooms.delete(roomId);
    },
    count(roomId) {
      return rooms.get(roomId)?.size ?? 0;
    },
  };
}
