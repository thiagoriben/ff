// pixel-bootstrap.js
// Garante que o Meta Pixel (fbq) seja carregado e que PageView seja disparado
// mesmo se o script demorar a carregar. Funciona em todas as páginas do funil.

(function () {
  'use strict';

  function waitForFbq(timeoutMs) {
    return new Promise((resolve) => {
      var started = Date.now();
      (function poll() {
        if (typeof window.fbq === 'function') return resolve(true);
        if (Date.now() - started > (timeoutMs || 4000)) return resolve(false);
        setTimeout(poll, 60);
      })();
    });
  }

  function firePageView() {
    if (typeof window.fbq !== 'function') return;
    try {
      window.fbq('track', 'PageView');
    } catch (e) { /* noop */ }
  }

  // Estratégia 1: dispara imediatamente se fbq já estiver pronto
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    waitForFbq(4000).then(firePageView);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      waitForFbq(4000).then(firePageView);
    });
  }

  // Estratégia 2: fallback pra quando o script terminar de carregar depois
  // (caso o wait acima falhe por causa de throttling).
  window.addEventListener('load', function () {
    setTimeout(firePageView, 150);
  });
})();
