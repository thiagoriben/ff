$ErrorActionPreference = "Stop"
$base = 'https://aniversario9anos-ff.vercel.app'

# URL típica de clique do Meta Ads com macros {{...}}
$testUrl = "$base/?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}&fbclid=IwAR_teste_123"

Write-Host "==== URL de entrada (simulando clique do Meta Ads) ====" -ForegroundColor Cyan
Write-Host $testUrl
Write-Host ""

Write-Host "==== Teste 1: Landing page (quiz) carrega UTMs ====" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri $testUrl -Method GET -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    if ($r.Content -match 'utm-flow\.js') { Write-Host "OK: utm-flow.js referenciado" -ForegroundColor Green } else { Write-Host "FALTA: utm-flow.js" -ForegroundColor Red }
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Teste 2: Loja (/ff/index.html) recebe UTMs intactas ====" -ForegroundColor Cyan
$lojaUrl = "$base/ff/index.html?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}&fbclid=IwAR_teste_123"
try {
    $r = Invoke-WebRequest -Uri $lojaUrl -Method GET -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    if ($r.Content -match 'utm-flow\.js') { Write-Host "OK: utm-flow.js referenciado" -ForegroundColor Green } else { Write-Host "FALTA: utm-flow.js" -ForegroundColor Red }
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Teste 3: Página de logado recebe UTMs intactas ====" -ForegroundColor Cyan
$logadoUrl = "$base/ff/logado.html?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}&fbclid=IwAR_teste_123"
try {
    $r = Invoke-WebRequest -Uri $logadoUrl -Method GET -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    if ($r.Content -match 'utm-flow\.js') { Write-Host "OK: utm-flow.js referenciado" -ForegroundColor Green } else { Write-Host "FALTA: utm-flow.js" -ForegroundColor Red }
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Teste 4: Checkout parte1 recebe UTMs intactas ====" -ForegroundColor Cyan
$parte1Url = "$base/ff/pay/parte1.html?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}&fbclid=IwAR_teste_123"
try {
    $r = Invoke-WebRequest -Uri $parte1Url -Method GET -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    if ($r.Content -match 'utm-flow\.js') { Write-Host "OK: utm-flow.js referenciado" -ForegroundColor Green } else { Write-Host "FALTA: utm-flow.js" -ForegroundColor Red }
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Teste 5: Verifica se o utm-flow.js ta servivel ====" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$base/js/utm-flow.js" -Method GET -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    Write-Host ("Tamanho: " + $r.RawContentLength + " bytes")
    if ($r.Content -match 'TRACKING_KEYS') { Write-Host "OK: utm-flow.js servido corretamente" -ForegroundColor Green }
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "==== Resultado esperado (manual): ====" -ForegroundColor Green
Write-Host "1. Abrir $base/?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}..." -ForegroundColor Green
Write-Host "2. Terminar o quiz → redireciona pra /ff/index.html" -ForegroundColor Green
Write-Host "3. Conferir URL da loja: deve ter TODOS os params UTM_*, fbclid, com pipes intactos" -ForegroundColor Green
Write-Host "4. Logar com ID → vai pra /ff/logado.html (UTMs mantidas)" -ForegroundColor Green
Write-Host "5. Clicar Compre agora → vai pra /ff/pay/parte1.html (UTMs mantidas)" -ForegroundColor Green
Write-Host "6. Preencher email+telefone → vai pra /ff/pay/parte2.html (UTMs mantidas)" -ForegroundColor Green
Write-Host "7. Conferir no painel LowTrack se a venda tem todas as UTMs + tracking intacto" -ForegroundColor Green