// Cliente do webhook LowTrack.
// Endpoint: POST https://lowtrack.com.br/api/webhook
// Auth: Authorization: Bearer <LOWTRACK_API_KEY>
// Doc: https://lowtrack.com.br/docs/webhook

const LOWTRACK_URL = 'https://lowtrack.com.br/api/webhook';

function getToken() {
  const t = process.env.LOWTRACK_API_KEY;
  if (!t) return null;
  return t;
}

function splitName(fullName) {
  const s = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!s) return { first_name: '', last_name: '' };
  const parts = s.split(' ');
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function normalizePhone(phoneDigits, defaultCountry = '55') {
  // LowTrack quer número completo com país (ex: 5511987654321).
  // Se já começar com 55, mantém. Senão prefixa.
  let p = String(phoneDigits || '').replace(/\D/g, '');
  if (!p) return '';
  if (!p.startsWith(defaultCountry)) p = defaultCountry + p;
  return p;
}

function buildTracking(utm) {
  const tracking = {};
  if (!utm || typeof utm !== 'object') return tracking;
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
    if (utm[k]) tracking[k] = String(utm[k]).slice(0, 200);
  });
  ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid', 'xcod', 'sck', 'src'].forEach((k) => {
    if (utm[k]) tracking[k] = String(utm[k]).slice(0, 200);
  });
  return tracking;
}

function buildItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length > 0) return sale.items;
  // Fallback: monta item sintético a partir de amount/totalCents
  const cents = Number(sale.amount_cents || sale.totalCents || 0);
  const priceBRL = Math.round(cents / 100);
  return [{
    id: 1,
    title: sale.product_name || 'Pedido Free Fire',
    name: sale.product_name || 'Pedido Free Fire',
    price: priceBRL,
    qty: 1,
    total: priceBRL,
  }];
}

// POST com retry 1x em caso de falha 5xx / network error.
// Timeouts (8s) pra dar margem com o maxDuration do Hobby (9s).
async function postToLowtrack(payload, token) {
  const attempt = async () => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(LOWTRACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        // Codifica em UTF-8 bytes pra evitar "Cannot convert argument to a ByteString"
        // quando o payload tem chars > U+00FF (BOM, emojis etc).
        body: new TextEncoder().encode(JSON.stringify(payload)),
        signal: controller.signal,
      });
      const text = await resp.text();
      let body = {};
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
      return { ok: resp.ok, status: resp.status, body, retryable: resp.status >= 500 };
    } catch (err) {
      return { ok: false, error: err.message || 'fetch_failed', retryable: true };
    } finally {
      clearTimeout(t);
    }
  };

  let result = await attempt();
  if (!result.ok && result.retryable) {
    // 1 retry após 500ms (cabe dentro do maxDuration 10s)
    await new Promise((r) => setTimeout(r, 500));
    result = await attempt();
  }
  return result;
}

/**
 * Envia evento de venda para a LowTrack.
 *
 * @param {Object} sale dados da venda (vem do storage OU do payload Duttyfy).
 *   Pode ter:
 *   - { name, email, phone, document, items, totalCents, utm, user_ip, user_agent }
 *   - OU { amount_cents, customer: {name,email,phone,document}, utm, ... } (formato webhook)
 * @param {'pending'|'approved'|'refunded'} status
 * @param {String} transactionId
 * @param {Object} [context] extras opcionais: { user_ip, user_agent, source }
 */
