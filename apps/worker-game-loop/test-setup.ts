// test-setup.ts — definidas ANTES dos imports de módulos do worker
// (jest setupFiles roda antes de qualquer código de produção).
//
// O src/services/blockchain.ts faz `throw` no load se faltar
// MICROSERVICE_PRIVATE_KEY / CHAIN_ID (validação de runtime correta).
// Em teste, injetamos valores fake para que os módulos que importam
// blockchain.ts possam ser carregados sem quebrar o suite.
process.env.MICROSERVICE_PRIVATE_KEY =
  process.env.MICROSERVICE_PRIVATE_KEY || '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyDt1joz1o7o';
process.env.CHAIN_ID =
  process.env.CHAIN_ID || 'f16b1a3c9d550c6e7e2c1a8b3b9f0e8d7c6b5a49382716054f3b7e1c8a2d4e6f';
process.env.RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
process.env.CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
