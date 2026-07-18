// blockchain.stub.ts — stub usado APENAS em testes (via jest moduleNameMapper).
// O blockchain.ts de produção cria Sessions on-chain no load do módulo
// (validação de env + WalletPluginPrivateKey), o que quebra o carregamento
// de módulos em ambiente de teste. Este stub fornece as mesmas assinaturas
// como no-ops para que os testes de lógica pura (evaluator, combinationEvaluator)
// possam carregar sem dependências de credenciais reais.

export const microserviceSession = {} as any;
export const adminSession = {} as any;

export async function executeSetAssetData(): Promise<string | undefined> {
    return undefined;
}
export async function executeRecordBurn(): Promise<string | undefined> {
    return undefined;
}
export async function executeFundGame(): Promise<string | undefined> {
    return undefined;
}
export async function executeLockGame(): Promise<string | undefined> {
    return undefined;
}
export async function executeStartDraw(): Promise<string | undefined> {
    return undefined;
}
export async function executeClaimWin(): Promise<string | undefined> {
    return undefined;
}
export async function executeClaimCombo(): Promise<string | undefined> {
    return undefined;
}
export async function executeClaimStage(): Promise<string | undefined> {
    return undefined;
}
export async function executeCloseGame(): Promise<string | undefined> {
    return undefined;
}
export async function executeAbortGame(): Promise<string | undefined> {
    return undefined;
}
export async function executeRefundTicket(): Promise<string | undefined> {
    return undefined;
}
export async function executeClearGame(): Promise<string | undefined> {
    return undefined;
}
