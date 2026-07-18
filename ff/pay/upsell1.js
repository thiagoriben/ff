// Upsell 1 — Dobro de diamantes pela metade (stage 1) / 70% OFF (stage 2)
// Reusa CheckoutParte1 (cart), CheckoutUtils (helpers), UtmFlow/UtmHelper (UTMs).
(function () {
  'use strict';

  const HALF = 0.5;          // stage 1: pagar metade
  const STAGE2_MULT = 0.30;  // stage 2: 70% OFF = pagar 30%
  const TIMER_SECONDS = 300; // 5 min

  let timerSeconds = TIMER_SECONDS;
  let timerInterval = null;
  let stage = 1;
  let dataCtx = null; // { diamonds, totalCents, offerCents, qty }
  let inFlight = false; // Protege contra double-click gerando 2 PIX

  // ============ Init guard — sem cart, vai pro obrigado ============

  function getValidCart() {
    const cart = (window.CheckoutParte1 && CheckoutParte1.loadCart()) || null;
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0 || !(cart.total > 0)) {
      return null;
    }
    return cart;
  }

  function safeRedirectParte1() {
    // Sem cart no localStorage: usuário acessou direto (ex: link de teste).
    // Volta pra parte1.html pra refazer o fluxo. Não vai pro obrigado — usuário ainda não comprou nada.
    const utmQs = (getUtmSuffix() || '').replace(/^\?/, '');
    let url = `parte1.html`;
    if (utmQs) url += (url.includes('?') ? '&' : '?') + utmQs;
    window.location.replace(url);
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getUtmSuffix() {
    // Usa o helper único (ff/pay/utm-shared.js) que tem fallback chain completo.
    if (window.UtmShared && typeof window.UtmShared.getSuffix === 'function') {
      return window.UtmShared.getSuffix();
    }
    // Fallback inline se o helper canônico não carregou (não deveria acontecer).
    try {
      if (window.UtmFlow && typeof window.UtmFlow.getUtmSuffix === 'function') {
        const s = window.UtmFlow.getUtmSuffix();
        if (s) return s;
      }
    } catch {}
    try {
      if (window.UtmHelper && typeof window.UtmHelper.getUtmSuffix === 'function') {
        const s = window.UtmHelper.getUtmSuffix();
        if (s) return s;
      }
    } catch {}
    return window.location.search || '';
  }

  function collectUtm() {
    const p = new URLSearchParams(window.location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
      const v = p.get(k);
      if (v) utm[k] = v;
    });
    return utm;
  }

  function getDiamondsOnly() {
    const cart = (window.CheckoutParte1 && CheckoutParte1.loadCart()) || null;
    if (!cart || !Array.isArray(cart.items)) return [];
    return cart.items.filter((it) => {
      const id = String(it.id || '');
      const name = String(it.name || '').toLowerCase();
      // Aceita só pacotes ORIGINAIS de diamantes (productId do logado.html usa
      // prefixo "diamantes-"). EXCLUI up-tiles do parte1 (up-d100, up-d310, etc)
      // e popup upsell items (up-pop-*) — esses são extras, não o pacote base.
      // Sem esse filtro, o "dobro pela metade" somava os extras e oferecia
      // desconto errado.
      const isOriginalDiamonds =
        id.startsWith('diamantes-') ||
        id.startsWith('diamonds-') ||
        id === 'diamantes' ||
        id === 'diamonds';
      const nameLooksDiamond = name.includes('diamante') && !id.startsWith('up-');
      return isOriginalDiamonds || nameLooksDiamond;
    });
  }

  // ============ Render ============

  function renderStage1() {
    const diamonds = getDiamondsOnly();
    const cart = (window.CheckoutParte1 && CheckoutParte1.loadCart()) || { items: [], total: 0 };
    let totalCents = diamonds.reduce((s, it) => s + (it.total || it.price || 0), 0);
    let diamondsForList = diamonds;

    // Fallback: cart sem nenhum item marcado como diamante → mostra cart inteiro
    if (!diamonds.length && cart.items && cart.items.length) {
      diamondsForList = cart.items;
      totalCents = cart.total || 0;
    }

    const offerCents = Math.round(totalCents * HALF);
    const qty = diamondsForList.reduce((s, it) => s + (it.qty || 1), 0);

    const list = document.getElementById('diamonds-list');
    if (list) {
      const fmt = (window.CheckoutUtils && CheckoutUtils.formatBRLFromCents) || ((c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);
      const esc = (window.CheckoutUtils && CheckoutUtils.escapeHtml) || ((s) => String(s || ''));
      list.innerHTML = diamondsForList.map((it) => `
        <div class="cart-item">
          <div class="info">
            <strong>${esc(it.name)}</strong>
            <span>${fmt(it.price)} <span class="qty">x${it.qty || 1}</span></span>
          </div>
          <div class="price">${fmt(it.total || it.price)}</div>
        </div>
      `).join('');
    }

    const totalEl = document.getElementById('diamonds-total');
    if (totalEl) totalEl.textContent = (window.CheckoutUtils ? CheckoutUtils.formatBRLFromCents(totalCents) : `R$ ${(totalCents / 100).toFixed(2).replace('.', ',')}`);

    const newPriceEl = document.getElementById('price-new');
    if (newPriceEl) newPriceEl.textContent = (window.CheckoutUtils ? CheckoutUtils.formatBRLFromCents(offerCents) : `R$ ${(offerCents / 100).toFixed(2).replace('.', ',')}`);
    const oldEl = document.getElementById('price-old');
    if (oldEl) oldEl.textContent = (window.CheckoutUtils ? CheckoutUtils.formatBRLFromCents(totalCents) : `R$ ${(totalCents / 100).toFixed(2).replace('.', ',')}`);

    return { diamonds, totalCents, offerCents, qty };
  }

  // ============ Timer ============

  function startTimer(initialSec, onExpire) {
    timerSeconds = initialSec;
    const el = document.getElementById('upsell1-countdown');
    function tick() {
      const m = Math.floor(timerSeconds / 60);
      const s = timerSeconds % 60;
      if (el) el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (timerSeconds <= 0) {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        onExpire();
        return;
      }
      timerSeconds--;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

  // ============ Cancelar tudo antes de sair da página ============
  // Garante que o timer do upsell para quando o cliente navega (ex: clica em aceitar
  // e o redirect dispara — sem isso o timer continuaria tickando em background).
  function cleanupOnNavigate() {
    stopTimer();
    inFlight = false;
  }
  window.addEventListener('beforeunload', cleanupOnNavigate);
  window.addEventListener('pagehide', cleanupOnNavigate);

  // ============ Criar PIX (reaproveita /api/pix/create) ============

  function getOrCreateClientRequestId(suffix) {
    // 1 chave por upsell (1, 2) pra não colidir entre estágios. Persiste em
    // sessionStorage pra sobreviver reload rápido do cliente.
    const KEY = 'ff:crId:' + (suffix || 'up1');
    try {
      let id = sessionStorage.getItem(KEY);
      if (!id) {
        id = 'crid-' + (suffix || 'up1') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return 'crid-' + (suffix || 'up1') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    }
  }

  async function createUpsellPix({ offerCents, label, idemKey }) {
    const customer = (window.CheckoutCustomer ? CheckoutCustomer.get() : { name: 'Cliente Upsell 1', email: 'upsell1@temp.com', phone: '11999999999', document: '00000000000' });
    const crId = getOrCreateClientRequestId(idemKey || 'up1-stage' + stage);
    const resp = await fetch('/api/pix/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crId,
      },
      body: JSON.stringify({
        clientRequestId: crId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: customer.document,
        items: [{ id: `up1-stage${stage}`, name: label, price: offerCents, qty: 1 }],
        totalCents: offerCents,
        utm: getUtmSuffix() || '',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `pix_create_failed_${resp.status}`);
    return data;
  }

  // ============ Navegar pro upsell-pay ============

  function goToUpsellPay(stageNum, txData) {
    const parentTxId = encodeURIComponent(getQueryParam('parentTxId') || '');
    const utmQs = (getUtmSuffix() || '').replace(/^\?/, '');
    const offerAmount = encodeURIComponent(txData.offerCents || '');
    const offerLabel = encodeURIComponent(txData.offerLabel || '');
    let url = `upsell1-pay.html?stage=${stageNum}&parentTxId=${parentTxId}&offer=${offerAmount}&label=${offerLabel}`;
    if (utmQs) url += `&${utmQs}`;
    url += `&txId=${encodeURIComponent(txData.transactionId)}&qr=${encodeURIComponent(txData.qrCodeBase64 || '')}&cp=${encodeURIComponent(txData.copyPaste)}&exp=${encodeURIComponent(txData.expiresAt || '')}`;
    window.location.href = url;
  }

  function goToUpsell2() {
    const parentTxId = encodeURIComponent(getQueryParam('parentTxId') || '');
    const utmQs = (getUtmSuffix() || '').replace(/^\?/, '');
    let url = `upsell2.html?parentTxId=${parentTxId}`;
    if (utmQs) url += `&${utmQs}`;
    window.location.href = url;
  }

  // ============ Stage 2 — 70% OFF (recusa OU timer zerado) ============

  function showStage2(totalCents) {
    stage = 2;
    stopTimer();
    const newOffer = Math.round(totalCents * STAGE2_MULT);

    const fmt = window.CheckoutUtils ? CheckoutUtils.formatBRLFromCents : (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;

    const headlineEl = document.querySelector('.upsell-copy .copy-headline');
    if (headlineEl) headlineEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> VOCÊ ESTÁ DESPERDIÇANDO SUA ÚNICA CHANCE';

    const subEl = document.querySelector('.upsell-copy .sub');
    if (subEl) subEl.textContent = 'Esta é a última vez que este desconto aparecerá. Se recusar, você perde a chance pra sempre.';

    const newPriceEl = document.getElementById('price-new');
    if (newPriceEl) newPriceEl.textContent = fmt(newOffer);
    const oldEl = document.getElementById('price-old');
    if (oldEl) oldEl.textContent = fmt(totalCents);

    const acceptBtn = document.getElementById('btn-accept-upsell1');
    if (acceptBtn) {
      acceptBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> QUERO APROVEITAR — 70% OFF AGORA';
      const newBtn = acceptBtn.cloneNode(true);
      acceptBtn.parentNode.replaceChild(newBtn, acceptBtn);
      newBtn.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          newBtn.disabled = true;
          newBtn.innerHTML = '<span class="dot skeleton" style="width:14px;height:14px;border-radius:50%;display:inline-block;background:#fff;"></span> Gerando PIX...';
          const tx = await createUpsellPix({ offerCents: newOffer, label: 'Dobro Diamantes — 70% OFF' });
          if (!tx || !tx.transactionId) {
            throw new Error('pix_sem_transactionId');
          }
          goToUpsellPay(2, Object.assign({ offerCents: newOffer, offerLabel: 'Dobro Diamantes — 70% OFF' }, tx));
          // marca como submetido — não libera inFlight no catch
          return;
        } catch (e) {
          inFlight = false;
          newBtn.disabled = false;
          newBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> QUERO APROVEITAR — 70% OFF AGORA';
          alert('Erro ao gerar PIX. Tente novamente.');
        }
      });
    }

    const declineBtn = document.getElementById('btn-decline-upsell1');
    if (declineBtn) {
      declineBtn.textContent = 'Não, perder essa oferta pra sempre';
      const newDecline = declineBtn.cloneNode(true);
      declineBtn.parentNode.replaceChild(newDecline, declineBtn);
      newDecline.addEventListener('click', () => {
        goToUpsell2();
      });
    }
  }

  // ============ INIT ============

  document.addEventListener('DOMContentLoaded', () => {
    // Guard: sem cart válido no localStorage, não tem como montar oferta.
    // Volta pro parte1.html pra usuário refazer o checkout (não pro obrigado — não comprou nada).
    const validCart = getValidCart();
    if (!validCart) {
      safeRedirectParte1();
      return;
    }

    dataCtx = renderStage1();

    // Aceitar (stage 1)
    const acceptBtn = document.getElementById('btn-accept-upsell1');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          acceptBtn.disabled = true;
          acceptBtn.innerHTML = '<span class="dot skeleton" style="width:14px;height:14px;border-radius:50%;display:inline-block;background:#fff;"></span> Gerando PIX...';
          const tx = await createUpsellPix({ offerCents: dataCtx.offerCents, label: 'Dobro Diamantes — 50% OFF' });
          if (!tx || !tx.transactionId) {
            throw new Error('pix_sem_transactionId');
          }
          goToUpsellPay(1, Object.assign({ offerCents: dataCtx.offerCents, offerLabel: 'Dobro Diamantes — 50% OFF' }, tx));
          return; // não libera inFlight — vai navegar
        } catch (e) {
          inFlight = false;
          acceptBtn.disabled = false;
          acceptBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> QUERO O DOBRO DE DIAMANTES AGORA';
          alert('Erro ao gerar PIX. Tente novamente.');
        }
      });
    }

    // Recusar (stage 1) → stage 2
    const declineBtn = document.getElementById('btn-decline-upsell1');
    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        showStage2(dataCtx.totalCents);
      });
    }

    // Timer 5min → se zerar, vai pro stage 2 automaticamente
    startTimer(TIMER_SECONDS, () => {
      showStage2(dataCtx.totalCents);
    });

    // Meta Pixel: ViewContent do upsell
    try {
      if (typeof fbq === 'function') {
        fbq('track', 'ViewContent', {
          content_category: 'upsell_diamantes',
          content_ids: ['upsell1'],
          value: dataCtx.offerCents / 100,
          currency: 'BRL',
        });
      }
    } catch {}
  });
})();
