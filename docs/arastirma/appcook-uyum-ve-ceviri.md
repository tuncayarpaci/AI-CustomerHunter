# AI-CustomerHunter — AppCook Yönetim Standardı Uyumu, Arayüz Sadeleştirme ve TR/EN İçerik Çevirisi Araştırma Raporu

**Tarih:** 2026-11-19  
**Proje:** `C:\Projects\AI-CustomerHunter` (`https://customerhunter.appcook.store`)  
**Kapsam:** Yalnızca araştırma ve mimari öneri (kod değişikliği yapılmamıştır).

---

## 1. Soru ve Kısıtlar

İki ana geliştirme için mevcut mimarinin analizi ve en düşük maliyetli, güvenli, bakım kolaylığı yüksek çözüm yolunun belirlenmesi:
1. **AppCook Yönetim Standardına uyum:** Google ile giriş (OAuth 2.0 + OIDC), yönetici onayı, onay/ret e-postası (SMTP), oturum öncesi `giris-kiti` ekranı ve sol yönetim menüsü (`/yonetim`, yöneticiye 2FA yok).
2. **Müşteri kovalayan (satış / KOBİ / iş geliştirme) kullanıcılar için sadeleştirme ve TR/EN içerik çevirisi:** Teknik jargonun temizlenmesi, 7 dilden yalnızca **TR/EN** desteğine inilmesi ve Reddit/HackerNews/GitHub/X'ten gelen başlık, metin, alıcı niyeti özeti ve yanıt taslaklarının aktif arayüz diline göre (TR/EN) çevrilip önbelleklenmesi.

**Kısıtlar:**
- Çalışma ortamı: **Node.js 22** (`node:22-alpine`), mevcut durumda sıfır dış bağımlılık.
- Sunucu belleği kısıtlı: `mem_limit: 256m`, `cpus: 1.0`, `pids_limit: 128` (`deploy/compose.sunucu.yml`). Ağır ek servis (ör. self-hosted LibreTranslate) kaldırılamaz.
- Veri deposu: `DATA_DIR` (`/data/db.json`) — tek konteyner, dosya tabanlı kalıcılık.

---

## 2. A) Mevcut AI-CustomerHunter Mimarisi

İncelenen dosyalar: `server.js` (1041 satır), `public/index.html` (478 satır), `public/app.js` (655 satır), `public/ceviri.js` (344 satır), `public/ceviri/*.js`, `Dockerfile`, `deploy/compose.sunucu.yml`, `deploy/sunucu_kur.sh`.

### 2.1 Ortam Değişkenleri ve Harici API Anahtarları
- **Aktif env değişkenleri:** Yalnızca `PORT` (`3090`), `DATA_DIR` (`/data`), `NODE_ENV` (`production`).
- **API Anahtarı / SMTP / OAuth:** **Hiçbiri yok.** `db.json` içindeki `settings.openaiModel` (`gpt-4o-mini (Semantic Intent v3)`) ve `settings.slackWebhook` / `discordWebhook` alanları yalnızca arayüzde görüntülenen/kaydedilen **mock** alanlardır; `server.js` içinde gerçek bir OpenAI, Anthropic, Gemini, Slack veya SMTP çağrısı yoktur.
- **Gerçek dış çağrılar:** Yalnızca kimlik doğrulamasız genel uç noktalar (`fetchWithTimeout`, 4.5 sn zaman aşımı):
  - HackerNews Algolia API (`hn.algolia.com/api/v1/search_by_date`)
  - Reddit Public JSON (`reddit.com/search.json`)
  - GitHub Issues Search (`api.github.com/search/issues`)
  - Web URL analizi (`POST /api/analyze-url`) — hedef sitenin `<title>` ve `<meta description>` etiketlerini regex ile okur.
  - X (Twitter) için gerçek bir canlı API çağrısı yoktur; yalnızca arayüzde kanal etiketi ve simüle/sentetik sinyal bulunur (`scanLiveSources` her taramada 1 adet sentetik Reddit sinyali ekler, satır 708–733).

