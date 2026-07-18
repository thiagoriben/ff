# Reenvia sale.approved pra LowTrack das 3 vendas que caíram em cold start.
# Usa /api/admin/force-approve.js (atualizado pra aceitar customerUtm e customerItems).

$ErrorActionPreference = "Stop"
$baseUrl = "https://9anosdefreefire.site"
$adminToken = "adm_9anos_ff_2026_secret"

# Helper: parseia string UTM crua ("utm_source=FB&utm_medium=...") em hashtable.
function Parse-Utm ([string]$utm) {
  if (-not $utm) { return @{} }
  $obj = @{}
  $parts = $utm.Replace('?', '').Split('&')
  foreach ($p in $parts) {
    $kv = $p.Split('=', 2)
    if ($kv.Length -eq 2) {
      try { $obj[$kv[0]] = [uri]::UnescapeDataString($kv[1]) } catch {}
    }
  }
  return $obj
}

$sales = @(
  @{
    transactionId = "ed050276-d390-4681-bd86-4fb9313f2bc4"
    name = "almeida.adryandridri"
    email = "almeida.adryandridri@gmail.com"
    phone = "55349920079"
    document = "25747510860"
    totalCents = 2899
    utmRaw = "utm_source=FB&utm_medium=%7B%7Badset.name%7D%7D%7C%7B%7Badset.id%7D%7D&utm_campaign=%7B%7Bcampaign.name%7D%7D%7C%7B%7Bcampaign.id%7D%7D&utm_content=%7B%7Bad.name%7D%7D%7C%7B%7Bad.id%7D%7D&utm_term=%7B%7Bplacement%7D%7D&utm_id=120251597038810668&fbclid=PAdGRleATIbVZwZG9mAmZkaWQWUKp-Kt4f5KdhEw4pu84C5YEBXXYZBmV4dG4DYWVtATAAYWRpZAGrODDK6sp8c3J0YwZhcHBfaWQPMTI0MDI0NTc0Mjg3NDE0AAGnaK065nmGwoNTnoXZuSI3lEp2ATP6t0EBbGRmj19Cf65lfEGB8IC0qjavUrE_aem_urdoO8CQi1QtrzisxPd7Eg&utm_city=Ashburn&utm_state=VA&utm_zipcode=20149&utm_country=US"
  },
  @{
    transactionId = "5ace023c-8d9c-4f8e-94ea-5919120a4590"
    name = "keniodosreis"
    email = "keniodosreis@gmail.com"
    phone = "69999438862"
    document = "01533536279"
    totalCents = 2899
    utmRaw = "utm_source=FB&utm_medium=Novo%20conjunto%20de%20an%C3%BAncios%20de%20Vendas%7C120251621320380668&utm_campaign=%F0%9F%94%A5%20ad%202%20vid%20ff%20%E2%80%94%20C%C3%B3pia%7C120251621320300668&utm_content=Novo%20an%C3%BAncio%20de%20Vendas%7C120251621320390668&utm_term=Instagram_Reels&utm_id=120251621320300668&fbclid=PAZXh0bgNhZW0BMABhZGlkAas4N-7wbHxzcnRjBmFwcF9pZA81NjcwNjczNDMzNTI0MjcAAaejsFKIxD0KbBXmddfcKkASHUxt8WwSGXr2s7b0gd9CQbBuSmpee6mhrsFCpw_aem_srfb5MAmx9GOso-etrGVHA&utm_city=Ashburn&utm_state=VA&utm_zipcode=20149&utm_country=US"
  },
  @{
    transactionId = "90090324-096c-4e85-84da-4e2b7cf1fb5b"
    name = "fa357315"
    email = "fa357315@gmail.com"
    phone = "55459916158"
    document = "52998224725"
    totalCents = 5499
    utmRaw = "utm_source=FB&utm_medium=Novo%20conjunto%20de%20an%C3%BAncios%20de%20Vendas%7C120251598857940668&utm_campaign=ad%203%20vid%20ff%7C120251598857920668&utm_content=Novo%20an%C3%BAncio%20de%20Vendas%7C120251598857930668&utm_term=Instagram_Reels&utm_id=120251598857920668&fbclid=PAZXh0bgNhZW0BMABhZGlkAas4N-7mqHxzcnRjBmFwcF9pZA81NjcwNjczNDMzNTI0MjcAAafUKIlCCWJOHnCGN7f2sxH9zzPIKCHRHqtW4VfagF2boaELJYUD-tx0ttJdjw_aem_aScJxx_34q2FbgqHTp3zXQ&utm_city=Ashburn&utm_state=VA&utm_zipcode=20149&utm_country=US"
  }
)

$results = @()
foreach ($s in $sales) {
  $priceBRL = [decimal]($s.totalCents / 100)
  $item = @{
    id = 1
    title = "Pedido Free Fire ($priceBRL)"
    name = "Pedido Free Fire ($priceBRL)"
    price = $s.totalCents
    qty = 1
  }

  $body = @{
    transactionIds = @($s.transactionId)
    customerName = $s.name
    customerEmail = $s.email
    customerPhone = $s.phone
    customerDocument = $s.document
    totalCents = $s.totalCents
    customerItems = @($item)
    customerUtm = (Parse-Utm $s.utmRaw)
    customerUserAgent = "Mozilla/5.0 (admin-force-approve)"
  } | ConvertTo-Json -Depth 8 -Compress

  Write-Host "===> $($s.transactionId) | R$ $($s.totalCents/100)" -ForegroundColor Cyan
  try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/admin/force-approve" -Method POST `
      -Headers @{ "x-admin-token" = $adminToken; "Content-Type" = "application/json" } `
      -Body $body -TimeoutSec 30 -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode) -ForegroundColor Green
    Write-Host ("Body:   " + $r.Content)
    $results += [PSCustomObject]@{ id = $s.transactionId; http = $r.StatusCode; body = $r.Content }
  } catch {
    $errBody = ""
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errBody = $reader.ReadToEnd()
    }
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host ("Body: " + $errBody) -ForegroundColor Red
    $results += [PSCustomObject]@{ id = $s.transactionId; http = "ERR"; body = $_.Exception.Message }
  }
  Start-Sleep -Seconds 1
}

Write-Host "`n=== RESUMO ===" -ForegroundColor Yellow
$results | ForEach-Object {
  $color = if ($_.http -eq "200") { "Green" } else { "Red" }
  Write-Host (" - {0,-40} HTTP {1}" -f $_.id, $_.http) -ForegroundColor $color
}
