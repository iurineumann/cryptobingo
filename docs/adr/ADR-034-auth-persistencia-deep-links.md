# ADR-034 — Persistência JWT + Re-auth Silencioso para Deep Links

**Status:** Proposto
**Data:** 2026-06-26

---

## Problema

Usuários com sessão Wharfkit ativa não conseguem acessar deep links (URLs diretas como `/lobby`,
`/wallet`, `/history`) ao abrir nova aba ou após expiração do JWT. São redirecionados à LandingPage
mesmo com carteira conectada.

### Causas

1. **JWT em sessionStorage (`api.ts:5`):** `sessionStorage` é por aba. Nova aba → JWT ausente →
   `getAuthToken()` retorna null → condição `restored && getAuthToken()` em `App.tsx:259` falha
   mesmo com Wharfkit restaurado.

2. **JWT expirado sem fallback:** Se JWT expira, `loadProfile()` lança 401, `profile` fica null,
   `AuthGuard` redireciona para `/`. Não há tentativa de re-autenticar com a sessão Wharfkit
   já restaurada.

### Efeito observado

| Cenário | Comportamento atual |
|---|---|
| Bookmark → nova aba, sessão ativa | LandingPage (deveria ir direto) |
| Refresh F5 (mesma aba), JWT expirado | LandingPage (deveria re-autenticar) |
| Refresh F5, JWT válido | Spinner → rota (OK) |

## Decisão

Duas mudanças combinadas:

### 1. `sessionStorage` → `localStorage`

JWT passa a ser armazenado em `localStorage` em vez de `sessionStorage`. Persiste entre abas
e sessions do navegador até expirar ou o usuário fazer logout.

**Risco aceito:** JWT tem expiração inerente (configurada no api-gateway). Logout explícito
limpa o token. O ganho de UX (deep links funcionarem) supera o risco marginal.

### 2. Re-auth silencioso no restore

Quando `sessionKit.restore()` retorna sessão válida, dois caminhos de fallback:

- **JWT ausente** (nova aba): chama `authenticateSession(restored)` para obter JWT fresco
  via challenge-response com a carteira já conectada.
- **JWT expirado** (401 em `loadProfile`): limpa o JWT, chama `authenticateSession(restored)`.

`authenticateSession` já tem short-circuit `if (getAuthToken()) return true` — limpar o JWT
expirado antes de chamá-lo é essencial para evitar loop.

### Arquivos alterados

- `apps/frontend/src/services/api.ts` — `sessionStorage` → `localStorage` (3 ocorrências)
- `apps/frontend/src/App.tsx` — restore effect com fallback re-auth

## Consequências

### Positivas

- Deep links funcionam em nova aba sem login manual
- JWT expirado renova silenciosamente (usuário não percebe)
- Nenhuma mudança na API ou contratos
- 212/212 testes verdes, typecheck limpo

### Negativas

- `localStorage` persiste JWT além da aba (até expirar ou logout explícito)
- Re-auth adiciona latência no restore (~1-2s de challenge-response) — mitigado pelo spinner
  de `restoringSession` já existente

### Neutras

- `clearAuthToken` migra junto para `localStorage.removeItem`
- Nenhuma migração de dados necessária — JWTs antigos em sessionStorage são ignorados
  (expirariam naturalmente)

## Ref

- ADR-006: JWT + challenge-response
- ADR-015: Client-side routing
- Issue: #89