### 2.2 Veri Modeli (`db.json`)
`loadDb()` (`server.js:470-500`) üç üst düzey anahtar tutar:
- `campaigns[]`: 8 hazır AppCook portföy ürünü (`APPCOOK_PORTFOLIO_CAMPAIGNS`, `server.js:27-188`) + kullanıcının eklediği kampanyalar (`id`, `name`, `url`, `category`, `audience`, `valueProp`, `keywords[]`, `competitors[]`, `subreddits[]`, `dealValue`, `active`, `createdAt`). Her `loadDb()` çağrısında `syncPortfolioDb()` çalışır.
- `leads[]`: 9 hazır örnek aday (`INITIAL_LEADS`, `server.js:192-391`) + taramadan gelenler (`id`, `campaignId`, `platform`, `community`, `author`, `title`, `snippet`, `url`, `intentScore`, `intentType`, `intentLabel`, `matchedKeywords[]`, `competitorMentioned`, `estimatedValue`, `banRisk`, `whyHot`, `status`, `postedAt`, `createdAt`, `replies: { helpful, founder, comparison }`).
- `settings`: `{ plan, slackWebhook, discordWebhook, openaiModel, minIntentThreshold, autoAlert90Plus, language }`.

### 2.3 Mevcut API Uç Noktaları (`server.js:914-1007`)
Tüm uç noktalar şu an **kimlik doğrulamasız (herkese açık)**:
- `GET /api/health`
- `GET /api/state`
- `POST /api/analyze-url`
- `POST /api/campaigns`
- `POST /api/scan`
- `PUT /api/leads/:id`
- `PUT /api/settings`

