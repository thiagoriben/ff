// Helper compartilhado de UTMs - suporta macros do Meta com pipes ({{campaign.name}}|{{campaign.id}}).
// Mantém TODOS os parâmetros UTM_*, fbclid, gclid e click-ids intactos entre páginas.
// Storage em localStorage (persiste entre tabs do mesmo navegador) + sessionStorage (backup).

(function () {
  'use strict';

  var STORAGE_KEY = 'utm_flow_v2';
  var TRACKING_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'utm_id', 'utm_creative_format', 'utm_marketing_tactic',
    'fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'li_fat_id',
    'msclkid', 'dclid', 'xcod', 'sck', 'src', 'cid', 'epik', 'igshid'
  ];

  function pickFromUrl() {
    var out = {};
    try {
      var url = new URL(window.location.href);
      TRACKING_KEYS.forEach(function (k) {
        var v = url.searchParams.get(k);
        if (v) out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function writeStored(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  // Mescla URL > storage. URL tem prioridade (macro fresca).
  function refresh() {
    var stored = readStored();
    var fromUrl = pickFromUrl();
    var merged = Object.assign({}, stored, fromUrl);
    writeStored(merged);
    return merged;
  }

  // Retorna querystring começando com "?" com TODOS os params de tracking
  function getQueryString() {
    var merged = refresh();
    var keys = Object.keys(merged);
    if (!keys.length) return '';
    return keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(merged[k]);
    }).join('&');
  }

  function getUtmSuffix() {
    var qs = getQueryString();
    return qs ? '?' + qs : '';
  }

  function appendToUrl(url) {
    if (!url) return url;
    var qs = getQueryString();
    if (!qs) return url;
    // Se URL já tem ?, concatena com &; senão adiciona ?
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  window.UtmFlow = {
    refresh: refresh,
    getQueryString: getQueryString,
    getUtmSuffix: getUtmSuffix,
    appendToUrl: appendToUrl,
    pickFromUrl: pickFromUrl,
    readStored: readStored,
  };

  // Auto-refresh ao carregar + re-injeta UTMs na URL se elas existirem no storage
  function boot() {
    var merged = refresh();
    var currentUrl = new URL(window.location.href);
    var hasAnyUtm = false;
    TRACKING_KEYS.forEach(function (k) {
      if (currentUrl.searchParams.get(k)) hasAnyUtm = true;
    });

    // Se a URL atual não tem nenhuma UTM mas o storage sim, re-injeta na URL via replaceState.
    if (!hasAnyUtm && Object.keys(merged).length > 0) {
      Object.keys(merged).forEach(function (k) {
        currentUrl.searchParams.set(k, merged[k]);
      });
      try { window.history.replaceState(null, '', currentUrl.toString()); } catch (e) {}
    }
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
