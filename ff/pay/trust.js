/* trust.js — bloco de credibilidade compartilhado */
(function () {
  'use strict';

  const TESTIMONIALS = [
    { initials: 'LM', name: 'Lucas M.', city: 'São Paulo, SP', stars: 5,
      msg: 'Chegou em menos de 2 min no meu nick. Recarga na conta certinha, sem erro.' },
    { initials: 'AF', name: 'Ana F.', city: 'Rio de Janeiro, RJ', stars: 5,
      msg: 'Tava com medo de cair em golpe, mas paguei no PIX e os diamantes entraram na hora.' },
    { initials: 'RS', name: 'Rafael S.', city: 'Belo Horizonte, MG', stars: 5,
      msg: 'Já comprei 3x. Sempre funciona. Suporte responde rápido quando precisei.' }
  ];

  const LIVE_NOTIFICATIONS = [
    { name: 'Lucas', city: 'SP', pack: '2.180 Diamantes' },
    { name: 'Mariana', city: 'RJ', pack: '1.060 Diamantes' },
    { name: 'Pedro', city: 'MG', pack: '5.580 Diamantes' },
    { name: 'Camila', city: 'BA', pack: '106 Diamantes' },
    { name: 'Rafael', city: 'PR', pack: 'Pacote Lendário' },
    { name: 'Beatriz', city: 'RS', pack: '3.600 Diamantes' },
    { name: 'Gustavo', city: 'CE', pack: '1.060 Diamantes' },
    { name: 'Larissa', city: 'PE', pack: '2.180 Diamantes' }
  ];

  function starString(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function buildTrustBlock() {
    const items = [
      { icon: 'fa-lock', label: 'SSL 256', sub: 'Criptografado' },
      { icon: 'fa-shield-halved', label: 'LGPD', sub: 'Protegido',
        html: '<span class="lgpd-text"><span class="l-br">L</span><span class="l-gd">G</span><span class="l-pr">PD</span></span>' },
      { icon: 'fa-bolt', label: 'PIX', sub: 'Instantâneo' },
      { icon: 'fa-headset', label: 'Suporte', sub: '24/7' }
    ];

    const badgesHtml = items.map((b) => {
      const iconHtml = b.html ? b.html : `<i class="fa-solid ${b.icon}"></i>`;
      return `
        <div class="trust-badge">
          ${iconHtml}
          <span class="tb-label">${b.label}</span>
          <span class="tb-sub">${b.sub}</span>
        </div>
      `;
    }).join('');

    const ttHtml = TESTIMONIALS.map((t) => `
      <div class="testimonial">
        <div class="tt-avatar">${t.initials}</div>
        <div class="tt-body">
          <div class="tt-stars">${starString(t.stars)}</div>
          <div class="tt-name">${t.name} <span class="tt-verified"><i class="fa-solid fa-circle-check"></i> Verificado</span></div>
          <div class="tt-city"><i class="fa-solid fa-location-dot"></i> ${t.city}</div>
          <div class="tt-msg">"${t.msg}"</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="trust-block">

        <div class="partner-badge">
          <div class="pb-icon"><i class="fa-solid fa-handshake"></i></div>
          <div class="pb-text">
            <strong>Site Parceiro Oficial Garena</strong>
            <span>Recargas autorizadas e verificadas pela Garena Brasil</span>
          </div>
        </div>

        <div class="trust-badges">
          ${badgesHtml}
        </div>

        <div class="reclame-card">
          <div class="ra-logo">
            <img src="../images/ra-logo.png" alt="Reclame Aqui" loading="lazy">
          </div>
          <div class="ra-info">
            <div class="ra-title">
              Reputação <img src="../images/ra-name.svg" alt="Reclame Aqui" loading="lazy">
            </div>
            <div class="ra-sub">Selo RA1000 — empresas com ótimo atendimento</div>
          </div>
          <div class="ra-rating">
            <div class="ra-score">9.4</div>
            <div class="ra-stars">${starString(5)}</div>
            <div class="ra-label">EXCELENTE</div>
          </div>
        </div>

        <div class="ra-ra1000">
          <img src="../images/ra-ra1000.jpeg" alt="Selo RA1000" loading="lazy">
          <div class="ra-ra-text">
            <strong>Prêmio RA1000</strong>
            <span>Empresa com a melhor reputação no atendimento ao consumidor brasileiro.</span>
          </div>
        </div>

        <div class="guarantee-card">
          <div class="gs-seal">
            <img src="../images/selo-7-dias.png" alt="Selo 7 dias de garantia" loading="lazy">
          </div>
          <div class="gs-text">
            <strong>Garantia 7 dias</strong>
            <span>Não recebeu? Devolvemos 100% do valor, sem perguntas.</span>
          </div>
        </div>

        <div class="testimonials">
          <p class="tt-head"><i class="fa-solid fa-comments"></i> Quem comprou, aprovou</p>
          ${ttHtml}
        </div>

      </div>
    `;
  }

  function renderTrust(targetSelector) {
    const host = typeof targetSelector === 'string'
      ? document.querySelector(targetSelector)
      : targetSelector;
    if (!host) return;
    host.innerHTML = buildTrustBlock();
  }

  function startLiveToast() {
    if (window.__trustToastStarted) return;
    window.__trustToastStarted = true;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let i = 0;
    const toast = document.createElement('div');
    toast.className = 'live-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="lt-dot"></span>
      <div class="lt-icon"><i class="fa-solid fa-bolt"></i></div>
      <div class="lt-body"></div>
    `;
    document.body.appendChild(toast);

    const body = toast.querySelector('.lt-body');

    function show() {
      const n = LIVE_NOTIFICATIONS[i % LIVE_NOTIFICATIONS.length];
      const mins = Math.floor(Math.random() * 5) + 1;
      body.innerHTML = `
        <strong>${n.name}</strong> de ${n.city} acabou de comprar <strong>${n.pack}</strong>
        <small>há ${mins} min · pagamento confirmado</small>
      `;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        i++;
        setTimeout(show, 4500 + Math.random() * 3000);
      }, 3800);
    }

    setTimeout(show, 8000);
  }

  window.CheckoutTrust = { render: renderTrust, startLiveToast: startLiveToast };

  document.addEventListener('DOMContentLoaded', function () {
    const auto = document.querySelector('[data-trust-mount]');
    if (auto) renderTrust('[data-trust-mount]');
    startLiveToast();
  });
})();
