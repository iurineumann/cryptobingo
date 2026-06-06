const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
    testEnvironment: "node",
    transform: {
        ...tsJestTransformCfg,
    },
    testMatch: ['<rootDir>/tests/**/*.ts'],
    setupFiles: ["./jest.setup.js"],
    moduleNameMapper: {
        '^@cryptobingo/blockchain-core$': '<rootDir>/../../packages/blockchain-core/src/index.ts',
        '^@cryptobingo/shared-types$':    '<rootDir>/../../packages/shared-types/src/index.ts',
    },
};
