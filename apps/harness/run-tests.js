#!/usr/bin/env node
// Wrapper que ignora os testes E2E quando o ambiente WAX não está rodando.
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.waxdev.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../worker-game-loop/.env') });

if (!process.env.EOSIO_KEY || !process.env.JOGADOR1_KEY) {
    console.log('\n⚠️  [harness] WAX env vars ausentes — testes E2E ignorados (rode com docker WAX).\n');
    process.exit(0);
}

const jest = path.resolve(__dirname, 'node_modules/.bin/jest');
try {
    execFileSync(jest, ['tests/fsm.test.ts', 'tests/xp-progression.test.ts'], { stdio: 'inherit' });
} catch (e) {
    process.exit(e.status ?? 1);
}
