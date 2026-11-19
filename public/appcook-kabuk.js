/* ============================================================================
   AppCook v2 — Ortak Kabuk Betiği (Tema Geçişi + 9-Nokta Uygulama Değiştirici)
   CSP 'self' uyumlu: satır içi olay işleyici (inline handler) içermez.
   Mevcut tema.js (localStorage anahtarı: "appcook-tema") ile tam uyumludur.
   ============================================================================ */
(function () {
  "use strict";

  var TEMA_ANAHTAR = "appcook-tema";
  var SVG_NS = "http://www.w3.org/2000/svg";

  var UYGULAMALAR = [
    { ad: "Ana Vitrin", alan: "appcook.store", adres: "https://appcook.store", renk: "#ff8a3d", vitrin: true },
    { ad: "AI-Transcript", alan: "transkript.appcook.store", adres: "https://transkript.appcook.store", renk: "#ff8a3d" },
    { ad: "AI-Colab", alan: "office.appcook.store", adres: "https://office.appcook.store", renk: "#9d6bff" },
    { ad: "AI-Analysis", alan: "malware.appcook.store", adres: "https://malware.appcook.store", renk: "#ec4f8c" },
    { ad: "AI-Draw", alan: "diyagram.appcook.store", adres: "https://diyagram.appcook.store", renk: "#3d9bff" },
    { ad: "AI-Coach", alan: "sinavkocu.appcook.store", adres: "https://sinavkocu.appcook.store", renk: "#2fc17e" },
    { ad: "AI-Task", alan: "task.appcook.store", adres: "https://task.appcook.store", renk: "#f2b230" },
    { ad: "AI-ServiceDesk", alan: "aiassistant.appcook.store", adres: "https://aiassistant.appcook.store", renk: "#3d9bff" },
    { ad: "AI-Shop", alan: "market.appcook.store", adres: "https://market.appcook.store", renk: "#ff8a3d" },
    { ad: "AI-CustomerHunter", alan: "customerhunter.appcook.store", adres: "https://customerhunter.appcook.store", renk: "#2fc17e" }
  ];

  /* --------------------------------------------------------------------------
     1. AÇIK / KOYU TEMA YÖNETİMİ
     -------------------------------------------------------------------------- */
  function kayitliTema() {
    try {
      var t = localStorage.getItem(TEMA_ANAHTAR);
      if (t === "acik" || t === "koyu") return t;
    } catch (e) {}
    return null;
  }

  function etkinTema() {
    var attr = document.documentElement.getAttribute("data-tema");
    if (attr === "acik" || attr === "koyu") return attr;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "acik";
    }
    return "koyu";
  }

  function temaUygula(tema, kaydet) {
    if (tema !== "acik" && tema !== "koyu") return;
    document.documentElement.setAttribute("data-tema", tema);
    if (kaydet) {
      try {
        localStorage.setItem(TEMA_ANAHTAR, tema);
      } catch (e) {}
    }
    temaDugmeleriniGuncelle();
  }

  function temaDegistir() {
    var yeni = etkinTema() === "acik" ? "koyu" : "acik";
    temaUygula(yeni, true);
    return yeni;
  }

  function temaDugmeleriniGuncelle() {
    var acikMi = etkinTema() === "acik";
    var dugmeler = document.querySelectorAll("[data-tema-dugme]");
    for (var i = 0; i < dugmeler.length; i++) {
      dugmeler[i].setAttribute("aria-pressed", String(acikMi));
      dugmeler[i].setAttribute("title", acikMi ? "Koyu temaya geç" : "Açık temaya geç");
    }
  }

  function temaDugmeleriniBagla() {
    var dugmeler = document.querySelectorAll("[data-tema-dugme]");
    for (var i = 0; i < dugmeler.length; i++) {
      var btn = dugmeler[i];
      if (btn.dataset.appcookTemaBagli === "1") continue;
      btn.dataset.appcookTemaBagli = "1";
      btn.addEventListener("click", temaDegistir);
    }
    temaDugmeleriniGuncelle();
  }

  /* Sayfa boyanmadan önce kayıtlı temayı hemen uygula (FOUC önleme) */
  var ilkTema = kayitliTema();
  if (ilkTema) {
    document.documentElement.setAttribute("data-tema", ilkTema);
  }

  window.AppCookTema = {
    oku: etkinTema,
    uygula: function (t) { temaUygula(t, true); },
    degistir: temaDegistir
  };

  /* --------------------------------------------------------------------------
     2. 9-NOKTA APPCOOK UYGULAMA DEĞİŞTİRİCİ (App Switcher)
     -------------------------------------------------------------------------- */
  function dokuzNoktaSvg() {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var koor = [3, 9.75, 16.5];
    for (var y = 0; y < koor.length; y++) {
      for (var x = 0; x < koor.length; x++) {
        var r = document.createElementNS(SVG_NS, "rect");
        r.setAttribute("x", String(koor[x]));
        r.setAttribute("y", String(koor[y]));
        r.setAttribute("width", "4.5");
        r.setAttribute("height", "4.5");
        r.setAttribute("rx", "1");
        svg.appendChild(r);
      }
    }
    return svg;
  }

  function kapatSvg() {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", "M18 6 6 18M6 6l12 12");
    svg.appendChild(p);
    return svg;
  }

  function mobilMi() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 719px)").matches);
  }

  function alanAdiEslesir(alan) {
    var mevcut = (window.location && window.location.hostname ? window.location.hostname : "")
      .toLowerCase()
      .replace(/^www\./, "");
    return mevcut === alan.toLowerCase();
  }

  function switcherOlustur(kap) {
    if (!kap || kap.dataset.appcookSwitcherKurulu === "1") return;
    kap.dataset.appcookSwitcherKurulu = "1";
    kap.classList.add("uyg-degistirici");

    var popId = "appcook-uyg-popover";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ikon hayalet uyg-degistirici-btn";
    btn.setAttribute("aria-label", "AppCook uygulamaları");
    btn.setAttribute("title", "Tüm AppCook uygulamaları");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", popId);
    btn.appendChild(dokuzNoktaSvg());

    var perde = document.createElement("div");
    perde.className = "uyg-perde";
    perde.hidden = true;
    perde.setAttribute("aria-hidden", "true");

    var pop = document.createElement("div");
    pop.className = "uyg-popover";
    pop.id = popId;
    pop.hidden = true;
    pop.setAttribute("role", "region");
    pop.setAttribute("aria-label", "AppCook uygulamaları");

    var tutamak = document.createElement("div");
    tutamak.className = "uyg-tutamak";
    tutamak.setAttribute("aria-hidden", "true");
    pop.appendChild(tutamak);

    var bas = document.createElement("div");
    bas.className = "uyg-popover-bas";

    var basYazi = document.createElement("span");
    basYazi.textContent = "AppCook Ekosistemi";
    bas.appendChild(basYazi);

    var basSag = document.createElement("div");
    basSag.className = "uyg-popover-bas-sag";

    var vitrin = UYGULAMALAR[0];
    var vitrinLink = document.createElement("a");
    vitrinLink.className = "uyg-popover-vitrin";
    vitrinLink.href = vitrin.adres;
    vitrinLink.textContent = vitrin.ad + " \u2192";
    if (alanAdiEslesir(vitrin.alan)) {
      vitrinLink.setAttribute("aria-current", "true");
    }
    basSag.appendChild(vitrinLink);

    var kapatBtn = document.createElement("button");
    kapatBtn.type = "button";
    kapatBtn.className = "btn ikon hayalet uyg-popover-kapat";
    kapatBtn.setAttribute("aria-label", "Kapat");
    kapatBtn.appendChild(kapatSvg());
    basSag.appendChild(kapatBtn);

    bas.appendChild(basSag);
    pop.appendChild(bas);

    var izgara = document.createElement("div");
    izgara.className = "uyg-popover-izgara";

    for (var i = 1; i < UYGULAMALAR.length; i++) {
      var u = UYGULAMALAR[i];
      var a = document.createElement("a");
      a.className = "uyg-popover-oge";
      a.href = u.adres;
      if (alanAdiEslesir(u.alan)) {
        a.setAttribute("aria-current", "true");
      }

      var nokta = document.createElement("span");
      nokta.className = "uyg-popover-nokta";
      nokta.style.setProperty("--uyg-renk", u.renk);
      nokta.setAttribute("aria-hidden", "true");

      var etiket = document.createElement("span");
      etiket.textContent = u.ad;

      a.appendChild(nokta);
      a.appendChild(etiket);
      izgara.appendChild(a);
    }

    pop.appendChild(izgara);
    kap.appendChild(btn);
    kap.appendChild(pop);
    document.body.appendChild(perde);

    var scrollKilitli = false;
    var oncekiOverflow = "";

    function scrollKilidiAyarla(kilitle) {
      if (kilitle && !scrollKilitli) {
        oncekiOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.body.classList.add("uyg-sheet-acik");
        scrollKilitli = true;
      } else if (!kilitle && scrollKilitli) {
        document.body.style.overflow = oncekiOverflow;
        document.body.classList.remove("uyg-sheet-acik");
        scrollKilitli = false;
      }
    }

    function konumEsitle(acik) {
      if (acik && mobilMi()) {
        /* .ust üzerindeki backdrop-filter fixed containing block yaratır; sheet'i body'ye taşı */
        if (pop.parentNode !== document.body) {
          document.body.appendChild(pop);
        }
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-modal", "true");
        perde.hidden = false;
        scrollKilidiAyarla(true);
      } else {
        if (pop.parentNode !== kap) {
          kap.appendChild(pop);
        }
        pop.setAttribute("role", "region");
        pop.removeAttribute("aria-modal");
        perde.hidden = true;
        scrollKilidiAyarla(false);
      }
    }

    function durumAyarla(acik) {
      pop.hidden = !acik;
      btn.setAttribute("aria-expanded", String(acik));
      konumEsitle(acik);
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      durumAyarla(pop.hidden);
    });

    kapatBtn.addEventListener("click", function () {
      durumAyarla(false);
      btn.focus();
    });

    perde.addEventListener("click", function () {
      durumAyarla(false);
      btn.focus();
    });

    pop.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) {
        durumAyarla(false);
      }
    });

    document.addEventListener("click", function (e) {
      if (!pop.hidden && !kap.contains(e.target) && !pop.contains(e.target)) {
        durumAyarla(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) {
        durumAyarla(false);
        btn.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (!pop.hidden) {
        konumEsitle(true);
      }
    });
  }

  function switcherKur() {
    var kap = document.querySelector("[data-appcook-switcher]");
    if (kap) {
      if (kap.getAttribute("data-appcook-switcher") === "yok") return;
      switcherOlustur(kap);
      return;
    }

    /* Açık konteyner yoksa ve üst çubukta .ust-sol varsa otomatik enjekte et */
    var ustSol = document.querySelector(".ust-sol");
    if (!ustSol || ustSol.querySelector(".uyg-degistirici")) return;
    if (ustSol.getAttribute("data-appcook-switcher") === "yok") return;

    var otoKap = document.createElement("div");
    otoKap.setAttribute("data-appcook-switcher", "");
    ustSol.insertBefore(otoKap, ustSol.firstChild);
    switcherOlustur(otoKap);
  }

  /* --------------------------------------------------------------------------
     3. YATAY KAYDIRMALI ŞERİT TAŞMA GÖZLEMCİSİ (data-tasma + scrollLeft)
     -------------------------------------------------------------------------- */
  function aktifOrtala(kap) {
    if (!kap || kap.scrollWidth <= kap.clientWidth + 1) return;
    var aktif = kap.querySelector('[aria-current="page"]');
    if (!aktif) return;
    var kapRect = kap.getBoundingClientRect();
    var aktifRect = aktif.getBoundingClientRect();
    var delta = (aktifRect.left + aktifRect.width / 2) - (kapRect.left + kapRect.width / 2);
    kap.scrollLeft += delta;
  }

  function tasmaIzle(kap) {
    if (!kap || kap.dataset.appcookTasmaBagli === "1") return function () {};
    kap.dataset.appcookTasmaBagli = "1";
    var bekliyor = false;

    function hesapla() {
      bekliyor = false;
      var ilkC = kap.firstElementChild;
      var sonC = kap.lastElementChild;
      if (!ilkC || kap.scrollWidth <= kap.clientWidth + 1) {
        kap.setAttribute("data-tasma", "");
        return;
      }
      var u = kap.getBoundingClientRect();
      var ilk = ilkC.getBoundingClientRect();
      var son = sonC.getBoundingClientRect();
      var sol = Math.min(ilk.left, son.left) < u.left - 1;
      var sag = Math.max(ilk.right, son.right) > u.right + 1;
      kap.setAttribute("data-tasma", sol && sag ? "iki" : sol ? "sol" : sag ? "sag" : "");
    }

    function iste() {
      if (bekliyor) return;
      bekliyor = true;
      requestAnimationFrame(hesapla);
    }

    kap.addEventListener("scroll", iste, { passive: true });
    window.addEventListener("resize", iste);
    if (typeof ResizeObserver === "function") {
      try {
        var ro = new ResizeObserver(iste);
        ro.observe(kap);
      } catch (e) {}
    }

    aktifOrtala(kap);
    hesapla();
    return iste;
  }

  function seritleriKur() {
    var seritler = document.querySelectorAll(".yonetim-menu nav, .ust-nav");
    for (var i = 0; i < seritler.length; i++) {
      tasmaIzle(seritler[i]);
    }
  }

  window.AppCookKabuk = {
    tasmaIzle: tasmaIzle,
    aktifOrtala: aktifOrtala
  };

  function baslat() {
    temaDugmeleriniBagla();
    switcherKur();
    seritleriKur();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baslat);
  } else {
    baslat();
  }
})();
