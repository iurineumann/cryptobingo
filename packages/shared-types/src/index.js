"use strict";
// packages/shared-types/src/index.ts
// Fonte única de verdade para tipagem cross-package do CryptoBingo.
// REGRA: qualquer alteração no bingo.hpp deve ser espelhada aqui na mesma sprint.
// Ref: PROJECT-DETAILS.md §9 (Sincronia de Tipagem)
Object.defineProperty(exports, "__esModule", { value: true });
/** Janela de funding (segundos) — tempo máximo de venda antes do lock. Compartilhado worker/frontend. */
exports.FUNDING_WINDOW_SEC = 60;
//# sourceMappingURL=index.js.map