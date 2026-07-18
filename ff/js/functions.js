// functions.js — propagação de tracking params na loja (/ff/index.html).
// Usa UtmFlow (que persiste em localStorage) como fonte primária pra suportar
// macros do Meta com pipes ({{campaign.name}}|{{campaign.id}}).

document.addEventListener('DOMContentLoaded', function () {
  // Se UtmFlow estiver disponível, deixa ele cuidar de tudo (URL + storage).
  if (window.UtmFlow && typeof window.UtmFlow.refresh === 'function') {
    window.UtmFlow.refresh();
    return;
  }

  // Fallback legado (caso UtmFlow não tenha carregado)
  const params = new URLSearchParams(window.location.search);
  const googleData = JSON.parse(localStorage.getItem('google')) || {};

  params.forEach((value, key) => {
    googleData[key] = value;
    if (value) {
      localStorage.setItem(key, value);
    }
  });

  if (!googleData.utm_source) {
    googleData.utm_source = 'organic';
  }

  localStorage.setItem('google', JSON.stringify(googleData));
  localStorage.setItem('tracking_params', JSON.stringify(googleData));
  const newParams = Object.entries(googleData)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  localStorage.setItem('utm_raw_query', newParams);

  const baseUrl = window.location.origin + window.location.pathname;
  const newUrl = `${baseUrl}?${newParams}`;

  if (window.location.href !== newUrl) {
    window.history.replaceState(null, '', newUrl);
  }
});
