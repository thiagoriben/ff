// customer.js — gera e persiste um identificador único de cliente (clienteffNNNNNNNN) + email/phone derivados.
// Mesmo padrão pro parte1 e pros 2 upsells: garante que cada sessão de checkout use um cliente consistente,
// pra Duttyfy e LowTrack receberem uma identificação rastreável por venda.
//
// COMO USAR:
//   <script src="customer.js"></script>   (antes do checkout.js e do upsell*.js)
//   const c = CheckoutCustomer.get();      // { name, email, phone, document }
//   fetch('/api/pix/create', { body: JSON.stringify({ ..., name: c.name, email: c.email, phone: c.phone, document: c.document }) });
//
// Persiste em localStorage na chave `checkout_customer_v1`.

(function () {
  'use strict';

  const STORAGE_KEY = 'checkout_customer_v1';
  const ID_PREFIX = 'clienteff';

  function randDigits(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  // Gera um identificador novo no formato "clienteff" + 8 a 10 dígitos.
  // Não usa timestamp pra não ficar previsível.
  function generateNew() {
    const tail = String(Date.now()).slice(-6) + randDigits(4); // 10 dígitos total
    const slug = ID_PREFIX + tail;
    const phoneDigits = '11' + tail.slice(0, 9); // 11 dígitos, prefixo 11 (SP)
    return {
      slug,
      name: slug,
      email: slug + '@gmail.com',
      phone: phoneDigits,
      document: '00000000000',
    };
  }

  function get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.slug && parsed.email && parsed.phone) {
          // Mantém compat: se faltar algum campo novo, completa.
          return Object.assign({ name: parsed.slug, document: '00000000000' }, parsed);
        }
      }
    } catch {}
    const fresh = generateNew();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch {}
    return fresh;
  }

  // Atualiza dados do cliente com info real (email, telefone digitados).
  // Mantém slug/document intactos. name é derivado da parte local do email
  // pra evitar ficar só com o slug na listagem da LowTrack / Duttyfy.
  function set(partial) {
    if (!partial || typeof partial !== 'object') return get();
    const current = get();
    const merged = Object.assign({}, current, partial);

    // Normaliza email (lowercase) e telefone (só dígitos) se vierem
    if (partial.email) {
      const e = String(partial.email).trim().toLowerCase();
      if (e && e.includes('@')) merged.email = e;
    }
    if (partial.phone) {
      const p = String(partial.phone).replace(/\D/g, '');
      if (p.length >= 10 && p.length <= 13) merged.phone = p;
    }

    // Nome = parte antes do @ do email, se houver (caso contrário mantém o slug)
    if (merged.email && merged.email.includes('@')) {
      const local = merged.email.split('@')[0];
      if (local) merged.name = local;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {}
    return merged;
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return get();
  }

  window.CheckoutCustomer = {
    get,
    set,
    reset,
    STORAGE_KEY,
  };
})();