### 2.4 Dil Yapısı ve Çift Sistem Çakışması
- `public/ceviri.js`: 7 dilli (`tr, en, de, es, fr, zh, ja`), `URL ?lang=` > `localStorage("appcook_lang")` > `Cookie("appcook_lang")` > `"tr"` önceliğiyle çalışan, `MutationObserver` ile İngilizce kaynak DOM'u metin/regex sözlüğü üzerinden çeviren sistem.
- `public/app.js:17-140`: Eski bir `I18N` nesnesi ve `setLanguage()` fonksiyonu **ölü kod** olarak durmaktadır (`index.html`'de `langEn`/`langTr` düğmeleri yoktur).
- **Kritik boşluk:** `ceviri.js` yalnızca sabit arayüz metinlerini çevirir. `db.json`'daki örnek adaylar, canlı Reddit/HN/GitHub tarama sonuçları (`title`, `snippet`, `whyHot`, `intentLabel`) ve `generateReplies()` çıktıları **tamamen İngilizce** kalmaktadır.

### 2.5 Mevcut Arayüz Akışı
- Üst çubukta iki mod var: `Global SaaS Landing` (sahte fiyatlandırma planları `$19/$49/$99` içeren pazarlama vitrini) ve `Live Radar Workspace` (varsayılan açık).
- Sol kenar çubuğunda 5 sekme: `Live Buyer-Intent Radar`, `1-Click URL Onboarding`, `Lead CRM & ROI Funnel`, `Competitor Churn Watch`, `Webhooks & Plan Billing`.
- Oturum yönetimi, kullanıcı ayrımı veya yönetici paneli yoktur.

---

## 3. B) AppCook Yönetim Standardı ve Giriş Kiti İncelemesi

Referans olarak incelenen kaynaklar:
- `C:\Projects\AppCook\giris-kiti\` (`appcook-giris.css`, `appcook-giris.js`, `appcook-fonts/inter-tight-*.woff2`, `dagit.sh`)
- `C:\Projects\AppCook\standart\` (`appcook-tema.css`, `appcook-kabuk.js`, `appcook-giris.css`)
- `C:\Projects\AI-Shop\app\auth.py`, `mailer.py`, `yonetim.py`, `settings.py`, `.env.example`, `deploy\compose.sunucu.yml`
- `C:\Projects\AI-Draw\.env.example`

### 3.1 AppCook Standardının Bileşenleri (`AI-Shop` Referansı)

| Bileşen | AppCook Standardı Uygulaması (`AI-Shop`) | AI-CustomerHunter (Node.js 22) Uyarlaması |
|---|---|---|
| **Google OAuth 2.0 + OIDC** | `GET /auth/google/start` → PKCE (`S256`), `state`, `nonce` üretip 600 sn imzalı `oidc` çerezine yazar → `accounts.google.com/o/oauth2/v2/auth` (`scope=openid email profile`, `prompt=select_account`). `GET /auth/google/callback` → `oauth2.googleapis.com/token` ile kodu değişir, `id_token` içinden `iss/aud/exp/nonce/sub/email_verified` doğrular. | **Sıfır ek paket:** Node.js 22 yerleşik `fetch` + `node:crypto` (`randomBytes`, `createHash('sha256')`, `timingSafeEqual`) ile birebir aynı güvenlikte yazılır. |
| **Oturum Çerezi & JWT** | HS256 imzalı token (`pur`, `uid`, `tv`, `iat`, `exp`, `jti`). HTTPS (`PUBLIC_URL=https://...`) iken `__Host-<app>_oturum` (`HttpOnly; Secure; SameSite=Lax; Path=/`), yerelde `<app>_oturum`. Her istekte kullanıcı kaydından `status === "active"` ve `token_version === tv` kontrol edilir. | **Sıfır ek paket:** `node:crypto` `createHmac('sha256', secret)` ile 30 satırlık HS256 JWT `sign()`/`verify()`. `SECRET_KEY` yoksa `DATA_DIR/secret.key` (`0600`) otomatik üretilir. Çerez adları: `__Host-customerhunter_oturum` / `customerhunter_oturum`. |
| **İlk Yönetici & Yerel Giriş** | Hiç kullanıcı yoksa `ADMIN_USERNAME` (varsayılan `admin`) + `ADMIN_PASSWORD` ile oluşturulur; parola verilmezse rastgele üretilip `DATA_DIR/ilk-yonetici.txt` (`0600`) dosyasına yazılır ve ilk başarılı girişte otomatik silinir. Parola özeti PBKDF2-HMAC-SHA256 (600.000 tur). Kaba kuvvet koruması: 15 dk'da hesap+IP 10, IP 100 deneme. `ADMIN_EMAILS` listesindeki Google hesapları doğrudan aktif yönetici açılır. Yöneticiye 2FA **yoktur**. | **Sıfır ek paket:** `node:crypto.pbkdf2Sync(..., 600000, 32, 'sha256')` + `timingSafeEqual` + süreç içi `Map` rate limiter. Kullanıcı verileri `db.json` içinde `users[]` ve `usedTokens{}` (veya ayrı `auth.json` — atomik yazım için ayrı dosya önerilir) olarak saklanır. |
| **Onay / Ret Akışı** | Google ile ilk kez gelen (ve `ADMIN_EMAILS`'te olmayan) herkes `status: "pending"` açılır. Yöneticilere 14 gün geçerli, tek kullanımlık (`jti`) imzalı `GET /onay?t=...&karar=onayla|reddet` linkleriyle e-posta gider. `GET /onay` onay formu gösterir (e-posta önizleme botlarını engellemek için); `POST /onay` kararı uygular ve başvurana onay/ret e-postası gönderir. | Birebir aynı akış (`GET/POST /onay`, `POST /kullanicilar/:id/:action`). `usedTokens` içinde `jti` saklanıp süresi dolanlar temizlenir. |
| **E-posta (SMTP)** | Python `smtplib` ile STARTTLS (587) / SSL (465), Gmail 16 haneli uygulama şifresi boşluk temizliği, düz metin + düğmeli HTML (`multipart/alternative`), arka planda gönderim + Ayarlar panelinde "Deneme e-postası gönder". | **Öneri: `nodemailer` (tek npm paketi).** Ayrıntı aşağıda (§3.2). |
| **Giriş Ekranı (`giris-kiti`)** | `body.ac` + `.ac-sahne.renk-*` + solda `.ac-bento` (3 özellik kartı + animasyonlu vitrin), sağda `.ac-form` (Google düğmesi + açılır `<details>` yerel yönetici girişi). | `AppCook/giris-kiti/` (`appcook-giris.css`, `appcook-giris.js`, `appcook-fonts/*`) + `AppCook/standart/appcook-tema.css`, `appcook-kabuk.js` `public/` altına alınır. `/giris` rotası bu şablonu sunar. |
| **Sol Yönetim Menüsü (`/yonetim`)** | Standart sıra: `Genel bakış` (`/yonetim`), `Kullanıcılar` (`/yonetim/kullanicilar` + bekleyen sayaç rozeti), `Giriş yöntemleri` (`/yonetim/giris`), `E-posta` (`/yonetim/eposta`), `Yapay zekâ / Çeviri` (`/yonetim/yapay-zeka`), ayraç + uygulamaya özel bölüm, `← Uygulamaya dön`. Ayarlar `DATA_DIR/settings.json`'da tutulur, `.env`'den önceliklidir; gizli alanlar API'den maskeli döner. | Birebir aynı menü yapısı ve `/yonetim/*` rotaları. `compose.sunucu.yml` içine `env_file: ../.env` (`required: false`), `TZ: Europe/Istanbul`, `PUBLIC_URL` desteği eklenir. |

### 3.2 Node.js 22'de SMTP Gönderimi: Aday Karşılaştırması

| Aday | Bağlantı / Paket | Lisans | Sürüm / Sağlık | Güçlü Yanı | Zayıf Yanı |
|---|---|---|---|---|---|
| **`nodemailer`** | npm (`nodemailer`) | **MIT-0** (Atıf bile gerektirmez) | `v10.x` (aktif, Node `>=20`), **0 alt bağımlılık** | Sıfır alt bağımlılık; STARTTLS/SSL/Gmail/UTF-8 MIME/multipart/timeout/hata kodları yıllardır kanıtlanmış; ~1-2 MB disk, ihmal edilebilir RAM. | `package.json`'a 1 dış bağımlılık ve `Dockerfile`'a `npm ci --omit=dev` adımı eklenir. |
| **Saf `node:net` + `node:tls`** | Sıfır paket (elle yazım) | — | — | Sıfır `node_modules`. | SMTP çok satırlı yanıtları, STARTTLS upgrade, RFC 2047 UTF-8 konu kodlaması (`=?UTF-8?B?`), Gmail 535/AUTH PLAIN/LOGIN kenar durumları hata ve bakım yükü üretir. |

**Karar:** OAuth, JWT, PBKDF2 ve çerez yönetimi **sıfır paketle** (saf Node.js 22 `node:crypto` + `fetch`), SMTP gönderimi ise **yalnızca tek sıfır-bağımlılıklı MIT-0 paketi olan `nodemailer`** ile yapılmalıdır. `mem_limit: 256m` sınırı içinde rahatça kalır (~40-60 MB RSS).

---

## 4. C) Kaynak İçeriklerinin (Reddit/HN/GitHub/X) TR/EN Çevirisi ve Önbellekleme

### 4.1 Hangi Alanlar Çevrilmeli?
Bir `lead` nesnesinde kullanıcıya gösterilen metinler:
1. `title` (Konu başlığı)
2. `snippet` (Gönderi özeti/metni)
3. `whyHot` (Neden sıcak müşteri / alıcı niyeti özeti)
4. `intentLabel` (Kısa niyet etiketi — sabit kalıplardan sözlükle çevrilebilir)
5. `replies` (`helpful`, `founder`, `comparison`) — **Önemli ürün kararı:** Reddit/HN/GitHub gönderileri çoğunlukla İngilizce olduğu için kullanıcıya *göndereceği yanıt taslağını* hem gönderinin orijinal dilinde (genellikle EN) hem de ne yazdığını anlaması için TR çevirisiyle (veya "Yanıt dili: Orijinal (EN) / Türkçe" seçimiyle) sunmak satışçılar için çok daha işlevseldir. Başlık, özet ve "Neden sıcak?" alanı mutlaka aktif arayüz dilinde (TR veya EN) gösterilmelidir.

### 4.2 Çeviri Sağlayıcıları Karşılaştırması

| Aday | Tür / API Anahtarı | Lisans / Kullanım Şartı | Kota & Maliyet | Hız & Kalite (TR↔EN) | Sunucu Maliyeti & Risk |
|---|---|---|---|---|---|
| **1. LLM API (Anthropic Haiku 4.5 / Gemini 2.5 Flash / OpenAI uyumlu)** | Resmi API (anahtar gerekir; AppCook panelinden girilir) | Ticari API (uygun) | Çok düşük: Gemini 2.5 Flash `$0.30 / 1M` girdi, Haiku 4.5 `$1.00 / 1M` girdi. 100 lead çevirisi < `$0.02`. | **En yüksek kalite.** İş/satış jargonu, bağlam ve "Neden bu kişi müşteri olabilir?" özetini doğal Türkçeye çevirir; tek JSON çağrısında toplu çeviri yapar. | RAM etkisi 0. Anahtar girilmemişse çalışmaz → fallback gerekir. |
| **2. MyMemory API (`api.mymemory.translated.net`)** | Resmi ücretsiz REST API (anahtarsız) | Ücretsiz tier (belgeli, yasal) | Anonim: **5.000 karakter/gün**; geçerli `de=email` parametresiyle **50.000 karakter/gün**. Tek istek max **500 bayt**. | Orta-iyi kalite; 500 bayt sınırı nedeniyle uzun `snippet`'ler cümle bazlı bölünmeli. | RAM etkisi 0. Günlük kota aşımında 429 döner; agresif önbellekleme ile küçük ekiplerde yeterli. |
| **3. Google Translate `gtx` (`translate.googleapis.com/translate_a/single?client=gtx`)** | **Resmi olmayan** iç uç nokta (anahtarsız) | **Google ToS ihlali riski** (otomatik sunucu kazıması yasak) | Resmi kota yok; IP bazlı 429/403 engeli (veri merkezi IP'lerinde daha sık). | Çok hızlı (~150-300 ms), yüksek kalite, uzun metin destekler. | **Risk:** Paylaşımlı VPS IP'si (`2.24.62.11`) geçici/kalıcı 429 yiyebilir; Google uç noktayı habersiz değiştirebilir. Üretimde tek başına güvenilmemeli. |
| **4. DeepL API (Developer)** | Resmi API (anahtar gerekir) | Ticari / Developer | Yeni hesaplarda **tek seferlik 1M karakter** (artık aylık yenilenmiyor!). | Çok yüksek kalite. | Aylık yenilenmediği için kalıcı ücretsiz çözüm değil. |
| **5. Self-hosted LibreTranslate** | Kendi konteynerimiz | AGPL-3.0 (ayrı konteyner) | Sınırsız, ücretsiz. | Orta kalite (Argos Translate). | **ELENDİ:** En az **2–4 GB RAM** ve GB'larca disk modeli ister; kısıtlı VPS'e (`256m` konteyner) kesinlikle uymaz. |

### 4.3 Önerilen Katmanlı Çeviri Mimarisi (Sıfır Kesinti)
1. **1. Katman — Kalıcı Önbellek (`db.json` / `translations`):** Metin daha önce çevrildiyse dış API'ye hiç gidilmez (0 ms, 0 maliyet).
2. **2. Katman — Yapılandırılmış LLM API (Varsa, öncelikli):** Yönetici panelindeki `/yonetim/yapay-zeka` bölümünde Anthropic / OpenAI-uyumlu / Gemini anahtarı tanımlıysa, tek bir toplu JSON isteğiyle `title`, `snippet`, `whyHot` alanlarını doğal satış Türkçesine/İngilizcesine çevirir.
3. **3. Katman — Anahtarsız Ücretsiz Fallback (MyMemory → Opsiyonel GTX):** LLM anahtarı yoksa önce resmi ücretsiz **MyMemory API** (`de=<admin_email>` ile 50.000 karakter/gün, 450 karakterlik parçalara bölerek) denenir. MyMemory kotası dolarsa veya yanıt vermezse, yalnızca yönetici isterse (veya varsayılan son çare fallback olarak düşük sıklıkta) `gtx` veya orijinal metin + "Çeviri bekleniyor" uyarısı gösterilir. *(Not: `gtx` kullanımı Google ToS açısından gri/riskli alan olduğu için kullanıcı onayına sunulmalıdır; varsayılan olarak LLM → MyMemory → Orijinal metin zinciri en temiz ve yasal yoldur.)*
4. **Hızlı Dil Algılama:** Metin zaten hedef dildeyse (ör. Türkçe karakter oranı `ğüşöçıİĞÜŞÖÇ` veya yaygın Türkçe/İngilizce stop-word kontrolüyle) çeviri çağrısı atlanır.

### 4.4 `db.json` Önbellekleme (Cache) Stratejisi
- **Lead içi çeviri alanı (tercih edilen):** Her `lead` nesnesine `i18n` alt nesnesi eklenir:
  ```json
  "i18n": {
    "tr": {
      "title": "...",
      "snippet": "...",
      "whyHot": "...",
      "intentLabel": "...",
      "provider": "anthropic|mymemory",
      "translatedAt": "2026-11-19T10:00:00Z"
    }
  }
  ```
- **Avantajları:**
  - `INITIAL_LEADS` (9 hazır AppCook adayı) doğrudan statik TR + EN çevirileriyle gömülü gelebilir (0 API çağrısı).
  - Canlı taramada (`POST /api/scan`) gelen 4–6 yeni aday yalnızca **1 kez** çevrilir ve `db.json`'a yazılır; sayfa yenilemelerinde veya başka kullanıcılar açtığında tekrar API çağrısı yapılmaz.
  - Eski kayıtlar için isteğe bağlı (lazy) çeviri: `GET /api/state?lang=tr` veya `POST /api/translate` çağrıldığında yalnızca eksik `i18n[lang]` olan görünür kayıtlar (en fazla 10 adet/istek, eşzamanlılık sınırı 2) çevrilip kaydedilir.
- **Boyut ve Bellek Kontrolü:** `db.json` şişmesini önlemek için toplam `leads` sayısı (ör. kampanya başına en fazla 50 veya toplam 300 kayıt, `converted`/`replied` olanlar korunarak) sınırlandırılır; atomik yazım (`db.json.tmp` → `fs.renameSync`) uygulanır.

---

## 5. D) Dil Sadeleştirme (7 → 2 Dil) ve Müşteri Kovalayan Arayüz Sadeleştirmesi

### 5.1 `public/ceviri/` Klasörünün Mevcut Durumu
- Klasörde 7 dosya var: `tr.js` (194 satır, 16.8 KB), `en.js` (4 satır, boş), `de.js`, `es.js`, `fr.js`, `ja.js`, `zh.js` (her biri ~194 satır, ~16 KB).
- **Yapılacak sadeleştirme:**
  - `de.js`, `es.js`, `fr.js`, `ja.js`, `zh.js` dosyaları silinir.
  - `public/ceviri.js` içindeki `DILLER` dizisi `["tr", "en"]` yapılır; varsayılan dil `"tr"` korunur.
  - `public/app.js` içindeki kullanılmayan `I18N` nesnesi ve `setLanguage()` ölü kodu temizlenir; dil değişikliğinde aktif dil hem arayüze (`ceviri.js`) hem de API'den gelen dinamik lead içeriklerine (`window.__appcookLang`) uygulanır.

### 5.2 Müşteri Kovalayan (Satış / KOBİ / İş Geliştirme) Kullanıcılar İçin Sadeleştirilecek Terimler ve Bölümler

Mevcut arayüzde geliştirici/SaaS-büyüme jargonu (`Semantic Buyer-Intent`, `ARR Attribution`, `Competitor Churn Watch`, `Anti-Shadowban`, `Subreddit Ban Risk`, `Webhooks & Plan Billing`) ve sahte ödeme planları (`Starter $19`, `Growth $49`, `Scale $99`) bulunuyor. AppCook içindeki gerçek müşteri kovalayan kullanıcı için aşağıdaki sadeleştirme önerilir:

| Mevcut Teknik / Karmaşık İfade | Önerilen Sade Türkçe | Önerilen Sade İngilizce |
|---|---|---|
| `ReplyPulse AI — Autonomous Social Buyer-Intent Radar` | `AI-CustomerHunter — Müşteri Bulma Radarı` | `AI-CustomerHunter — Customer Discovery Radar` |
| `Live Buyer-Intent Radar` | `Sıcak Müşteri Fırsatları` | `Hot Customer Leads` |
| `1-Click URL Onboarding` | `Ürün / Web Sitesi Ekle` | `Add Product / Website` |
| `Lead CRM & ROI Funnel` | `Müşteri Takip Listesi` | `Lead Tracker` |
| `Competitor Churn Watch` | `Rakipten Memnun Olmayanlar` | `Unhappy Competitor Users` |
| `Webhooks & Plan Billing` | *(Yönetim paneline taşınır / kaldırılır)* | *(Moved to Admin / removed)* |
| `Global SaaS Landing` + Fiyatlandırma (`$19/$49/$99`) | **Kaldırılmalı** (Oturum öncesi `giris-kiti` sayfası vitrin görevi görür) | **Remove** (Replaced by AppCook login bento) |
| `High-Intent Buyers (85+ Score)` | `Satın Almaya Hazır Kişiler` | `Ready-to-Buy Prospects` |
| `Competitor Churn Signals` | `Rakip Değiştirmek İsteyenler` | `Looking to Switch` |
| `Estimated Pipeline ROI` / `ARR Attribution` | `Tahmini Satış Potansiyeli` | `Estimated Sales Potential` |
| `Anti-Spam Reply Studio` | `Hazır Mesaj / Yanıt Taslağı` | `Reply Draft Studio` |
| `Helpful Peer (95% Value)` / `Transparent Founder` / `Objective Comparison` | `Yardımsever` / `Ürün Sahibi` / `Karşılaştırmalı` | `Helpful` / `Founder` / `Comparison` |
| `Subreddit Ban Risk: Low (4%)` | `Spam Riski: Düşük (Güvenli)` | `Spam Risk: Low (Safe)` |
| `Scan Live Intent Now` | `Yeni Fırsatları Tara` | `Scan for New Leads` |
| `Active Product Radar` | `Hangi Ürün İçin Müşteri Arıyorsun?` | `Active Product` |
| `Competitors to Poach Churn From` | `Rakipleriniz` | `Your Competitors` |
| `Core Value Proposition` | `Ürününüz Ne İşe Yarar? (Kısa Özet)` | `What Does Your Product Do?` |
| `Target Buyer Persona` | `Hedef Müşteriniz Kim?` | `Target Customers` |
| `Intent Score: 98/100` | `Satın Alma İhtimali: %98 (Çok Yüksek)` | `Buying Likelihood: 98% (Very High)` |

**Bölüm sadeleştirmesi:**
- `Global SaaS Landing` sekmesi ve sahte `$19/$49/$99` abonelik kartları tamamen kaldırılır (uygulama zaten oturum korumalı olacak; giriş öncesi tanıtım `AppCook/giris-kiti` bento ekranıyla yapılır).
- `Webhooks & Plan Billing` kullanıcı sekmesinden çıkarılır; gerçek ayarlar (Google OAuth, SMTP, Yapay Zekâ / Çeviri API, Webhook) yalnızca yöneticilerin gördüğü `/yonetim` sol menüsüne taşınır.
- Ana çalışma alanı 4 net sekmeye iner: **1) Fırsatlar (Radar)**, **2) Müşteri Takibi**, **3) Rakip Şikayetleri**, **4) Ürün Ekle**.

