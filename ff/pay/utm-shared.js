// UTMS — helper único compartilhado por todo o funil de checkout/pay.
//
// Single source of truth para evitar as 8 cópias divergentes de getUtmSuffix()
// que existiam antes deste arquivo. Qualquer redirect ou fetch que precisar
// das UTMs DEVE usar este helper.
//
// Cadeia de fallback (em ordem de prioridade):
//   1. window.UtmFlow.getUtmSuffix()   — localStorage (persiste entre abas)
//   2. window.UtmHelper.getUtmSuffix() — sessionStorage (mesma sessão)
//   3. window.location.search          — query string atual da página
//   4. '' (vazio)                      — sem UTMs disponíveis
//
// API:
//
//   UtmShared.getSuffix()             → "?utm_source=...&utm_medium=..." OU ''
//   UtmShared.appendToUrl(url)        → "url?utm_source=..." ou "url&..." se já tem ?
//   UtmShared.getUtmObject()          → { utm_source: '...', fbclid: '...' } OU {}
//   UtmShared.hasAny()                → true/false
//
// Carregue este arquivo ANTES de qualquer outro script do pay/ que use UTMs
// (de preferência logo após utm-flow.js no <head>).

(function () {
  'use strict';

  function getSuffix() {
    try {
      if (window.UtmFlow && typeof window.UtmFlow.getUtmSuffix === 'function') {
        const s = window.UtmFlow.getUtmSuffix();
        if (s) return s;
      }
    } catch (e) { /* noop */ }
    try {
      if (window.UtmHelper && typeof window.UtmHelper.getUtmSuffix === 'function') {
        const s = window.UtmHelper.getUtmSuffix();
        if (s) return s;
      }
    } catch (e) { /* noop */ }
    try {
      const s = window.location && window.location.search;
      if (s && s.length > 0) return s;
    } catch (e) { /* noop */ }
    return '';
  }

  function appendToUrl(url) {
    if (!url) return url;
    const suffix = getSuffix();
    if (!suffix) return url;
    const cleanSuffix = suffix.replace(/^\?/, '');
    if (!cleanSuffix) return url;

    // Deduplica: não re-adiciona chaves que a URL de destino já possui.
    // Sem isso, o fallback getSuffix()=location.search reinjetava parentTxId/amt
    // a cada salto do funil, fazendo a query crescer indefinidamente.
    const existingKeys = new Set();
    const qIndex = url.indexOf('?');
    if (qIndex >= 0) {
      for (const part of url.slice(qIndex + 1).split('&')) {
        const k = part.split('=')[0];
        if (k) existingKeys.add(k);
      }
    }

    const toAppend = [];
    for (const part of cleanSuffix.split('&')) {
      if (!part) continue;
      const k = part.split('=')[0];
      if (k && !existingKeys.has(k)) {
        existingKeys.add(k);
        toAppend.push(part);
      }
    }
    if (toAppend.length === 0) return url;

    const connector = qIndex >= 0 ? '&' : '?';
    return url + connector + toAppend.join('&');
  }

  function getUtmObject() {
    const suffix = getSuffix(); // "?utm_source=x&fbclid=y"
    const obj = {};
    if (!suffix) return obj;
    const s = suffix.replace(/^\?/, '');
    if (!s) return obj;
    for (const part of s.split('&')) {
      const [k, v] = part.split('=');
      if (k && v) {
        try {
          obj[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch (e) {
          obj[k] = v;
        }
      }
    }
    return obj;
  }

  function hasAny() {
    return getSuffix().length > 0;
  }

  // Expor global ANTES do DOMContentLoaded pra que qualquer script possa usar.
  window.UtmShared = {
    getSuffix,
    appendToUrl,
    getUtmObject,
    hasAny,
  };
})();
