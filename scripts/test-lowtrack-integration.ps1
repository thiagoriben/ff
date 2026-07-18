$ErrorActionPreference = "Stop"

$base = 'https://aniversario9anos-ff.vercel.app'

# === Teste 1 — Gera PIX (cobre sale.pending) ===
Write-Host ""
Write-Host "==== Teste 1: Gerar PIX (sale.pending) ====" -ForegroundColor Cyan

$body = @'
{
  "email": "teste.lowtrack.ff9@gmail.com",
  "name": "Thiago Ribeiro Teste LowTrack",
  "phone": "11988887777",
  "document": "12345678901",
  "items": [
    { "id": 1, "name": "Diamantes Free Fire", "price": 499, "qty": 1 }
  ],
  "totalCents": 499,
  "utm": {
    "utm_source": "meta",
    "utm_medium": "cpc",
    "utm_campaign": "ff9anos_lowtrack_test",
    "utm_content": "criativo_teste",
    "utm_term": "freefire",
    "fbclid": "IwAR_lowtrack_teste_PIX_abc"
  }
}
'@

try {
    $r1 = Invoke-WebRequest -Uri "$base/api/pix/create" -Method POST -Headers @{'Content-Type'='application/json'} -Body $body -TimeoutSec 30 -UseBasicParsing
    Write-Host ("Status: " + [int]$r1.StatusCode)
    Write-Host ("Body:   " + $r1.Content)
    $tx = ($r1.Content | ConvertFrom-Json).transactionId
    Write-Host ("TX gerado: $tx") -ForegroundColor Yellow
} catch {
    Write-Host ("ERRO Teste 1: " + $_.Exception.Message) -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host ("Body: " + $reader.ReadToEnd())
    }
    exit 1
}

Start-Sleep -Seconds 2

# === Teste 2 — Simula webhook PAID com dados completos do cliente ===
Write-Host ""
Write-Host "==== Teste 2: Webhook PAID (sale.approved) ====" -ForegroundColor Cyan

$payload2 = @{
    event = 'transaction.paid'
    transactionId = $tx
    status = 'PAID'
    amount = 499
    customer = @{
        name = 'Thiago Ribeiro Teste LowTrack'
        email = 'teste.lowtrack.ff9@gmail.com'
        phone = '5511988887777'
        document = '12345678901'
    }
    utm = @{
        utm_source = 'meta'
        utm_medium = 'cpc'
        utm_campaign = 'ff9anos_lowtrack_test'
        utm_content = 'criativo_teste'
        utm_term = 'freefire'
    }
} | ConvertTo-Json -Depth 10

try {
    $r2 = Invoke-WebRequest -Uri "$base/api/pix/webhook" -Method POST -Headers @{'Content-Type'='application/json'} -Body $payload2 -TimeoutSec 30 -UseBasicParsing
    Write-Host ("Status: " + [int]$r2.StatusCode)
    Write-Host ("Body:   " + $r2.Content)
} catch {
    Write-Host ("ERRO Teste 2: " + $_.Exception.Message) -ForegroundColor Red
}

Start-Sleep -Seconds 2

# === Teste 3 — Webhook com ID fake (sem venda no storage) ===
Write-Host ""
Write-Host "==== Teste 3: Webhook FAKE ID (sale.approved sem storage) ====" -ForegroundColor Cyan

$payload3 = @{
    event = 'transaction.paid'
    transactionId = 'TXN-FAKE-LOOP-9999'
    status = 'PAID'
    amount = 4990
    customer = @{
        name = 'Cliente Fake Test'
        email = 'fake.test@example.com'
        phone = '5511999999999'
        document = '11111111111'
    }
    utm = @{ utm_source = 'meta'; utm_campaign = 'teste_orphan' }
} | ConvertTo-Json

try {
    $r3 = Invoke-WebRequest -Uri "$base/api/pix/webhook" -Method POST -Headers @{'Content-Type'='application/json'} -Body $payload3 -TimeoutSec 30 -UseBasicParsing
    Write-Host ("Status: " + [int]$r3.StatusCode)
    Write-Host ("Body:   " + $r3.Content)
} catch {
    Write-Host ("ERRO Teste 3: " + $_.Exception.Message) -ForegroundColor Red
}

Start-Sleep -Seconds 2

# === Teste 4 — Status polling ===
Write-Host ""
Write-Host "==== Teste 4: Status polling ====" -ForegroundColor Cyan
try {
    $r4 = Invoke-WebRequest -Uri "$base/api/pix/status/$tx" -Method GET -TimeoutSec 15 -UseBasicParsing
    Write-Host ("Status: " + [int]$r4.StatusCode)
    Write-Host ("Body:   " + $r4.Content)
} catch {
    Write-Host ("ERRO Teste 4: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Aguardando 8s pra waitUntil concluir ====" -ForegroundColor Cyan
Start-Sleep -Seconds 8

Write-Host ""
Write-Host "==== Conferir painel LowTrack: https://lowtrack.com.br/vendas ====" -ForegroundColor Green
Write-Host "   - TX real ($tx) deve ter sale.pending + sale.approved" -ForegroundColor Green
Write-Host "   - TXN-FAKE-LOOP-9999 deve ter sale.approved (sem storage)" -ForegroundColor Green