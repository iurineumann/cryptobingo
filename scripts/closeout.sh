#!/usr/bin/env bash
# closeout.sh — Encerramento pós-merge de PR
# Uso: ./scripts/closeout.sh <issue_number> [pr_number]
#
# Automatiza checklist de encerramento:
# 1. Fecha issue se ainda aberta (Closes automático falhou)
# 2. Verifica board status
# 3. Lista checklist manual p/ plano, ADR, CLAUDE.md, memory, skills

set -euo pipefail

ISSUE="${1:-}"
PR="${2:-}"

if [ -z "$ISSUE" ]; then
  echo "Uso: ./scripts/closeout.sh <issue_number> [pr_number]"
  echo "Ex.: ./scripts/closeout.sh 42        # detecta PR da branch atual"
  echo "     ./scripts/closeout.sh 42 123    # PR #123 explícito"
  exit 1
fi

if [ -z "$PR" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  PR=$(echo "$BRANCH" | sed -n 's/.*#\([0-9]*\)/\1/p' || echo "")
  [ -z "$PR" ] && PR="?" || PR="#$PR"
fi

echo "=== Encerramento Issue #$ISSUE (PR $PR) ==="
echo ""

# 1. Fechar issue se ainda aberta
STATE=$(gh issue view "$ISSUE" --json state --jq '.state' 2>/dev/null || echo "unknown")
if [ "$STATE" = "OPEN" ]; then
  gh issue close "$ISSUE" \
    --comment "Implementado via PR $PR. Fechamento automático via closeout.sh."
  echo "✅ Issue #$ISSUE fechada"
elif [ "$STATE" = "CLOSED" ]; then
  echo "⏭️  Issue #$ISSUE já estava fechada (Closes automático no merge)"
else
  echo "⚠️  Não foi possível verificar issue #$ISSUE (gh CLI disponível?)"
fi

echo ""

# 2. Verificar board
BOARD_ITEM=$(gh project item-list 4 --owner iurineumann --limit 100 --jq '.items[] | select(.content.number == '$ISSUE')' 2>/dev/null || echo "")
if [ -n "$BOARD_ITEM" ]; then
  echo "⚠️  Issue #$ISSUE ainda no board #4 — mover para Done manualmente se aplicável"
else
  echo "✅ Issue #$ISSUE não encontrada no board (pode já ter sido removida ou nunca adicionada)"
fi

echo ""
echo "=== Checklist manual (faça agora) ==="
echo "  [ ] Plano:     atualizar .opencode/plans/ com status"
echo "  [ ] ADR:       criar/atualizar se mudança estrutural"
echo "  [ ] CLAUDE.md:  atualizar se novo componente/flow"
echo "  [ ] Memory:    adicionar ao profile se feature duradoura"
echo "  [ ] Skills:    atualizar se novo padrão procedural"
echo "  [ ] Template PR: checklist de verificação pré-PR usado?"
echo ""

# 3. Sugerir próximo PR
echo "=== Recomendação ==="
echo "  Para evitar fechamento manual no futuro:"
echo "  - Inclua 'Closes #$ISSUE' no body do PR"
echo "  - Use o template .github/PULL_REQUEST_TEMPLATE.md"
echo "  - Verifique checklist de encerramento antes de merge"
