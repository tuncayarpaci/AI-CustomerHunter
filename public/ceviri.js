(function () {
  'use strict';

  var STORAGE_KEY = 'ch-lang';
  var SUPPORTED = ['tr', 'en'];

  function normalize(lang) {
    var l = String(lang || '').trim().toLowerCase().slice(0, 2);
    return SUPPORTED.indexOf(l) !== -1 ? l : 'tr';
  }

  function readSaved() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('appcook_dil');
      if (saved) return normalize(saved);
    } catch (e) {}
    return 'tr';
  }

  var currentLang = readSaved();

  function t(key, vars) {
    var dict = (window.CH_I18N && window.CH_I18N[currentLang]) || (window.CH_I18N && window.CH_I18N.tr) || {};
    var str = dict[key] || ((window.CH_I18N && window.CH_I18N.tr && window.CH_I18N.tr[key]) || key);
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return str;
  }

  function applyDomTranslations() {
    document.documentElement.lang = currentLang;
    document.title = t('page_title');
    document.querySelectorAll('[data-t]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-t'));
    });
    document.querySelectorAll('[data-t-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-t-placeholder')));
    });
    document.querySelectorAll('[data-t-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-t-title')));
    });
  }

  function setLang(lang) {
    currentLang = normalize(lang);
    try {
      localStorage.setItem(STORAGE_KEY, currentLang);
    } catch (e) {}
    window.__appcookLang = currentLang;
    applyDomTranslations();
    return currentLang;
  }

  window.__appcookLang = currentLang;
  window.CHI18n = {
    SUPPORTED: SUPPORTED,
    getLang: function () { return currentLang; },
    setLang: setLang,
    t: t,
    applyDom: applyDomTranslations
  };
})();
