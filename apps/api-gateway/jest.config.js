// jest.config.js — prioriza .ts sobre .js compilados presentes em src/
// (artefatos de build stale fazem o jest resolver rbac.js em vez de rbac.ts).
/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    },
    moduleNameMapper: {
        '^@cryptobingo/shared-types$': '<rootDir>/../shared-types/src/index.ts',
    },
};
