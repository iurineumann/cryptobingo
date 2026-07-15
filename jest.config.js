const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // Resolução source-first: prefere .ts/.tsx a artefatos .js emitidos por builds
  // anteriores (evita que o jest carregue código stale — ver bug goldenball 2026-07).
  moduleFileExtensions: ["ts", "tsx", "js", "mjs", "cjs", "jsx", "json", "node"],
  // Mapeia imports com .js para o arquivo .ts correspondente (ts-jest padrão).
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    ...tsJestTransformCfg,
  },
};