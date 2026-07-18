$ErrorActionPreference = "Stop"

Write-Host "==== Gerando PIX real no dominio novo ====" -ForegroundColor Cyan

$body = @'
{
  "email": "thiago.test.ff9@gmail.com",
  "name": "Thiago Ribeiro Teste",
  "phone": "11988887777",
  "document": "12345678901",
  "items": [
    { "id": 1, "name": "Diamantes Free Fire (100 + bonus)", "price": 499, "qty": 1 }
  ],
  "totalCents": 499,
  "utm": {
    "utm_source": "meta",
    "utm_medium": "cpc",
    "utm_campaign": "ff9anos_teste",
    "utm_content": "criativo_a",
    "utm_term": "freefire",
    "fbclid": "IwAR123abc_teste_PIX"
  }
}
'@

try {
    $r = Invoke-WebRequest -Uri 'https://aniversario9anos-ff.vercel.app/api/pix/create' -Method POST -Headers @{'Content-Type'='application/json'} -Body $body -TimeoutSec 30 -UseBasicParsing
    Write-Host ("Status: " + [int]$r.StatusCode)
    Write-Host ("Body:   " + $r.Content)
} catch {
    Write-Host ("Erro: " + $_.Exception.Message) -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host ("Body:   " + $reader.ReadToEnd())
    }
}