---

## 6. Öneri (Tek Yol) ve Alınacaklar

### Tek Öneri
1. **Kimlik doğrulama ve yönetim (`server.js` modülerleştirilerek `lib/auth.js`, `lib/mailer.js`, `lib/yonetim.js`, `lib/translate.js`):**
   - Google OAuth 2.0 (PKCE+OIDC), HS256 JWT oturum çerezi, PBKDF2 parola özetleme, ilk yönetici oluşturma, kaba kuvvet koruması ve tek kullanımlık onay/ret token'ları **saf Node.js 22 (`node:crypto` + `fetch`)** ile `AI-Shop/app/auth.py` kalıbı uyarlanarak yazılmalı.
   - E-posta (SMTP) gönderimi için yalnızca **1 adet sıfır-bağımlılıklı paket (`nodemailer`, MIT-0)** eklenmeli.
   - Kullanıcılar ve ayarlar `DATA_DIR/auth.json` + `DATA_DIR/settings.json` (veya tek atomik katman) içinde tutulmalı; mevcut `/api/*` uç noktalarının tamamı (`/api/health` hariç) oturum zorunluluğuna alınmalı.
2. **Giriş ekranı ve sol yönetim menüsü:**
   - `AppCook/giris-kiti/` ve `AppCook/standart/` dosyaları kopyalanarak `/giris` ve `/yonetim/*` sayfaları AppCook v2 standardına tam uyumlu hale getirilmeli.
