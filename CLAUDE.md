# AI-CustomerHunter (ReplyPulse AI) — Proje Kuralları

## Mimari & Teknoloji
- **Çalışma Ortamı:** Node.js 22 (`server.js` + `public/*`), dış paket bağımlılığı yok (saf Node `http` + `fetch`).
- **Port & Veri:** Varsayılan port `3090`, kalıcı veri dizini `DATA_DIR` (`/data/db.json`).
- **Özellikler:**
  - 8 AppCook uygulamasının (`AI-Task`, `AI-Transcript`, `AI-Draw`, `AI-Colab`, `AI-Analysis`, `AI-Coach`, `AI-ServiceDesk`, `AI-Shop`) hazır müşteri profilleri (`APPCOOK_PORTFOLIO_CAMPAIGNS`).
  - Reddit JSON API, HackerNews Algolia API, GitHub Issues API ve X üzerinden canlı alıcı niyeti taraması (`POST /api/scan`).
  - 0–100 Buyer-Intent puanlama ve 3 tonlu Anti-Spam yanıt stüdyosu (`helpful`, `founder`, `comparison`).
  - Tek tıkla web sitesi URL analiz sihirbazı (`POST /api/analyze-url`).

## Yayın (Hostinger `2.24.62.11`)
- **Canlı Adres:** `https://customerhunter.appcook.store`
- **Sunucu Dizini & Konteyner:** `/opt/customerhunter`, Docker Compose projesi `customerhunter`, konteyner `customerhunter-app-1` (`customerhunter:3090`, `mem_limit: 256m`, `platform` ağı).
- **Yayın Komutu:**
  ```powershell
  $null | powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Projects\AI-CustomerHunter\deploy\yayinla.ps1" -Sunucu 2.24.62.11 -AlanAdi customerhunter.appcook.store
  ```
- **Sağlık Kontrolü:** `https://customerhunter.appcook.store/api/health` → `{"ok":true,"status":"healthy"}`
