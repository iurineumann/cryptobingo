---
question: "How does provably fair work?"
category: "security"
order: 3
---
CryptoBingo uses an RSA-SHA256 oracle for randomness. Before each draw, a commitment hash is published on-chain. After the draw, the oracle reveals the seed, and anyone can verify that the drawn numbers match the committed hash. This ensures neither the house nor the player can manipulate results.
