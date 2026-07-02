// apps/frontend/src/utils/explorerStore.ts
// Gerenciamento local do explorer_url com persistência em localStorage.
// Use em UserSettingsPage e em links "Ver no explorador".

const STORAGE_KEY = 'cb_explorer_url';

export interface ExplorerPreset {
  url: string;
  label: string;
  network: 'testnet' | 'mainnet';
}

export const EXPLORER_PRESETS: ExplorerPreset[] = [
  { url: 'https://testnet.wax.bloks.io',             label: 'Bloks (testnet)',          network: 'testnet' },
  { url: 'https://wax-testnet.eosq.eosnation.io',     label: 'EOSQ (testnet)',           network: 'testnet' },
  { url: 'https://wax.bloks.io',                      label: 'Bloks (mainnet)',          network: 'mainnet' },
  { url: 'https://wax.eosq.eosnation.io',             label: 'EOSQ (mainnet)',           network: 'mainnet' },
  { url: 'https://explorer.wax.io',                   label: 'WAX Explorer (mainnet)',    network: 'mainnet' },
];

export function getSelectedExplorerUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function getEffectiveExplorerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || EXPLORER_PRESETS[0].url;
}

export function setSelectedExplorerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
}

export function clearSelectedExplorerUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}