3. **TR/EN içerik çevirisi ve sadeleştirme:**
   - 5 gereksiz dil dosyası silinip yalnız `TR/EN` bırakılmalı; arayüz metinleri §5.2'deki sade satış/KOBİ diline dönüştürülmeli.
   - Kaynak içerikler için **Önbellek (`lead.i18n`) → LLM API (Anthropic/OpenAI/Gemini, yönetici panelinden ayarlanabilir) → MyMemory API (ücretsiz resmi fallback)** zinciri kurulmalı.

### Alınacaklar (Kopyalanacak / Uyarlanacak Kaynaklar)

| Dosya / Kalıp | Kaynak Yol | Kullanım Şekli | Lisans Notu |
|---|---|---|---|
| `appcook-giris.css`, `appcook-giris.js`, `appcook-fonts/*` | `C:\Projects\AppCook\giris-kiti\` | `public/` altına doğrudan kopyala | Proje içi (AppCook) + Inter Tight (SIL OFL 1.1 — `OFL.txt` korunmalı) |
| `appcook-tema.css`, `appcook-kabuk.js` | `C:\Projects\AppCook\standart\` | `public/` altına kopyala | Proje içi (AppCook) |
| OAuth PKCE, oturum çerezi, onay/ret e-posta akışı, sol yönetim menüsü kalıbı | `C:\Projects\AI-Shop\app\auth.py`, `mailer.py`, `yonetim.py`, `settings.py` | Node.js 22'ye kalıp olarak uyarla | Proje içi (AppCook) |
| `nodemailer` (`^10.6.0` veya Node 22 uyumlu güncel kararlı) | npm (`https://www.npmjs.com/package/nodemailer`) | Bağımlılık olarak kur (`npm install nodemailer`) | **MIT-0** (ticari/özel kullanıma tamamen açık, 0 alt bağımlılık) |

