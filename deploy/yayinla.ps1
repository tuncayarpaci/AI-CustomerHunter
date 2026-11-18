<#
  AI-CustomerHunter (ReplyPulse AI) uygulamasını Windows'tan ortak Hostinger sunucusuna yükler ve kurar/günceller.

  Kullanım (depo kök klasöründe):
      .\deploy\yayinla.ps1
      .\deploy\yayinla.ps1 -AlanAdi customerhunter.appcook.store
#>
param(
    [string]$Sunucu = "2.24.62.11",
    [string]$AlanAdi = "customerhunter.appcook.store",
    [string]$Kullanici = "root",
    [string]$Anahtar = "$env:USERPROFILE\.ssh\id_ed25519"
)
$ErrorActionPreference = "Continue"
$Kok = Split-Path $PSScriptRoot -Parent
Set-Location $Kok

$hedef = "$Kullanici@$Sunucu"
$ssh = @("-i", $Anahtar, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", "-o", "ServerAliveInterval=30")
$arsiv = Join-Path $env:TEMP "customerhunter-yayin.tar"

try {
    Write-Host "== Dosyalar paketleniyor" -ForegroundColor Cyan
    tar -cf $arsiv package.json server.js public Dockerfile .dockerignore deploy
    if ($LASTEXITCODE -ne 0) { throw "Arşiv oluşturulamadı (tar)." }

    Write-Host "== Sunucuya yükleniyor: $hedef" -ForegroundColor Cyan
    scp -q @ssh $arsiv "${hedef}:/tmp/customerhunter-yayin.tar"
    if ($LASTEXITCODE -ne 0) { throw "Dosyalar sunucuya kopyalanamadı (scp)." }

    $uzak = "set -e; mkdir -p /opt/customerhunter && cd /opt/customerhunter && " +
            "rm -rf package.json server.js public Dockerfile .dockerignore deploy && " +
            "tar --no-same-owner -xf /tmp/customerhunter-yayin.tar && rm /tmp/customerhunter-yayin.tar && " +
            "sed -i 's/\r$//' deploy/sunucu_kur.sh deploy/compose.sunucu.yml Dockerfile .dockerignore && " +
            "bash deploy/sunucu_kur.sh $AlanAdi $Sunucu 2>&1"
    ssh @ssh $hedef $uzak
    if ($LASTEXITCODE -ne 0) { throw "Sunucu kurulumu başarısız oldu (çıkış kodu $LASTEXITCODE)." }

    Write-Host "`nYayın tamamlandı: https://$AlanAdi" -ForegroundColor Green
} finally {
    Remove-Item $arsiv -ErrorAction SilentlyContinue
}
