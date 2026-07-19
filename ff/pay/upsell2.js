// Upsell 2 — Garantia Anti-Revogação Garena (3 estados)
(function () {
  'use strict';

  const PRICE_INITIAL = 1490; // R$ 14,90 em cents
  const PRICE_LAST = 990;    // R$ 9,90 em cents

  // Flag única compartilhada entre os 3 botões de aceitar — evita double-click
  // gerando 2 PIX. Resetada em beforeunload/pagehide pra próxima sessão.
  let inFlight = false;
  function cleanupOnNavigate() { inFlight = false; }
  window.addEventListener('beforeunload', cleanupOnNavigate);
  window.addEventListener('pagehide', cleanupOnNavigate);

  // ============ Utils ============

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getUtmSuffix() {
    // Helper único (ff/pay/utm-shared.js).
    if (window.UtmShared && typeof window.UtmShared.getSuffix === 'function') {
      return window.UtmShared.getSuffix();
    }
    // Fallback inline.
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

  function getOrCreateClientRequestId(suffix) {
    // 1 chave por upsell. Persiste em sessionStorage pra sobreviver reload.
    const KEY = 'ff:crId:' + (suffix || 'up2');
    try {
      let id = sessionStorage.getItem(KEY);
      if (!id) {
        id = 'crid-' + (suffix || 'up2') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return 'crid-' + (suffix || 'up2') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    }
  }

  // ID da conta Free Fire — OBRIGATÓRIO no /api/pix/create (6-20 dígitos).
  function getPlayerId() {
    let id = '';
    try { id = (sessionStorage.getItem('ff:playerIdConfirmed') || '').replace(/\D/g, '').slice(0, 20); } catch {}
    if (!id) { try { id = (sessionStorage.getItem('ff:playerId') || '').replace(/\D/g, '').slice(0, 20); } catch {} }
    if (!id) {
      try {
        const p = JSON.parse(localStorage.getItem('player') || 'null');
        id = String((p && ((p.data && p.data.id) || (p.result && p.result.id) || p.id)) || '').replace(/\D/g, '').slice(0, 20);
      } catch {}
    }
    return id;
  }

  async function createPix({ priceCents, label, saleIdSuffix, idemKey }) {
    const customer = (window.CheckoutCustomer ? CheckoutCustomer.get() : { name: 'Cliente Garantia Garena', email: 'upsell2@temp.com', phone: '11999999999', document: '00000000000' });
    const crId = getOrCreateClientRequestId(idemKey || 'up2-' + saleIdSuffix);
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
        playerId: getPlayerId(),
        items: [{ id: 1, name: label, price: priceCents, qty: 1 }],
        totalCents: priceCents,
        utm: getUtmSuffix() || '',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `pix_create_failed_${resp.status}`);
    return data;
  }

  function goToUpsellPay(stageLabel, txData) {
    const parentTxId = encodeURIComponent(getQueryParam('parentTxId') || '');
    const utmQs = (getUtmSuffix() || '').replace(/^\?/, '');
    const amount = encodeURIComponent(txData.amount || '');
    const label = encodeURIComponent(txData.label || '');
    let url = `upsell2-pay.html?stage=${stageLabel}&parentTxId=${parentTxId}&amount=${amount}&label=${label}`;
    if (utmQs) url += `&${utmQs}`;
    url += `&txId=${encodeURIComponent(txData.transactionId)}&qr=${encodeURIComponent(txData.qrCodeBase64 || '')}&cp=${encodeURIComponent(txData.copyPaste)}&exp=${encodeURIComponent(txData.expiresAt || '')}`;
    window.location.href = url;
  }

  function goToObrigado() {
    const parentTxId = encodeURIComponent(getQueryParam('parentTxId') || '');
    const utmQs = (getUtmSuffix() || '').replace(/^\?/, '');
    let url = `obrigado.html?parentTxId=${parentTxId}`;
    if (utmQs) url += `&${utmQs}`;
    window.location.href = url;
  }

  function disable(el) {
    if (!el) return;
    el.disabled = true;
    // Captura innerHTML original pra restore() poder reverter
    if (el.dataset) el.dataset.originalHtml = el.innerHTML;
    el.innerHTML = '<span class="dot skeleton" style="width:14px;height:14px;border-radius:50%;display:inline-block;background:#fff;"></span> Gerando PIX...';
  }
  function restore(el, fallbackHtml) {
    if (!el) return;
    el.disabled = false;
    el.innerHTML = (el.dataset && el.dataset.originalHtml) ? el.dataset.originalHtml : (fallbackHtml || '');
  }

  // ============ Init ============

  document.addEventListener('DOMContentLoaded', () => {
    const problemCard = document.getElementById('problem-card');
    const solutionCard = document.getElementById('solution-card');
    const riskAlert = document.getElementById('risk-alert');
    const lastChance = document.getElementById('last-chance');

    // --- Stage 1: aceitar R$ 14,90 ---
    const accept1 = document.getElementById('btn-accept-upsell2');
    if (accept1) {
      accept1.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          disable(accept1);
          const tx = await createPix({
            priceCents: PRICE_INITIAL,
            label: 'Garantia Anti-Revogação Garena — R$ 14,90',
            saleIdSuffix: 'initial',
          });
          if (!tx || !tx.transactionId) throw new Error('pix_sem_transactionId');
          goToUpsellPay('initial', Object.assign({ amount: PRICE_INITIAL, label: 'Garantia Anti-Revogação Garena — R$ 14,90' }, tx));
          return; // não libera inFlight — vai navegar
        } catch (e) {
          inFlight = false;
          restore(accept1, '<i class="fa-solid fa-shield"></i> PROTEGER MINHA CONTA POR R$ 14,90');
          alert('Erro ao gerar PIX. Tente novamente.');
        }
      });
    }

    // --- Stage 1: recusar → mostra risk-alert, esconde solution ---
    const decline1 = document.getElementById('btn-decline-upsell2');
    if (decline1) {
      decline1.addEventListener('click', () => {
        if (solutionCard) solutionCard.style.display = 'none';
        if (riskAlert) riskAlert.style.display = 'block';
        riskAlert.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // --- Stage 2: aceitar R$ 14,90 (risk alert) ---
    const acceptRisk = document.getElementById('btn-accept-risk');
    if (acceptRisk) {
      acceptRisk.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          disable(acceptRisk);
          const tx = await createPix({
            priceCents: PRICE_INITIAL,
            label: 'Garantia Anti-Revogação Garena — R$ 14,90 (risco)',
            saleIdSuffix: 'risk',
          });
          if (!tx || !tx.transactionId) throw new Error('pix_sem_transactionId');
          goToUpsellPay('risk', Object.assign({ amount: PRICE_INITIAL, label: 'Garantia Anti-Revogação Garena — R$ 14,90' }, tx));
          return; // não libera inFlight
        } catch (e) {
          inFlight = false;
          restore(acceptRisk, '<i class="fa-solid fa-shield"></i> QUERO A GARANTIA — R$ 14,90');
          alert('Erro ao gerar PIX. Tente novamente.');
        }
      });
    }

    // --- Stage 2: recusar → mostra last-chance ---
    const declineRisk = document.getElementById('btn-decline-risk');
    if (declineRisk) {
      declineRisk.addEventListener('click', () => {
        if (riskAlert) riskAlert.style.display = 'none';
        if (lastChance) lastChance.style.display = 'block';
        lastChance.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // --- Stage 3: aceitar R$ 9,90 (last chance) ---
    const acceptLast = document.getElementById('btn-accept-last');
    if (acceptLast) {
      acceptLast.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          disable(acceptLast);
          const tx = await createPix({
            priceCents: PRICE_LAST,
            label: 'Garantia Anti-Revogação Garena — R$ 9,90 (última chance)',
            saleIdSuffix: 'lastchance',
          });
          if (!tx || !tx.transactionId) throw new Error('pix_sem_transactionId');
          goToUpsellPay('last', Object.assign({ amount: PRICE_LAST, label: 'Garantia Anti-Revogação Garena — R$ 9,90' }, tx));
          return; // não libera inFlight
        } catch (e) {
          inFlight = false;
          restore(acceptLast, '<i class="fa-solid fa-shield"></i> QUERO A GARANTIA POR R$ 9,90');
          alert('Erro ao gerar PIX. Tente novamente.');
        }
      });
    }

    // --- Stage 3: recusar → vai pro obrigado ---
    const declineLast = document.getElementById('btn-decline-last');
    if (declineLast) {
      declineLast.addEventListener('click', () => {
        goToObrigado();
      });
    }

    // Meta Pixel: ViewContent do upsell 2
    try {
      if (typeof fbq === 'function') {
        fbq('track', 'ViewContent', {
          content_category: 'garantia_garena',
          content_ids: ['upsell2'],
          value: PRICE_INITIAL / 100,
          currency: 'BRL',
        });
      }
    } catch {}
  });
})();