---

## 7. Riskler ve Açık Sorular

1. **Google Translate `gtx` fallback kararı (Kullanıcı kararı gerekli):** LLM anahtarı girilmemişken MyMemory'nin günlük 50.000 karakter kotası aşılırsa, resmi olmayan `translate.googleapis.com/translate_a/single?client=gtx` uç noktası son çare olarak eklensin mi, yoksa Google ToS riski nedeniyle yalnızca **LLM API → MyMemory → Orijinal metin** zinciriyle mi sınırlı kalınsın?
2. **Yanıt taslaklarının dili:** Reddit/HN/GitHub gönderilerinin neredeyse tamamı İngilizce. "Hazır Yanıt Taslağı" kutusunda kullanıcının kopyalayacağı metin **varsayılan olarak gönderinin dilinde (EN)** olup altında/yanında Türkçe çeviri önizlemesi mi gösterilsin, yoksa arayüz TR iken yanıt da mı TR üretilsin? (Öneri: Kopyalanacak yanıt gönderi dilinde EN, yanında tek tıkla "Türkçe anlamını gör" veya TR/EN geçiş düğmesi.)
3. **Çok kullanıcılı veri izolasyonu:** Onaylanan yeni kullanıcılar ortak `campaigns` ve `leads` havuzunu mu görecek (ekip çalışma alanı), yoksa her kullanıcının kendi eklediği ürün/kampanyalar mı izole olacak? (Kısa vadede ortak AppCook ekibi havuzu en basit modeldir; kullanıcı bazlı izolasyon istenirse `campaign.ownerId` eklenmelidir.)
4. **Sunucu `.env` ve `compose.sunucu.yml`:** Canlı sunucuda (`/opt/customerhunter`) `PUBLIC_URL=https://customerhunter.appcook.store` ve `env_file: ../.env` (`required: false`) tanımlanmalı; Google Cloud Console'da `https://customerhunter.appcook.store/auth/google/callback` yönlendirme adresi eklenmelidir.
5. **Sahte `X` ve sentetik lead'ler:** Mevcut `scanLiveSources()` her taramada 1 adet sentetik/uydurma Reddit lead'i ekliyor (`server.js:708-733`) ve X'ten gerçek veri çekmiyor. Sadeleştirme sırasında gerçek veri güvenilirliği için sentetik lead üretiminin kaldırılıp kaldırılmayacağı netleştirilmelidir.