export async function sendLowtrackEvent(sale, status, transactionId, context = {}) {
  const token = getToken();
  if (!token) {
    console.warn('[lowtrack] LOWTRACK_API_KEY não configurada — pulando evento. transactionId=', transactionId);
    return { skipped: true, reason: 'no_token' };
  }
  // Log de diagnóstico: confirma que a env var chegou e quanto do payload tá completo
  console.log('[lowtrack] start', { event: status, transactionId, hasSale: !!sale, hasUtm: !!sale?.utm, utmKeys: sale?.utm ? Object.keys(sale.utm) : [] });
  if (!sale || !transactionId) {
    return { skipped: true, reason: 'missing_args' };
  }

  const eventMap = {
    pending: 'sale.pending',
    approved: 'sale.approved',
    refunded: 'sale.refunded',
  };
  const event = eventMap[status];
  if (!event) return { skipped: true, reason: 'unknown_status' };

  // Aceita customer tanto em sale.customer (formato webhook Duttyfy)
  // quanto em sale.name/email/phone (formato storage.create.js)
  const cust = sale.customer || {};
  const name = String(sale.name || cust.name || '').trim();
  const email = String(sale.email || cust.email || '').trim().toLowerCase();
  const phoneRaw = sale.phone || cust.phone || '';
  const documentRaw = sale.document || cust.document?.number || cust.document || '';

  const items = buildItems(sale);
  const productMain = items[0] || { id: 1, title: 'Pedido Free Fire', name: 'Pedido Free Fire' };
  const { first_name, last_name } = splitName(name);
  const phone = normalizePhone(phoneRaw);
  const documentDigits = String(documentRaw || '').replace(/\D/g, '');

  // amount em BRL (não centavos). Aceita totalCents (storage) OU amount_cents (webhook).
  const centsTotal = Number(sale.totalCents || sale.amount_cents || 0);
  const amountBRL = Number((centsTotal / 100).toFixed(2));

  const utm = (sale.utm && typeof sale.utm === 'object') ? sale.utm : {};

  const payload = {
    event,
    // event_id custom (se fornecido via context.eventIdSuffix) ou derivado.
    // Usar sufixo único força LowTrack a tratar como NOVO evento (não deduplica).
    // eventIdOverride (string completa) tem prioridade sobre suffix; útil pra
    // bypass total de dedup (ex: quando precisa update de tracking).
    event_id: context.eventIdOverride
      || (context.eventIdSuffix
        ? `${transactionId}_${status}_${context.eventIdSuffix}`
        : `${transactionId}_${status}`),
    transaction_id: String(transactionId),
    amount: amountBRL,
    currency: 'BRL',
    payment_method: 'pix',
    product: {
      id: typeof productMain.id === 'number' ? productMain.id : 1,
      name: String(productMain.title || productMain.name || 'Pedido Free Fire').slice(0, 80),
    },
    products: items.map((it, idx) => ({
      id: typeof it.id === 'number' ? it.id : idx + 1,
      name: String(it.title || it.name || `Item ${idx + 1}`).slice(0, 80),
    })),
    customer: {
      name: name.slice(0, 120),
      first_name: (first_name || '').slice(0, 60),
      last_name: (last_name || '').slice(0, 60),
      email: email.slice(0, 120),
      phone,
      document: documentDigits,
      country: 'br',
    },
    tracking: buildTracking(utm),
    metadata: {
      platform: 'freefire-9anos',
      source: context.source || 'vercel-pix',
    },
  };

  // user_ip e user_agent melhoram EMQ no CAPI (críticos pra Facebook match)
  const userIp = sale.user_ip || context.user_ip || '';
  const userAgent = String(sale.user_agent || context.user_agent || '').slice(0, 300);
  if (userIp) payload.user_ip = userIp;
  if (userAgent) payload.user_agent = userAgent;

  // ID da conta Free Fire que vai receber os diamantes — vai como metadata
  // pra que o operador da LowTrack saiba pra qual conta entregar.
  const playerIdDigits = String(sale.playerId || '').replace(/\D/g, '').slice(0, 20);
  if (playerIdDigits && playerIdDigits.length >= 6 && !/^0+$/.test(playerIdDigits)) {
    payload.metadata.player_id = playerIdDigits;
  }

  const result = await postToLowtrack(payload, token);
  if (result.ok) {
    console.log('[lowtrack]', event, transactionId, 'OK', result.status || '');
  } else if (result.skipped) {
    // já logado antes
  } else {
    console.warn('[lowtrack]', event, transactionId, 'FAIL', result.status || result.error || '');
  }
  return result;
}

export const LOWTRACK_EVENT = {
  PENDING: 'sale.pending',
  APPROVED: 'sale.approved',
  REFUNDED: 'sale.refunded',
};
