# Configura o webhook da instância "casaflow" na Evolution API para apontar
# para a Edge Function whatsapp-webhook no Supabase.
#
# Uso:
#   .\scripts\configure-webhook.ps1
#
# Prompts interativos pedem apenas:
#   - EVOLUTION_API_KEY       (o AUTHENTICATION_API_KEY do container Evolution)
#   - EVOLUTION_WEBHOOK_TOKEN (o mesmo valor do secret no Supabase)
#
# As chaves NÃO são persistidas em disco nem em variáveis globais depois do término.

$ErrorActionPreference = "Stop"

$EvolutionBaseUrl = "https://evolution-evolution-api.u9givm.easypanel.host"
$EvolutionInstance = "casaflow"
$WebhookUrl = "https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-webhook"

Write-Host ""
Write-Host "=== Configuração do webhook Evolution -> Supabase ===" -ForegroundColor Cyan
Write-Host "Instância: $EvolutionInstance"
Write-Host "URL alvo:  $WebhookUrl"
Write-Host ""

# --- 1. coleta da apikey da Evolution ---
$evoKey = Read-Host "1) Cole a EVOLUTION_API_KEY e pressione Enter"
$evoKey = $evoKey.Trim()
if ([string]::IsNullOrWhiteSpace($evoKey)) {
  Write-Host "ERRO: chave vazia. Abortando." -ForegroundColor Red
  exit 1
}
Write-Host ("   Recebido: {0} caracteres, terminando em ...{1}" -f $evoKey.Length, $evoKey.Substring([math]::Max(0, $evoKey.Length - 4)))

# --- 2. valida a apikey antes de prosseguir ---
Write-Host ""
Write-Host "2) Validando apikey contra a Evolution..." -ForegroundColor Yellow
try {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$EvolutionBaseUrl/instance/fetchInstances?instanceName=$EvolutionInstance" `
    -Headers @{ apikey = $evoKey } | Out-Null
  Write-Host "   [OK] apikey aceita." -ForegroundColor Green
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  Write-Host "   [ERRO] Evolution rejeitou a apikey (HTTP $code). Abortando sem configurar webhook." -ForegroundColor Red
  exit 1
}

# --- 3. coleta do webhook token ---
Write-Host ""
$webhookToken = Read-Host "3) Cole o EVOLUTION_WEBHOOK_TOKEN (mesmo secret do Supabase) e Enter"
$webhookToken = $webhookToken.Trim()
if ([string]::IsNullOrWhiteSpace($webhookToken)) {
  Write-Host "ERRO: token vazio. Abortando." -ForegroundColor Red
  exit 1
}
Write-Host ("   Recebido: {0} caracteres, terminando em ...{1}" -f $webhookToken.Length, $webhookToken.Substring([math]::Max(0, $webhookToken.Length - 4)))

# --- 4. monta o JSON evitando here-strings e concatenação manual ---
$payload = @{
  webhook = @{
    enabled  = $true
    url      = $WebhookUrl
    headers  = @{ Authorization = "Bearer $webhookToken" }
    byEvents = $false
    events   = @("MESSAGES_UPSERT")
  }
}
$bodyJson = $payload | ConvertTo-Json -Depth 6 -Compress

# --- 5. configura o webhook ---
Write-Host ""
Write-Host "4) Configurando webhook na Evolution..." -ForegroundColor Yellow
try {
  $resp = Invoke-RestMethod `
    -Method POST `
    -Uri "$EvolutionBaseUrl/webhook/set/$EvolutionInstance" `
    -Headers @{ apikey = $evoKey; "Content-Type" = "application/json" } `
    -Body $bodyJson
  Write-Host "   [OK] Webhook configurado." -ForegroundColor Green
  Write-Host ""
  Write-Host "Resposta da Evolution:" -ForegroundColor Cyan
  $resp | ConvertTo-Json -Depth 6
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  Write-Host "   [ERRO] Falha ao configurar webhook (HTTP $code)." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

# --- 6. limpeza defensiva ---
Remove-Variable -Name evoKey, webhookToken, bodyJson, payload -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Tudo certo. Próximo passo: envie uma mensagem WhatsApp teste." -ForegroundColor Green
Write-Host "Ex: 'paguei 120 de luz hoje' -> deve voltar '[OK] R$ 120,00 em Habitacao registrado (conta de luz)'"
