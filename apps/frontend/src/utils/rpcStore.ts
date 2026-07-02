const STORAGE_KEY = 'cb_rpc_url';

export interface RpcPreset {
  url: string;
  label: string;
  network: 'testnet' | 'mainnet';
}

export const RPC_PRESETS: RpcPreset[] = [
  { url: 'https://waxtestnet.greymass.com',      label: 'Greymass (testnet)',          network: 'testnet' },
  { url: 'https://wax-testnet.eosphere.io',       label: 'Eosphere (testnet)',          network: 'testnet' },
  { url: 'https://testnet.waxsweden.org',         label: 'WaxSweden (testnet)',         network: 'testnet' },
  { url: 'https://testnet.wax.eosusa.io',         label: 'EOSUSA (testnet)',             network: 'testnet' },
];

export function getEffectiveRpcUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_RPC_URL || 'https://waxtestnet.greymass.com';
}

export function setSelectedRpcUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
}

export function getSelectedRpcUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearSelectedRpcUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}
