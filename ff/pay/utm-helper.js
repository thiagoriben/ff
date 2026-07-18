// Captura UTMs e click-ids da URL e mantém em sessionStorage
// pra reaproveitar em qualquer página mesmo se a URL perder os params
// (caso o user navegue sem query string ou se algum redirect limpar).

(function () {
  'use strict';
  var STORAGE_KEY = 'utm_params_v1';

  function pickParams() {
    var keys = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'utm_id', 'gclid', 'fbclid', 'gbraid', 'wbraid', 'ttclid', 'li_fat_id',
      'msclkid', 'dclid', 'xcod', 'sck', 'src'
    ];
    var out = {};
    try {
      var url = new URL(window.location.href);
      keys.forEach(function (k) {
        var v = url.searchParams.get(k);
        if (v) out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  function readStored() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function writeStored(obj) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function mergeFromUrl() {
    var stored = readStored();
    var fromUrl = pickParams();
    var merged = Object.assign({}, stored, fromUrl);
    writeStored(merged);
    return merged;
  }

  /**
   * Retorna string "?utm_source=...&utm_medium=..." pronta pra concatenar em URLs.
   * Lê sessionStorage primeiro (mais confiável), depois cai pra URL atual.
   */
  function getUtmSuffix() {
    var stored = readStored();
    var fromUrl = pickParams();
    var merged = Object.assign({}, stored, fromUrl);
    writeStored(merged);

    var keys = Object.keys(merged);
    if (!keys.length) return '';
    return '?' + keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(merged[k]);
    }).join('&');
  }

  window.UtmHelper = {
    getUtmSuffix: getUtmSuffix,
    pickParams: pickParams,
    readStored: readStored,
    mergeFromUrl: mergeFromUrl,
  };

  // Auto-captura ao carregar
  document.addEventListener('DOMContentLoaded', function () { mergeFromUrl(); });
  if (document.readyState !== 'loading') mergeFromUrl();
})();
