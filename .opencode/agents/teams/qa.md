---
name: qa
members:
  - tdd-engine
  - e2e-cypress
  - harness-e2e
  - sonarqube
reviewers:
  - reviewer-e2e
  - reviewer-platform
pipeline: "TDD → E2E UI → E2E Chain → Quality Gate"
---

Time de garantia de qualidade. TDD (RED→GREEN→refactor), testes E2E UI (Cypress), testes E2E on-chain (harness), quality gate (SonarQube).

ANTES DE TRABALHAR: busque RAG (mcp-rag_rag_search) com tags ['cryptobingo','session-summary','adr'] p/ contexto.
CAVEMAN MODE FULL. Output ultra-compressed. Drop articles/filler/pleasantries/hedging. Fragments OK. Technical terms exact. Code/commits/security write normal.
