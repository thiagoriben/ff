// Checkout.js - lógica compartilhada entre parte1.html e parte2.html
// Mobile-first, sem dependências externas.

(function () {
  'use strict';

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const STORAGE_KEY = 'selectedItems';
  const SESSION_KEY = 'pendingTxId';

  // === Estilos do overlay "Gerando PIX" ===
  (function ensureGeneratingStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('pix-generating-style')) return;
    const style = document.createElement('style');
    style.id = 'pix-generating-style';
    style.textContent = `
      #pix-generating-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(15, 15, 20, 0.78);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        animation: pixGenFade .18s ease-out;
      }
      @keyframes pixGenFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .pix-gen-card {
        background: #fff;
        border-radius: 16px;
        padding: 28px 24px;
        max-width: 360px;
        width: 100%;
        text-align: center;
        box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        font-family: inherit;
      }
      body[data-theme="dark"] .pix-gen-card,
      .dark .pix-gen-card {
        background: #18181f;
        color: #f4f4f5;
      }
      .pix-gen-spinner {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        border: 4px solid rgba(255,106,0,0.18);
        border-top-color: #ff6a00;
        border-radius: 50%;
        animation: pixGenSpin .8s linear infinite;
      }
      @keyframes pixGenSpin {
        to { transform: rotate(360deg); }
      }
      .pix-gen-title {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .pix-gen-sub {
        font-size: 0.85rem;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);
  })();

  // === Overlay "Gerando PIX" ===
  function showGeneratingOverlay() {
    if (document.getElementById('pix-generating-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pix-generating-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="pix-gen-card">
        <div class="pix-gen-spinner" aria-hidden="true"></div>
        <div class="pix-gen-title">Gerando PIX...</div>
        <div class="pix-gen-sub">Aguarde alguns segundos, não feche esta tela.</div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }
  function hideGeneratingOverlay() {
    const overlay = document.getElementById('pix-generating-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
  }

  function formatBRLFromCents(cents) {
    if (!Number.isFinite(cents)) return 'R$ 0,00';
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  }

  // === Idempotency key: 1x por sessão, persiste em sessionStorage ===
  // Garante que double-click / retry por 504 não criem 2 PIXs na Duttyfy.
  // O backend usa esse ID pra devolver a mesma venda em vez de criar outra.
  function getOrCreateClientRequestId() {
    const KEY = 'ff:clientRequestId';
    try {
      let id = sessionStorage.getItem(KEY);
      if (!id) {
        // UUID v4 simples (sem crypto.randomUUID pra suportar contextos antigos)
        id = 'crid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      // sessionStorage indisponível: usa ID em memória (sobrevive só até reload)
      return 'crid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    }
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function savePendingTxId(id) {
    try { sessionStorage.setItem(SESSION_KEY, id); } catch {}
  }

  function getPendingTxId() {
    try { return sessionStorage.getItem(SESSION_KEY) || null; } catch { return null; }
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getUtmSuffix() {
    // Helper único (ff/pay/utm-shared.js) — fallback chain UtmFlow > UtmHelper > URL.
    // Mantém compat com callers antigos; usa a implementação canônica.
    if (window.UtmShared && typeof window.UtmShared.getSuffix === 'function') {
      return window.UtmShared.getSuffix();
    }
    return getUtmSuffixLegacy();
  }

  // Implementação legacy inline — usada apenas se utm-shared.js não carregou (deve carregar sempre).
  function getUtmSuffixLegacy() {
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
    const search = window.location.search;
    return search && search.length > 0 ? search : '';
  }

  // (cleanup listeners abaixo — antesunload + pagehide — estão no fim do IIFE junto com stopPolling)

  function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }

  function hideError(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }

  function validateEmail(str) {
    return EMAIL_REGEX.test(String(str || '').trim());
  }

  // ============ PARTE 1 ============

  window.CheckoutParte1 = {
    loadCart,
    renderSummary(cart) {
      const list = document.getElementById('cart-list');
      const totalEl = document.getElementById('cart-total');
      if (!list || !totalEl) return;
      list.innerHTML = '';
      cart.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div class="info">
            <strong>${escapeHtml(it.name)}</strong>
            <span>${formatBRLFromCents(it.price)} <span class="qty">x${it.qty}</span></span>
          </div>
          <div class="price">${formatBRLFromCents(it.total)}</div>
        `;
        list.appendChild(row);
      });
      totalEl.textContent = formatBRLFromCents(cart.total);
    },

    bindUpsells(baseCart) {
      // Promoção 9 Anos — botão.tile selecionado adiciona ao resumo
      const tiles = document.querySelectorAll('button.up-tile');
      if (!tiles.length) return;

      const cartTotalEl = document.getElementById('cart-total');
      const cartTotalFooterEl = document.getElementById('cart-total-footer');
      const baseTotal = baseCart.total;

      function refresh() {
        const extras = [];
        tiles.forEach((tile) => {
          if (tile.classList.contains('active')) {
            const priceCents = Math.round(parseFloat(tile.dataset.price) * 100);
            extras.push({
              id: tile.dataset.id,
              productId: tile.dataset.id,
              name: tile.dataset.name,
              price: priceCents,
              qty: 1,
              total: priceCents,
            });
          }
          tile.classList.toggle('active', tile.classList.contains('active'));
        });

        const extra = extras.reduce((sum, e) => sum + e.total, 0);
        const newTotal = baseTotal + extra;

        if (cartTotalEl) cartTotalEl.textContent = formatBRLFromCents(newTotal);
        if (cartTotalFooterEl) cartTotalFooterEl.textContent = formatBRLFromCents(newTotal);

        // Atualiza o cart em memória + localStorage + re-renderiza resumo do pedido
        const merged = JSON.parse(JSON.stringify(baseCart));
        merged.items = merged.items.concat(extras);
        merged.total = newTotal;
        localStorage.setItem('selectedItems', JSON.stringify(merged));

        // Re-renderiza o resumo incluindo os extras
        const list = document.getElementById('cart-list');
        if (list) {
          const originalHtml = list.dataset.originalHtml || list.innerHTML;
          list.dataset.originalHtml = originalHtml;
          let html = originalHtml;
          extras.forEach((e) => {
            html += `
              <div class="cart-item">
                <div class="info">
                  <strong>${escapeHtml(e.name)}</strong>
                  <span>${formatBRLFromCents(e.price)} <span class="qty">x1</span></span>
                </div>
                <div class="price">${formatBRLFromCents(e.total)}</div>
              </div>`;
          });
          list.innerHTML = html;
        }
      }

      tiles.forEach((tile) => {
        tile.addEventListener('click', (e) => {
          e.preventDefault();
          tile.classList.toggle('active');
          refresh();
        });
      });
    },

    bindForm() {
      const initialCart = loadCart();
      if (!initialCart) {
        // sem carrinho, volta pro /ff/
        window.location.replace('../../index.html' + getUtmSuffix());
        return;
      }
      this.renderSummary(initialCart);

      // Pre-fill dos inputs só se o customer.js tem dados REAIS (não os placeholders fake).
      // O customer.js gera "clienteffXXXX@gmail.com" como placeholder para tracking.
      // Pré-preencher isso no campo email é um bug crítico (usuário vê dado fake e
      // às vezes nem percebe, manda com email errado).
      // Só pré-preenchemos se o email salvo foi digitado pelo usuário (NÃO é o slug).
      if (window.CheckoutCustomer) {
        const prev = CheckoutCustomer.get();
        const slug = prev && prev.slug ? String(prev.slug) : '';
        const slugLower = slug.toLowerCase();
        // Email real: tem @ E o nome local NÃO é o slug do customer
        const localPart = prev && prev.email ? String(prev.email).split('@')[0] : '';
        const isRealEmail = prev && prev.email && /@/.test(prev.email) && localPart && localPart.toLowerCase() !== slugLower;
        if (isRealEmail) {
          const e = document.getElementById('email');
          if (e && !e.value) e.value = prev.email;
        }
        // Telefone real: tem 10-13 dígitos E não é o fake gerado pelo customer.js.
        // O fake do customer é: '11' + tail.slice(0, 9), onde tail tem 10 chars
        // (6 timestamp + 4 random). tail = slug.slice('clienteff'.length) = slug.slice(9).
        if (prev && prev.phone && /^\d{10,13}$/.test(prev.phone)) {
          const tailFromSlug = slugLower.startsWith('clienteff') && slug.length > 9 ? slug.slice(9) : '';
          // O fakePhone usa só os 9 primeiros chars do tail.
          const fakePhone = tailFromSlug.length >= 9 ? ('11' + tailFromSlug.slice(0, 9)) : '';
          const isRealPhone = prev.phone !== fakePhone;
          if (isRealPhone) {
            const p = document.getElementById('phone');
            if (p && !p.value) p.value = prev.phone;
          }
        }
      }

      const form = document.getElementById('email-form');
      const emailInput = document.getElementById('email');
      const phoneInput = document.getElementById('phone');
      const submitBtn = document.getElementById('submit-btn');
      const submitLabel = document.getElementById('submit-label');
      const upsellSection = document.getElementById('upsell-section');

      // === Estado do botão: opaco até email+telefone OK ===
      function syncSubmitState() {
        const email = emailInput ? emailInput.value.trim() : '';
        const phoneDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
        const emailOk = validateEmail(email);
        const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 13;

        if (emailOk && phoneOk) {
          submitBtn.classList.remove('is-disabled');
          submitBtn.removeAttribute('data-disabled');
          submitBtn.removeAttribute('aria-disabled');
          submitBtn.disabled = false;
          submitBtn.style.cursor = 'pointer';
          if (submitLabel) submitLabel.textContent = 'Continuar pra pagamento';

          // Revela o upsell (uma vez só, sem autoscroll)
          if (upsellSection && upsellSection.hidden) {
            upsellSection.hidden = false;
            upsellSection.style.animation = 'fadeIn 0.4s ease';
          }
        } else {
          submitBtn.classList.add('is-disabled');
          submitBtn.setAttribute('data-disabled', 'true');
          submitBtn.setAttribute('aria-disabled', 'true');
          submitBtn.disabled = true;
          submitBtn.style.cursor = 'not-allowed';
          if (submitLabel) submitLabel.textContent = 'Preencha os dados pra continuar';
        }
      }

      // Segurança: se o form for <form>, captura submit nativo e previne reload.
      if (form && form.tagName === 'FORM') {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          e.stopPropagation();
          return false;
        });
      }

      // Máscara simples de telefone BR (fixo 10 ou celular 11)
      if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
          let v = e.target.value.replace(/\D/g, '').slice(0, 11);
          if (v.length === 10) v = v.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
          else if (v.length === 11) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
          else if (v.length > 6) v = v.replace(/^(\d{2})(\d{5})(\d{0,4})$/, '($1) $2-$3');
          else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
          else if (v.length > 0) v = v.replace(/^(\d{0,2})$/, '($1');
          e.target.value = v;
          syncSubmitState();
        });
      }
      if (emailInput) {
        emailInput.addEventListener('input', syncSubmitState);
      }

      // Estado inicial (caso o browser tenha preenchido auto)
      setTimeout(syncSubmitState, 100);

      function collectUtm() {
        const params = new URLSearchParams(window.location.search);
        const utm = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
          const v = params.get(k);
          if (v) utm[k] = v;
        });
        return utm;
      }

      // Debounce: impede duplo clique/submit acidental.
      let inFlight = false;
      let submitted = false;

      async function handleContinue() {
        if (inFlight) return;
        inFlight = true;
        hideError('form-error');

        try {
          const email = emailInput.value.trim();
          const phoneDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';

          if (!validateEmail(email)) {
            showError('form-error', 'E-mail inválido. Verifique e tente novamente.');
            emailInput.focus();
            return;
          }
          if (phoneDigits.length < 10 || phoneDigits.length > 13) {
            showError('form-error', 'Telefone inválido. Digite o DDD + número (ex: 11 99999-9999).');
            phoneInput && phoneInput.focus();
            return;
          }

          submitBtn.disabled = true;
          submitBtn.classList.add('is-disabled');
          submitBtn.setAttribute('data-disabled', 'true');
          submitBtn.setAttribute('aria-disabled', 'true');
          submitBtn.style.cursor = 'not-allowed';
          submitBtn.innerHTML = '<span class="dot skeleton" style="width:14px;height:14px;border-radius:50%;display:inline-block;background:#fff;"></span> Gerando PIX...';

          // Salva dados reais do cliente (email + telefone) no customer.js
          // pra que upsells e retries usem esses valores em vez do clienteff fake.
          // Mantém o slug e o document (CPF placeholder).
          if (window.CheckoutCustomer) {
            CheckoutCustomer.set({ email: email, phone: phoneDigits });
          }

          // ID da conta Free Fire que vai receber os diamantes (já confirmado em parte1.html)
          const playerId = (() => {
            try { return (sessionStorage.getItem('ff:playerIdConfirmed') || '').replace(/\D/g, '').slice(0, 20); }
            catch { return ''; }
          })();

          // === POPUP UPSELL ANTES DE PROSSEGUIR ===
          const upsellSelected = await openUpsellPopup();

          // RE-CARREGA o cart do localStorage DEPOIS do upsell (bindUpsells pode ter alterado)
          const freshCart = loadCart();
          if (!freshCart) {
            showError('form-error', 'Seu carrinho foi perdido. Volte e refaça a compra.');
            return;
          }

          // Aplica upsells selecionados ao cart recarregado
          let finalCart = JSON.parse(JSON.stringify(freshCart));
          if (upsellSelected && upsellSelected.length > 0) {
            finalCart.items = finalCart.items.concat(upsellSelected);
            finalCart.total = finalCart.items.reduce((sum, i) => sum + (i.total || i.price), 0);
            localStorage.setItem('selectedItems', JSON.stringify(finalCart));
          }

          showGeneratingOverlay();
          const resp = await fetch('/api/pix/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': getOrCreateClientRequestId(),
            },
            body: JSON.stringify({
              clientRequestId: getOrCreateClientRequestId(),
              // Usa o valor ATUALIZADO do customer.js (que acabou de receber set()
              // com email/telefone reais). Fallback pros inputs caso CheckoutCustomer
              // não esteja carregado.
              name: (window.CheckoutCustomer ? CheckoutCustomer.get().name : 'Cliente Recarga Free Fire'),
              email: email || (window.CheckoutCustomer ? CheckoutCustomer.get().email : ''),
              phone: phoneDigits || (window.CheckoutCustomer ? CheckoutCustomer.get().phone : ''),
              document: (window.CheckoutCustomer ? CheckoutCustomer.get().document : '00000000000'),
              playerId: playerId,
              items: finalCart.items.map((it) => ({
                id: it.id,
                name: it.name,
                price: it.price,
                qty: it.qty,
              })),
              totalCents: finalCart.total,
              // Pega UTMs propagadas via UtmFlow/UtmHelper (sessionStorage).
              // Se a URL atual (parte1.html) não tem UTMs (porque foram consumidas
              // na landing), ainda assim elas vêm daqui. Manda como string crua
              // "?utm_source=...&utm_medium=..." — o backend parseia pra objeto.
              utm: getUtmSuffix() || '',
            }),
            signal: AbortSignal.timeout(60_000),
          });

          const data = await resp.json().catch(() => ({}));

          if (!resp.ok) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('is-disabled');
            submitBtn.removeAttribute('data-disabled');
            submitBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span id="submit-label">Tentar gerar PIX de novo</span>';

            // 504 = timeout do servidor (Vercel cortou antes da Duttyfy responder)
            if (resp.status === 504) {
              showError('form-error',
                '⏱️ O sistema de pagamento demorou demais. Clique em "Tentar gerar PIX de novo" — seu pedido NÃO foi processado.');
              console.error('PIX create 504 timeout');
              return;
            }

            const msg = {
              email_invalido: 'E-mail inválido.',
              nome_invalido: 'Nome inválido.',
              telefone_invalido: 'Telefone inválido.',
              cpf_invalido: 'CPF inválido.',
              item_invalido: 'Item inválido no carrinho. Volte e refaça a compra.',
              total_incorreto: 'Totais inconsistentes. Volte e refaça o carrinho.',
              carrinho_vazio: 'Seu carrinho está vazio.',
              duttyfy_offline: 'Gateway de pagamento demorou pra responder. Clique em "Tentar gerar PIX de novo" — o sistema já tentou 3 vezes automaticamente.',
              duttyfy_rejeitado: 'Pagamento rejeitado pelo gateway.',
              duttyfy_resposta_invalida: 'Gateway respondeu formato inesperado.',
              payload_invalido: 'Dados enviados inválidos.',
              id_invalido: 'ID da transação inválido. Volte e refaça a compra.',
              erro_interno: 'Erro interno do servidor. Tente novamente.',
              rate_limit: 'Muitas tentativas. Aguarde 1 minuto.',
            }[data.error] || ('Erro inesperado (' + resp.status + '). Clique em "Tentar gerar PIX de novo".');
            const detail = data.detail || data.gatewayBody?.message || data.gatewayBody?.error || (data.gatewayBody ? JSON.stringify(data.gatewayBody) : '');
            const debugInfo = `[${data.error || 'sem_error'}] ${detail ? '| ' + String(detail).slice(0, 200) : ''}`;
            showError('form-error', msg + '\n\n' + debugInfo);
            console.error('PIX create error:', resp.status, data);
            return;
          }

          savePendingTxId(data.transactionId);

          // Meta Pixel - InitiateCheckout no momento EXATO em que o PIX é gerado.
          // Dispara 1 vez só por tentativa bem-sucedida de checkout (não em refresh do parte2).
          try {
            if (typeof fbq === 'function') {
              const totalCents = finalCart && typeof finalCart.total === 'number'
                ? finalCart.total
                : (Array.isArray(finalCart.items) ? finalCart.items.reduce((s, i) => s + (i.total || i.price || 0), 0) : 0);
              const numItems = Array.isArray(finalCart.items)
                ? finalCart.items.reduce((s, i) => s + (i.qty || 1), 0)
                : 0;
              const contentIds = Array.isArray(finalCart.items)
                ? finalCart.items.map((i) => String(i.id))
                : [];
              fbq('track', 'InitiateCheckout', {
                content_ids: contentIds,
                num_items: numItems,
                value: totalCents / 100,
                currency: 'BRL',
              });
            }
          } catch {}

          // Monta URL com UTMs (sanitizada: nunca começa com ?&)
          const utmQs = getUtmSuffix().replace(/^\?/, '');
          const params = [
            `txId=${encodeURIComponent(data.transactionId)}`,
            `qr=${encodeURIComponent(data.qrCodeBase64 || '')}`,
            `cp=${encodeURIComponent(data.copyPaste || '')}`,
            `exp=${encodeURIComponent(data.expiresAt || '')}`,
            // Valor total em cents carregado na URL — fallback pro upsell1 caso o
            // localStorage.selectedItems se perca (webview do IG/FB, storage evictado).
            // Sem isso o upsell1 jogava o cliente que já pagou de volta pro checkout.
            `amt=${encodeURIComponent(finalCart.total || 0)}`,
          ];
          if (utmQs) params.push(utmQs);
          const url = `parte2.html?${params.join('&')}`;
          // Marca como submetido ANTES de navegar pra não liberar inFlight no finally
          submitted = true;
          window.location.href = url;
          return; // sai sem resetar inFlight (a página vai trocar)
        } catch (err) {
          console.error('handleContinue erro:', err);
          if (err && /timeout|aborted|504/i.test(String(err.message || err))) {
            showError('form-error', '⏱️ O sistema de pagamento demorou demais. Tente novamente em 30 segundos.');
          } else {
            showError('form-error', 'Falha de conexão. Verifique sua internet.');
          }
        } finally {
          hideGeneratingOverlay();
          if (!submitted) {
            inFlight = false;
            submitBtn.disabled = false;
            submitBtn.classList.remove('is-disabled');
            submitBtn.removeAttribute('data-disabled');
            submitBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span id="submit-label">Tentar gerar PIX de novo</span>';
          }
        }
      }

      // Click handler direto (sem form submit)
      if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
          if (submitBtn.disabled || submitBtn.classList.contains('is-disabled')) {
            e.preventDefault();
            e.stopPropagation();
            // foco no primeiro campo vazio pra UX clara
            if (emailInput && !validateEmail(emailInput.value.trim())) emailInput.focus();
            else if (phoneInput && phoneInput.value.replace(/\D/g, '').length < 10) phoneInput.focus();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          handleContinue();
        });
      }

      // Enter em qualquer input também dispara handleContinue
      [emailInput, phoneInput].forEach((inp) => {
        if (!inp) return;
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Defesa extra: se já tem submit em flight (ex: usuário clicou
            // botão + apertou Enter quase ao mesmo tempo), bloqueia o Enter.
            if (submitBtn && (submitBtn.disabled || submitBtn.classList.contains('is-disabled'))) {
              return;
            }
            handleContinue();
          }
        });
      });
    },
  };

  // ============ PARTE 2 ============

  let pollTimer = null;
  let pollAttempts = 0;
  const POLL_INTERVAL = 3000;
  const POLL_MAX_ATTEMPTS = 600; // ~30min

  window.CheckoutParte2 = {
    renderQr(qrBase64, copyPaste) {
      const img = document.getElementById('qr-img');
      const input = document.getElementById('copy-input');
      // Armazena o payload BR Code num data-attribute pra re-renderizar sob demanda
      const wrapper = document.getElementById('qr-wrapper');
      if (wrapper) {
        if (qrBase64) wrapper.dataset.qrBase64 = qrBase64;
        if (copyPaste) wrapper.dataset.copyPaste = copyPaste;
      }
      // Render inicial (se já tiver o QR do servidor)
      this.updateQrImage();
      if (input && copyPaste) {
        input.value = copyPaste;
      }
    },

    updateQrImage() {
      const wrapper = document.getElementById('qr-wrapper');
      const img = document.getElementById('qr-img');
      if (!wrapper || !img) return;
      const qrBase64 = wrapper.dataset.qrBase64;
      const copyPaste = wrapper.dataset.copyPaste;
      if (!copyPaste) return;

      // Estratégia 1: usar o PNG base64 do gateway (se vier COM prefixo data:image)
      if (qrBase64 && qrBase64.startsWith('data:image') && qrBase64.length > 100) {
        img.src = qrBase64;
        img.alt = 'QR Code PIX (gerado pelo gateway)';
        return;
      }

      // Estratégia 2 (PRINCIPAL): renderizar via API qrserver.com a partir do BR Code.
      // Sempre funciona, independente do que o gateway mandar.
      const encoded = encodeURIComponent(copyPaste);
      const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}&bgcolor=ffffff&color=000000&margin=10`;
      img.src = fallbackUrl;
      img.alt = 'QR Code PIX (gerado a partir do BR Code)';
    },

    bindQrToggle() {
      const btnShow = document.getElementById('btn-show-qr');
      const btnHide = document.getElementById('btn-hide-qr');
      const wrapper = document.getElementById('qr-wrapper');
      if (!btnShow || !wrapper) return;

      btnShow.addEventListener('click', () => {
        this.updateQrImage();
        wrapper.style.display = 'block';
        btnShow.parentElement.style.display = 'none';
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      if (btnHide) {
        btnHide.addEventListener('click', () => {
          wrapper.style.display = 'none';
          if (btnShow.parentElement) btnShow.parentElement.style.display = 'block';
        });
      }
    },

    bindCopyButton() {
      const btn = document.getElementById('btn-copy');
      const input = document.getElementById('copy-input');
      if (!btn || !input) return;

      // Snapshot do HTML interno do botão (preserva o <i> do ícone).
      // Sem isso, depois de copiar o botão perde o ícone e o usuário perde referência visual.
      const originalInnerHTML = btn.dataset.originalInnerHTML || btn.innerHTML;
      btn.dataset.originalInnerHTML = originalInnerHTML;

      // Helper de toast — único elemento global, sem acúmulo em cliques rápidos.
      // Cada chamada cancela qualquer timer anterior pra não bugar com múltiplos clicks.
      let toastTimer = null;
      function showToast(message, kind) {
        // kind: 'success' | 'error' (default success)
        let toast = document.getElementById('pix-copy-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'pix-copy-toast';
          toast.className = 'pix-copy-toast';
          toast.setAttribute('role', 'status');
          toast.setAttribute('aria-live', 'polite');
          document.body.appendChild(toast);
        }
        // Reseta timer anterior SEMPRE — não acumula timeout
        if (toastTimer) {
          clearTimeout(toastTimer);
          toastTimer = null;
        }
        // Reseta animação pra permitir re-trigger visual em cliques seguidos
        toast.classList.remove('show', 'success', 'error');
        // Força reflow pra reiniciar a animação CSS
        // eslint-disable-next-line no-unused-expressions
        void toast.offsetWidth;

        const icon = kind === 'error'
          ? '<i class="fa-solid fa-circle-exclamation"></i>'
          : '<i class="fa-solid fa-circle-check"></i>';
        toast.innerHTML = `${icon}<span>${message}</span>`;
        toast.classList.add(kind === 'error' ? 'error' : 'success');
        toast.classList.add('show');

        toastTimer = setTimeout(() => {
          toast.classList.remove('show');
          toastTimer = null;
        }, 2600);
      }

      // Restaura estado visual do botão após feedback (mantém o ícone original)
      function resetBtn() {
        btn.innerHTML = originalInnerHTML;
        btn.classList.remove('copied', 'copy-error');
      }

      btn.addEventListener('click', async () => {
        const text = input.value || '';
        if (!text) {
          showToast('Nenhum código PIX pra copiar ainda.', 'error');
          return;
        }

        let copied = false;

        // Estratégia 1: Clipboard API moderna
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch (err) {
          // Cai no fallback abaixo
          copied = false;
        }

        // Estratégia 2: fallback execCommand (browsers antigos / HTTP / iframe)
        if (!copied) {
          try {
            input.removeAttribute('readonly');
            input.select();
            input.setSelectionRange(0, text.length);
            copied = document.execCommand && document.execCommand('copy');
            input.setAttribute('readonly', '');
          } catch (err) {
            copied = false;
          }
        }

        if (copied) {
          // Feedback local no botão (reforço visual perto do click)
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
          btn.classList.add('copied');
          btn.classList.remove('copy-error');
          setTimeout(resetBtn, 2200);

          // Toast grande no topo — confirmação visível mesmo se o cara
          // já rolou a tela pra cima
          showToast('Chave PIX copiada com sucesso!', 'success');
        } else {
          // Falhou nas DUAS estratégias — mostra erro claro, não mente "Copiado!"
          btn.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Não foi possível copiar';
          btn.classList.add('copy-error');
          setTimeout(resetBtn, 2400);

          showToast('Não foi possível copiar. Toque no campo, segure e copie manualmente.', 'error');

          // Abre seleção manual pra facilitar cópia manual como último recurso
          try {
            input.removeAttribute('readonly');
            input.focus();
            input.select();
          } catch {}
        }
      });
    },

    startCountdown(expiresAt) {
      const el = document.getElementById('countdown');
      if (!el) return;
      // SEMPRE 10 minutos a partir de agora. Ignoramos qualquer expiresAt vindo
      // do gateway pra evitar bugs de formato (segundos vs ms vs ISO).
      let target = Date.now() + 10 * 60 * 1000;

      // best-effort: se expiresAt vier em formato ISO válido, usa ele
      if (expiresAt) {
        const parsed = Date.parse(expiresAt);
        if (Number.isFinite(parsed) && parsed > Date.now()) {
          // só aceita se for menor que 1h (descarta bugs tipo "segundos sem *1000")
          const durMs = parsed - Date.now();
          if (durMs > 0 && durMs <= 60 * 60 * 1000) {
            target = parsed;
          }
        }
      }

      function tick() {
        const diff = target - Date.now();
        if (diff <= 0) {
          el.textContent = '00:00';
          stopPolling();
          if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
          const pill = document.getElementById('status-pill');
          if (pill && !pill.classList.contains('paid')) {
            pill.innerHTML = '<span class="dot"></span> PIX expirado — gere um novo';
          }
          return;
        }
        const total = Math.floor(diff / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      var tickInterval = null;
      tick();
      tickInterval = setInterval(tick, 1000);
    },

    startPolling(txId, onPaid, overrides) {
      const pill = document.getElementById('status-pill');
      pollAttempts = 0;
      // Salva estado pra retomada após visibilitychange + Purchase do Meta com valor correto
      // overrides: { valueCents, items, contentCategory } vindos do init (upsell1-pay/upsell2-pay
      // precisam mandar valor real do upsell, não o do pacote principal que tá no localStorage).
      const ov = overrides || {};
      pollingState = {
        txId,
        onPaid,
        valueCents: typeof ov.valueCents === 'number' ? ov.valueCents : undefined,
        items: Array.isArray(ov.items) ? ov.items : undefined,
        contentCategory: typeof ov.contentCategory === 'string' ? ov.contentCategory : undefined,
      };
      pollTimer = setInterval(async () => {
        pollAttempts++;
        if (pollAttempts > POLL_MAX_ATTEMPTS) {
          stopPolling();
          return;
        }
        try {
          const resp = await fetch(`/api/pix/status/${encodeURIComponent(txId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          const data = await resp.json();
          if (data.status === 'PAID') {
            stopPolling();
            if (pill) {
              pill.classList.add('paid');
              pill.innerHTML = '<span class="dot"></span> Pagamento confirmado!';
            }
            // Dispara approved COM UTMs (o status endpoint não dispara mais).
            postConfirm(txId, pollingState.valueCents, pollingState.items);
            handlePaid(onPaid, pollingState.valueCents, pollingState.items, pollingState.contentCategory);
          } else if (['CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(data.status)) {
            stopPolling();
            if (pill) {
              pill.innerHTML = `<span class="dot"></span> ${data.status === 'EXPIRED' ? 'PIX expirado' : 'Pagamento não concluído'}`;
            }
          }
        } catch {
          // ignora falhas de polling — continua tentando
        }
      }, POLL_INTERVAL);
    },

    bindRefreshButton(txId, onPaid) {
      const btn = document.getElementById('btn-refresh');
      if (!btn) return;
      // Mostra o botão "Já paguei" somente após 7 segundos
      btn.style.display = 'none';
      btn.style.opacity = '0';
      btn.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        btn.style.display = '';
        requestAnimationFrame(() => { btn.style.opacity = '1'; });
      }, 7000);
      btn.addEventListener('click', () => {
        // "Já paguei" = avança DIRETO pro upsell1, sem gate de status.
        // O gate antigo (fetch /status) travava/voltava pro checkout quando a Duttyfy
        // ainda não tinha confirmado — sintoma reportado. O Purchase real continua vindo
        // do polling automático (PAID) e do CAPI server-side (webhook/LowTrack).
        btn.disabled = true;
        try { stopPolling(); } catch {}
        const pill = document.getElementById('status-pill');
        if (pill) pill.innerHTML = '<span class="dot"></span> Redirecionando...';
        // Manda o snapshot pro backend confirmar na Duttyfy e disparar o approved COM UTMs.
        // keepalive garante que o POST completa mesmo navegando pro upsell1.
        try { postConfirm(txId, pollingState && pollingState.valueCents, pollingState && pollingState.items); } catch {}
        if (typeof onPaid === 'function') {
          try { onPaid(txId); return; } catch (e) { console.error('já paguei onPaid erro:', e); }
        }
        // Sem onPaid (não deveria acontecer no parte2): reabilita o botão.
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Já paguei';
        }, 2500);
      });
    },

    init(opts) {
      const onPaid = (opts && typeof opts.onPaid === 'function') ? opts.onPaid : null;
      // Override de Purchase da Meta — usado pelos upsell-pay pra mandar o valor correto
      // em vez do valor do pacote principal que está no localStorage.
      const valueCents = opts && typeof opts.valueCents === 'number' ? opts.valueCents : undefined;
      const items = opts && Array.isArray(opts.items) ? opts.items : undefined;
      const contentCategory = opts && typeof opts.contentCategory === 'string' ? opts.contentCategory : undefined;
      const txId = getQueryParam('txId') || getPendingTxId();
      if (!txId) {
        // sem transação, volta
        window.location.replace('../../index.html' + getUtmSuffix());
        return;
      }

      const qrFromUrl = getQueryParam('qr');
      const cpFromUrl = getQueryParam('cp');
      const expFromUrl = getQueryParam('exp');
      this.renderQr(qrFromUrl, cpFromUrl);
      this.bindCopyButton();
      this.bindQrToggle();
      this.startCountdown(expFromUrl);
      // Passa overrides direto pro polling pra evitar janela onde valueCents/items ficariam undefined
      // e o Purchase do Meta cairia no fallback (localStorage.selectedItems, que pode ser o pacote base).
      this.startPolling(txId, onPaid, { valueCents, items, contentCategory });
      this.bindRefreshButton(txId, onPaid);

      // Se houver onPaid, vincular o botão "Continuar" do success overlay
      if (onPaid) {
        const btn = document.getElementById('btn-success-continue');
        if (btn) {
          btn.addEventListener('click', () => {
            try { onPaid(txId); } catch (e) { console.error('onPaid erro:', e); }
          });
        }
      }

      // Meta Pixel - InitiateCheckout movido pro parte1 (depois que o PIX é gerado),
      // pra disparar UMA vez só por compra, não a cada refresh/load do parte2.
      // (removido daqui pra evitar duplicidade.)
    },
  };

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Pausa polling quando a aba fica em background por mais de 60s — economiza
  // requisições e batería. Retoma no focus.
  let visibilityPaused = false;
  function pausePollingOnHide() {
    if (document.hidden && pollTimer) {
      stopPolling();
      visibilityPaused = true;
    } else if (visibilityPaused && !document.hidden) {
      // retoma chamando startPolling de novo — passa os mesmos overrides (valueCents/items)
      // que estavam no estado, senão ao retomar de background o Purchase da Meta cai no fallback errado.
      if (pollingState && pollingState.txId) {
        // startPolling é MÉTODO de CheckoutParte2 — chamar solto dava
        // "startPolling is not defined" ao voltar do app do banco (visibilitychange),
        // matando o polling e o auto-redirect pro upsell1.
        window.CheckoutParte2.startPolling(pollingState.txId, pollingState.onPaid, {
          valueCents: pollingState.valueCents,
          items: pollingState.items,
          contentCategory: pollingState.contentCategory,
        });
      }
      visibilityPaused = false;
    }
  }
  document.addEventListener('visibilitychange', pausePollingOnHide);

  // Cleanup quando a página for descartada — garante que não fica zombie polling
  // depois que o cliente pagou e navegou pra próxima página.
  window.addEventListener('beforeunload', stopPolling);
  window.addEventListener('pagehide', stopPolling);

  // Estado do polling ativo — usado pra retomar após visibilitychange
  let pollingState = null;

  function showSuccess() {
    const overlay = document.getElementById('success-overlay');
    if (!overlay) return;
    overlay.classList.add('show');
    // Meta Pixel - Purchase ao confirmar pagamento
    try {
      if (typeof fbq === 'function') {
        const cartRaw = localStorage.getItem('selectedItems');
        const cart = cartRaw ? JSON.parse(cartRaw) : null;
        fbq('track', 'Purchase', {
          content_ids: cart && Array.isArray(cart.items) ? cart.items.map(i => String(i.id)) : [],
          num_items: cart && Array.isArray(cart.items) ? cart.items.reduce((s, i) => s + (i.qty || 1), 0) : 0,
          value: cart ? (cart.total / 100) : 0,
          currency: 'BRL',
        });
      }
    } catch {}
  }

  // Centraliza o que acontece quando o status vira PAID:
  // - Se houver onPaid callback (página de upsell com redirect), chama o callback direto (sem overlay).
  // - Senão, mostra o overlay de sucesso padrão.
  // - O Purchase da Meta usa o `valueOverride` + `itemsOverride` se passados (upsells),
  //   senão cai no `localStorage.selectedItems` (parte2 do pacote principal).
  // Monta o snapshot da venda pro /api/pix/confirm — fonte confiável de UTM no
  // approved (o storage do backend é em memória e some no cold start do Hobby).
  function buildSaleSnapshot(overrideValueCents, overrideItems) {
    const snap = { utm: {} };
    try {
      if (window.UtmShared && typeof window.UtmShared.getUtmObject === 'function') {
        snap.utm = window.UtmShared.getUtmObject() || {};
      }
    } catch {}
    try {
      if (window.CheckoutCustomer && typeof window.CheckoutCustomer.get === 'function') {
        const c = window.CheckoutCustomer.get() || {};
        snap.name = c.name; snap.email = c.email; snap.phone = c.phone; snap.document = c.document;
      }
    } catch {}
    try { snap.playerId = sessionStorage.getItem('ff:playerIdConfirmed') || ''; } catch {}
    try { snap.user_agent = navigator.userAgent || ''; } catch {}
    if (typeof overrideValueCents === 'number' && overrideValueCents > 0) {
      snap.totalCents = overrideValueCents;
      snap.items = Array.isArray(overrideItems) ? overrideItems : undefined;
    } else {
      try {
        const cartRaw = localStorage.getItem('selectedItems');
        const cart = cartRaw ? JSON.parse(cartRaw) : null;
        if (cart) { snap.items = Array.isArray(cart.items) ? cart.items : undefined; snap.totalCents = cart.total || 0; }
      } catch {}
    }
    return snap;
  }

  // Manda o snapshot pro backend disparar o approved COM as UTMs do cliente.
  // Best-effort + keepalive (sobrevive à navegação pro upsell). Idempotente na LowTrack.
  function postConfirm(txId, overrideValueCents, overrideItems) {
    if (!txId) return;
    try {
      const sale = buildSaleSnapshot(overrideValueCents, overrideItems);
      fetch('/api/pix/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId, sale }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  function handlePaid(onPaid, valueOverride, itemsOverride, contentCategory) {
    try {
      if (typeof fbq === 'function') {
        // Decide valor + items pra disparar no Purchase da Meta
        let value = 0;
        let items = [];
        if (typeof valueOverride === 'number' && valueOverride > 0) {
          value = valueOverride / 100;
          items = Array.isArray(itemsOverride) ? itemsOverride : [];
        } else {
          const cartRaw = localStorage.getItem('selectedItems');
          const cart = cartRaw ? JSON.parse(cartRaw) : null;
          if (cart) {
            items = Array.isArray(cart.items) ? cart.items : [];
            value = (cart.total || 0) / 100;
          }
        }
        const fbqPayload = {
          content_ids: items.map((i) => String(i.id ?? '')).filter(Boolean),
          num_items: items.reduce((s, i) => s + (i.qty || 1), 0),
          value,
          currency: 'BRL',
        };
        if (contentCategory) fbqPayload.content_category = contentCategory;
        fbq('track', 'Purchase', fbqPayload);
      }
    } catch (e) { console.error('fbq Purchase erro:', e); }
    if (typeof onPaid === 'function') {
      try { onPaid(); return; } catch (e) { console.error('onPaid callback erro:', e); }
    }
    showSuccess();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  /**
 * Abre o popup de upsell com 3 ofertas a 70% OFF.
 * Retorna Promise<Array> com os itens selecionados ou [] se recusou.
 * Atualiza o resumo do pedido e o total em tempo real conforme o usuário marca/desmarca.
 */
function openUpsellPopup() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('upsell-overlay');
    if (!overlay) { resolve([]); return; }

    const items = overlay.querySelectorAll('.upsell-item');
    const sumEl = document.getElementById('upsell-sum');
    const acceptBtn = document.getElementById('upsell-accept');
    const declineBtn = document.getElementById('upsell-decline');
    let selected = [];

    const cartTotalEl = document.getElementById('cart-total');
    const cartTotalFooterEl = document.getElementById('cart-total-footer');
    const cartListEl = document.getElementById('cart-list');

    // Lê o cart atual do localStorage (já inclui os up-tile selecionados na parte1)
    function readCurrentCart() {
      try {
        const raw = localStorage.getItem('selectedItems');
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }

    // Re-renderiza o resumo do pedido (incluindo os upsells marcados) e atualiza totais
    function refreshSummary() {
      const baseCart = readCurrentCart();
      if (!baseCart) return;

      const extras = Array.from(items)
        .filter((b) => b.classList.contains('active'))
        .map((b) => ({
          id: b.dataset.id,
          productId: b.dataset.id,
          name: b.dataset.name,
          price: Math.round(parseFloat(b.dataset.price) * 100),
          qty: 1,
          total: Math.round(parseFloat(b.dataset.price) * 100),
        }));

      const extraSum = extras.reduce((s, e) => s + e.total, 0);
      const newTotal = baseCart.total + extraSum;

      // Atualiza totais (header + footer)
      if (cartTotalEl) cartTotalEl.textContent = formatBRLFromCents(newTotal);
      if (cartTotalFooterEl) cartTotalFooterEl.textContent = formatBRLFromCents(newTotal);

      // Atualiza lista visual do carrinho — preserva os itens originais e adiciona os upsells marcados
      if (cartListEl) {
        let html = '';
        baseCart.items.forEach((it) => {
          html += `
            <div class="cart-item">
              <div class="info">
                <strong>${escapeHtml(it.name)}</strong>
                <span>${formatBRLFromCents(it.price)} <span class="qty">x${it.qty}</span></span>
              </div>
              <div class="price">${formatBRLFromCents(it.total)}</div>
            </div>`;
        });
        extras.forEach((e) => {
          html += `
            <div class="cart-item" style="border-left:2px solid var(--green);padding-left:8px;">
              <div class="info">
                <strong style="color:var(--green);">${escapeHtml(e.name)} <span style="font-size:0.7rem;background:var(--green);color:#082008;padding:2px 6px;border-radius:6px;margin-left:4px;">BÔNUS</span></strong>
                <span>${formatBRLFromCents(e.price)} <span class="qty">x1</span></span>
              </div>
              <div class="price" style="color:var(--green);font-weight:800;">${formatBRLFromCents(e.total)}</div>
            </div>`;
        });
        cartListEl.innerHTML = html;
      }
    }

    function updateSum() {
      selected = Array.from(items).filter((b) => b.classList.contains('active'));
      const total = selected.reduce((s, b) => s + Math.round(parseFloat(b.dataset.price) * 100), 0);
      if (sumEl) sumEl.textContent = formatBRLFromCents(total);
      refreshSummary();
    }

    items.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.classList.toggle('active');
        updateSum();
      });
    });

    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');

    function close(resolvedItems) {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      acceptBtn.removeEventListener('click', onAccept);
      declineBtn.removeEventListener('click', onDecline);
      resolve(resolvedItems);
    }

    function onAccept() {
      const picked = Array.from(items)
        .filter((b) => b.classList.contains('active'))
        .map((b) => ({
          id: b.dataset.id,
          productId: b.dataset.id,
          name: b.dataset.name,
          price: Math.round(parseFloat(b.dataset.price) * 100),
          qty: 1,
          total: Math.round(parseFloat(b.dataset.price) * 100),
        }));
      close(picked);
    }

    function onDecline() {
      // Ao recusar, remove os extras do resumo e volta o total ao base
      const baseCart = readCurrentCart();
      if (baseCart && cartListEl) {
        let html = '';
        baseCart.items.forEach((it) => {
          html += `
            <div class="cart-item">
              <div class="info">
                <strong>${escapeHtml(it.name)}</strong>
                <span>${formatBRLFromCents(it.price)} <span class="qty">x${it.qty}</span></span>
              </div>
              <div class="price">${formatBRLFromCents(it.total)}</div>
            </div>`;
        });
        cartListEl.innerHTML = html;
      }
      if (cartTotalEl && baseCart) cartTotalEl.textContent = formatBRLFromCents(baseCart.total);
      if (cartTotalFooterEl && baseCart) cartTotalFooterEl.textContent = formatBRLFromCents(baseCart.total);
      close([]);
    }

    acceptBtn.addEventListener('click', onAccept);
    declineBtn.addEventListener('click', onDecline);
  });
}

window.CheckoutUtils = {
    formatBRLFromCents,
    escapeHtml,
    validateEmail,
    openUpsellPopup,
};
})();