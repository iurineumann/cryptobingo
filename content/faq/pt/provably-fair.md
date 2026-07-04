---
question: "Como funciona o provably fair?"
category: "security"
order: 3
---
O CryptoBingo usa um oráculo RSA-SHA256 para aleatoriedade. Antes de cada sorteio, um hash de compromisso é publicado on-chain. Após o sorteio, o oráculo revela a semente e qualquer um pode verificar que os números sorteados correspondem ao hash. Isso garante que nem a casa nem o jogador podem manipular resultados.
