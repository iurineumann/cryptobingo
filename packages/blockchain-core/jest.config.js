// apps/blockchain-core jest config — estende o preset ts-jest da raiz.
// O pacote tinha testes .ts (contractEventClient.test.ts, client.test.ts)
// mas NUNCA teve jest.config → o jest default (Babel) não transforma TS
// e falhava com "Unexpected reserved word 'interface'".
// Fix 2026-07-31: config mínima no padrão do repo (worker/harness/api-gateway).

const base = require('../../jest.config.js');

module.exports = {
    ...base,
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^@cryptobingo/shared-types$': '<rootDir>/../shared-types/src/index.ts',
    },
};
