# ADR-044: Migração Cosmos DB para Throughput Compartilhado

**Status:** Aceito (2026-07-06)
**Data:** 2026-07-06

---

## Problema

O Cosmos DB MongoDB `cryptobingo-mongo` (free tier, 1000 RU/s) tinha 14 collections
cada uma com **400 RU/s dedicados** (throughput provisionado por collection). Isso
consumia 5600 RU/s no total, excedendo os 1000 RU/s do free tier, gerando
cobrança de ~R$45,92/mês desnecessária.

Além disso, o database chamava-se `test` (nome genérico) e a MONGO_URL nos
Container Apps usava `/test` como database.

## Decisão

1. **Criar novo database `cryptobingo`** com throughput compartilhado (400 RU/s
   no database, coberto pelo free tier).
2. **Migrar dados de configuração** (systemtokens, gametypemetadatas,
   roommetadatas, sponsororgs) do MongoDB local (`bingo_mongodb`) para o Cosmos
   DB via mongodump/mongorestore.
3. **Deletar database `test`** (14 collections, sem throughput reservado).
4. **Atualizar MONGO_URL** nos Container Apps (`api-gateway`, `worker-game-loop`)
   para apontar para `cryptobingo` database.
5. **Firewall:** habilitar `networkAclBypass=AzureServices` para permitir tráfego
   dos Container Apps pelo backbone Azure.

### Collections e dados

| Collection | Docs | Origem | Nota |
|---|---|---|---|
| systemtokens | 2 | Restaurado dev | BINGO + WAX |
| gametypemetadatas | 7 | Restaurado dev | Game types 1-5, 8, 9 |
| roommetadatas | 21 | Restaurado dev | Salas configuradas |
| sponsororgs | 1 | Restaurado dev | Sponsor test |
| userprofiles | 0 | Perdido | Recriado no login |
| Demais | 0 | Novo | Populam naturalmente |

### Por que não Private Link

Private Link adicionaria ~$7-10/mês por endpoint + complexidade de VNet
injection nos Container Apps. Para testnet free tier, `networkAclBypass` é
suficiente — o tráfego permanece no backbone Azure.

## Consequências

Positivas:
- Custo MongoDB: R$45,92/mês → $0 (free tier)
- Database com nome significativo (`cryptobingo`)
- Firewall ativo (Azure services bypass)
- MONGO_URL padronizado com `serverSelectionTimeoutMS=60000` (evita timeout
  em cold start)

Negativas:
- `userprofiles` (~509 docs) perdidos — recriados no próximo login dos usuários
- Dados transacionais (prizetxes, buyintxes) zerados — perda aceitável para
  testnet
- Backup periódico não restaurado (Cosmos DB backup automático em 4h intervalo,
  8h retenção; restore requer suporte Azure)

Neutras:
- Threshold compartilhado de 400 RU/s significa que picos em uma collection
  podem throttlear as demais (aceitável para testnet de baixo volume)
- Monitorar `CosmosDbRequestCharge` no App Insights para garantir que não
  excede o throughput compartilhado
