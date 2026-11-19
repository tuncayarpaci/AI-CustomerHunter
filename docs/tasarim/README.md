# AI-CustomerHunter — Arayüz Yenileme Şablonları

Bu klasörde, `AI-CustomerHunter` arayüzünü teknik jargondan arındırıp satışçılar, KOBİ sahipleri ve iş geliştirme ekipleri için aksiyon odaklı hale getiren **2 farklı görsel ve yapısal yön** yer alır.

Tüm dosyalar dış CDN bağımlılığı olmadan doğrudan tarayıcıda açılabilir (`index.html` üzerinden karşılaştırılabilir).

## Ortak Kararlar (Her İki Seçenekte)
- **Yalnızca TR / EN dil seçici:** Üst çubukta tek tıkla geçiş. Arayüz Türkçe iken fırsat başlığı, özeti ve *"Neden bu kişi müşteri olabilir?"* açıklaması Türkçe gösterilir; *"Orijinal gönderiyi gör (EN)"* `<details>` ile açılır.
- **Hazır Yanıt Taslağı ikili dil akışı:** Kopyalanacak metin varsayılan olarak gönderinin kendi dilinde (**EN**) sunulur; arayüz Türkçe iken hemen altında **Türkçe Anlam Önizlemesi** ve tek tıkla `EN → TR` geçiş düğmesi bulunur.
- **4 sade ana sekme:** `Fırsatlar (Radar)`, `Müşteri Takibi`, `Rakip Şikayetleri`, `Ürün Ekle`. Sahte `$19/$49/$99` planları ve `Global SaaS Landing` tamamen kaldırılmıştır.
- **AppCook v2 uyumu:** 9-nokta uygulama değiştirici, `/yonetim` yönetici geçiş bağlantısı, kullanıcı profili/çıkış, açık/koyu tema ve WCAG 2.2 AA kontrast + odak halkası + ≥44 px dokunma hedefleri.
- **Duyarlı (Responsive):** Masaüstü (`1440 px`) ve mobil (`390 px`, alt gezinme barı + `safe-area-inset-bottom` + iOS zoom koruması).

---

## Seçenek 1 — Sade Kartlı Satış Masası (`secenek-1.html`)
- **Fikir:** Aydınlık/ferah AppCook v2 teması. Sol menü yerine üstte yatay 4 sekme; ortalanmış tek sütun fırsat kartları. Her kartın altında yanıt taslağı ve Türkçe önizleme doğrudan elinin altında.
- **Güçlü yanları:**
  - KOBİ sahipleri ve ilk kez kullanan satışçılar için en düşük bilişsel yük.
  - Başlık, neden-müşteri kutusu ve yanıt taslağı arasında göz gezdirme mesafesi çok kısa.
  - Dar dizüstü ekranlarda (1280px) hiç sıkışma yaşanmaz.
- **Zayıf yanları:**
  - Günde 30–50 fırsatı seri biçimde tarayan ekiplerde dikey kaydırma daha fazladır.
- **Kimlere uygun:** KOBİ sahipleri, ürün kurucuları, günde 5–15 kaliteli fırsata odaklanan satışçılar.

## Seçenek 2 — Kompakt İki Sütunlu Fırsat + Yanıt Stüdyosu (`secenek-2.html`)
- **Fikir:** AppCook standart sol menü + Front/Attio tarzı **Split View** (sol sütunda yoğun fırsat akışı, sağ sütunda sabit `sticky` yanıt stüdyosu). Varsayılan koyu stüdyo atmosferi (tek tıkla açık temaya geçilebilir).
- **Güçlü yanları:**
  - Sol listede tek bakışta 4–6 fırsat görünür; tıklanan fırsat sağdaki sabit stüdyoda anında açılır.
  - AppCook sol menü standardıyla (`/yonetim` geçişi altta) birebir görsel bütünlük sağlar.
  - Mobilde karta tıklayınca tam ekran yanıt çekmecesi açılır, liste kaybolmaz.
- **Zayıf yanları:**
  - İlk kez gören teknik olmayan kullanıcıya Seçenek 1 kadar sade gelmeyebilir.
- **Kimlere uygun:** Günde onlarca fırsatı hızla işleyen iş geliştirme (BD) ve satış ekipleri.

---

## Esinlenilen Kaynaklar
- `C:\Projects\AppCook\standart\appcook-tema.css` (AppCook v2 renk belirteçleri, üst çubuk ve sol menü standardı)
- `C:\Projects\AI-CustomerHunter\docs\arastirma\appcook-uyum-ve-ceviri.md` (sadeleştirilmiş Türkçe/İngilizce terimler ve çeviri akışı)
- Front / Attio / SaaSFrame satış gelen kutusu (Lead Inbox) bölünmüş ekran ve satır içi YZ yanıt taslağı kalıpları
- W3C WCAG 2.2 (2.4.11 Odak Görünürlüğü, 2.5.8 Hedef Boyutu, 3.2.3 Tutarlı Gezinme)

---

## Önerim
**Hedef kitle "müşteri kovalayan sade satış/KOBİ kullanıcısı" olduğu için önerim: Seçenek 1 (`secenek-1.html`) — veya Seçenek 1'in aydınlık, sade kart diliyle Seçenek 2'nin AppCook sol menüsünün birleşimi.**

Gerekçe:
1. Seçenek 1, teknik jargondan uzaklaşma hedefini yalnızca kelimelerde değil **yerleşimde de** hissettiriyor; kullanıcı ekrana baktığı ilk 3 saniyede ne yapacağını ("Oku → Türkçe anlamını gör → Kopyala & Gönderiye Git") anlıyor.
2. Eğer ekip günde çok sayıda fırsatı seri işleyecekse ve mevcut AppCook sol menü alışkanlığını ana ekranda da sürdürmek istiyorsa **Seçenek 2** (isteğe bağlı varsayılan açık temayla) tercih edilebilir.
