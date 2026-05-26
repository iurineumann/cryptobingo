# ADR-006: Autenticação JWT por Assinatura Criptográfica de Carteira Antelope

## Status
Aceito

## Data
2026-05-25

## Contexto
O `api-gateway` precisava de um mecanismo de autenticação que não dependesse de senhas
(incompatível com Web3) e que fosse resistente a replay attacks. A abordagem de usar o
endereço de wallet como identidade e a assinatura de uma mensagem como prova de posse
é o padrão estabelecido no ecossistema Antelope (WAX/EOS).

O desafio técnico central é: como verificar que o usuário realmente controla a chave
privada do wallet sem armazenar nenhuma credencial no servidor?

## Decisão

### Fluxo Challenge-Response em dois passos:

**Passo 1 — `POST /api/v1/auth/challenge`**
- O servidor gera um nonce de 256 bits (`crypto.randomBytes(32)`) e persiste no PostgreSQL
  com TTL de 5 minutos e chave composta `(wallet, nonce)`
- O nonce é entregue ao cliente junto com `expires_at`
- Housekeeping passivo: nonces expirados são purgados a cada nova requisição

**Passo 2 — `POST /api/v1/auth/verify`**
- O cliente assina `SHA256(nonce)` com a chave privada do wallet (permissão `active`)
- O servidor usa `Signature.recoverDigest(digest)` do `@wharfkit/antelope` para extrair
  a chave pública a partir da assinatura
- Compara com a `public_key` enviada pelo cliente
- Se válida: invalida o nonce (uso único — previne replay), emite JWT com prazo de 24h
- O JWT carrega apenas `{ wallet: string }` no payload

### Estrutura do JWT:
```json
{ "wallet": "jogador1", "iat": 1748185600, "exp": 1748272000 }
```

### Middleware `requireAuth`:
- Extrai token do header `Authorization: Bearer <token>`
- Valida com `jwt.verify()`, injeta `req.user.wallet` no Request
- Resposta 401 genérica (não vaza motivo: expirado vs. inválido)

## Consequências

### Positivas
- Sem senhas armazenadas no servidor
- Compatível com qualquer carteira Antelope (Anchor, Wombat, WAX Cloud Wallet)
- Nonce de uso único previne replay attacks
- TTL de 5 minutos limita a janela de exposição de nonces
- JWT stateless — escalável horizontalmente sem estado compartilhado

### Negativas / Riscos
- A verificação atual confia na `public_key` enviada pelo cliente sem confirmar que
  ela está na permissão `active` do wallet on-chain. Isso deve ser ativado em produção
  consultando `get_account` no nó RPC (código comentado no `authController.ts`)
- JWT sem revogação (stateless) — logout implica apenas descarte client-side do token
  até expirar naturalmente em 24h. Em produção: implementar blacklist via Redis

## Dívida Técnica Registrada
- `[DEBT]` Verificação on-chain da `public_key` contra permissão `active` comentada —
  ativar em produção via consulta `get_account` ao nó RPC
- `[DEBT]` Implementar blacklist de tokens revogados via Redis para logout instantâneo

## Referências
- `apps/api-gateway/src/middleware/auth.ts`
- `apps/api-gateway/src/controllers/authController.ts`
- `docs/openapi.yaml` — endpoints `/auth/challenge` e `/auth/verify`
- ADR-001 — assinatura contextual (padrão SHA256 + recover_key)
- ADR-002 — persistência poliglota (PostgreSQL para nonces)
