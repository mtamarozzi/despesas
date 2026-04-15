#!/usr/bin/env bash
# Smoke tests para whatsapp-webhook.
#
# Requer as variáveis:
#   FUNCTION_URL            URL da Edge Function (local ou prod)
#   EVOLUTION_WEBHOOK_TOKEN  mesmo valor configurado no secret do Supabase
#
# Uso:
#   Local (supabase functions serve whatsapp-webhook):
#     FUNCTION_URL=http://localhost:54321/functions/v1/whatsapp-webhook \
#     EVOLUTION_WEBHOOK_TOKEN=<token> \
#     bash run.sh
#
#   Produção:
#     FUNCTION_URL=https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-webhook \
#     EVOLUTION_WEBHOOK_TOKEN=<token> \
#     bash run.sh

set -uo pipefail

cd "$(dirname "$0")"

: "${FUNCTION_URL:?precisa exportar FUNCTION_URL}"
: "${EVOLUTION_WEBHOOK_TOKEN:?precisa exportar EVOLUTION_WEBHOOK_TOKEN}"

RUN_ID="$(date +%s)"
PASS=0
FAIL=0

# IDs únicos por execução evitam bloqueio pela idempotência (whatsapp_messages_seen).
render() {
  local input="$1"
  local placeholder="$2"
  local value="${placeholder}_${RUN_ID}"
  sed "s/${placeholder}/${value}/" "$input"
}

expect() {
  local label="$1"
  local expected="$2"
  local got="$3"
  if [[ "$got" == "$expected" ]]; then
    echo "  ✅ $label  [HTTP $got]"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label  [esperado $expected, recebido $got]"
    FAIL=$((FAIL + 1))
  fi
}

post() {
  local body="$1"
  local auth_header="$2"
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -H "$auth_header" \
    --data "$body"
}

echo "=== TESTES OFFLINE (não requerem Gemini) ==="

echo
echo "[1/5] Token inválido → 401"
body="$(render fixtures/from-me.json MSG_FROMME_REPLACE)"
got="$(post "$body" "Authorization: Bearer token_errado_proposital")"
expect "rejeita Bearer inválido" "401" "$got"

echo
echo "[2/5] fromMe=true → 200 (ignora silenciosamente)"
body="$(render fixtures/from-me.json MSG_FROMME_REPLACE)"
got="$(post "$body" "Authorization: Bearer ${EVOLUTION_WEBHOOK_TOKEN}")"
expect "ignora mensagem própria" "200" "$got"

echo
echo "[3/5] Número não autorizado → 200 (responde bloqueio, não processa)"
body="$(render fixtures/unauthorized.json MSG_UNAUTH_REPLACE)"
got="$(post "$body" "Authorization: Bearer ${EVOLUTION_WEBHOOK_TOKEN}")"
expect "responde número não autorizado" "200" "$got"

echo
echo "=== TESTES FULL FLOW (requerem GEMINI_API_KEY + EVOLUTION_API_KEY ativos) ==="

echo
echo "[4/5] Mensagem clara: 'paguei 120 de luz hoje' → insere em expenses + confirma"
body="$(render fixtures/clear-expense.json MSG_EXPENSE_REPLACE)"
got="$(post "$body" "Authorization: Bearer ${EVOLUTION_WEBHOOK_TOKEN}")"
expect "processa despesa clara" "200" "$got"
echo "  → Verifica no banco: SELECT * FROM expenses WHERE added_by_name LIKE '% (WhatsApp)' ORDER BY created_at DESC LIMIT 1;"

echo
echo "[5/5] Mensagem ambígua 'gastei 80' → grava whatsapp_context + pergunta"
body="$(render fixtures/ambiguous.json MSG_AMBIG_REPLACE)"
got="$(post "$body" "Authorization: Bearer ${EVOLUTION_WEBHOOK_TOKEN}")"
expect "grava contexto pendente" "200" "$got"
echo "  → Verifica no banco: SELECT phone_number, question, expires_at FROM whatsapp_context WHERE phone_number='5514998885355';"

echo
echo "[5b/5] Follow-up 'foi mercado' → completa e insere despesa"
sleep 2
body="$(render fixtures/ambiguous-followup.json MSG_AMBIG_FOLLOW_REPLACE)"
got="$(post "$body" "Authorization: Bearer ${EVOLUTION_WEBHOOK_TOKEN}")"
expect "completa clarificação" "200" "$got"

echo
echo "=============================="
echo "Resultado: $PASS passou, $FAIL falhou"
echo "=============================="
[[ $FAIL -eq 0 ]] || exit 1
