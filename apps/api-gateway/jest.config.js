const base = require('../../jest.config.js');
module.exports = {
    ...base,
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts',
        '!src/database/migrations/**',
        '!src/**/*.d.ts',
    ],
    coverageThreshold: {
        global: { branches: 60, functions: 70, lines: 70, statements: 70 },
    },
};
