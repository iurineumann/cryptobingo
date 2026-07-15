const base = require('../../jest.config.js');
module.exports = {
    ...base,
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    setupFiles: ['<rootDir>/test-setup.ts'],
    moduleNameMapper: {
        '^\\./blockchain$': '<rootDir>/src/services/blockchain.stub.ts',
        '^@cryptobingo/blockchain-core$': '<rootDir>/../../packages/blockchain-core/src/index.ts',
        '^@cryptobingo/shared-types$': '<rootDir>/../shared-types/src/index.ts',
    },
    collectCoverageFrom: [
        'src/services/**/*.ts',
        '!src/**/*.d.ts',
    ],
    coverageThreshold: {
        global: { branches: 60, functions: 70, lines: 70, statements: 70 },
    },
};
