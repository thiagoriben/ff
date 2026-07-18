// Endpoint de teste DRY-RUN pra validar credenciais.
// NÃO cria venda real na Duttyfy e NÃO chama LowTrack.
// - GET /api/_test-keys             → resumo das envs (sem expor valores)
// - POST /api/_test-keys { dryRun } → testa:
//     * Duttyfy: GET na URL encriptada com transactionId fictício (valida
//       autenticação e formato do endpoint; não cria cobrança).
//     * LowTrack: NÃO chama webhook. Apenas valida que o token existe
//       e tem o formato esperado (Bearer <token>).
// - POST /api/_test-keys { lowtrackDryRun:true } → monta o payload que
//   SERIA enviado pra LowTrack (idêntico ao do webhook real) e devolve
//   no response pra inspeção. NÃO faz POST.

// Lê a URL encriptada (mesma lógica de _lib/duttyfy.js — não importada pra
// evitar ciclos / problemas de export).
function readEncryptedUrl() {
  let url = process.env.DUTTYFY_PIX_URL_ENCRYPTED || '';
  if (url.charCodeAt(0) === 0xFEFF) url = url.slice(1);
  url = url.trim();
  if (!url) throw new Error('DUTTYFY_PIX_URL_ENCRYPTED não configurada');
  return url;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload, null, 2));
  return res;
}

// Mascarar token: mostra prefixo + tamanho + últimos 4 chars.
function maskToken(t) {
  if (!t) return null;
  const s = String(t);
  if (s.length <= 8) return `${s.length} chars`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

function inspectLowtrackToken() {
  const t = process.env.LOWTRACK_API_KEY || '';
  if (!t) return { configured: false };
  return {
    configured: true,
    masked: maskToken(t),
    startsWithLt: t.startsWith('lt_'),
    looksValid: /^lt_[A-Za-z0-9]{30,}$/.test(t),
  };
}

function inspectDuttyfyUrl() {
  try {
    const url = readEncryptedUrl();
    return {
      configured: true,
      host: (() => { try { return new URL(url).host; } catch { return 'invalid_url'; } })(),
      path: (() => { try { return new URL(url).pathname.slice(0, 50); } catch { return '?'; } })(),
      length: url.length,
      hasBOM: url.charCodeAt(0) === 0xFEFF,
    };
  } catch (err) {
    return { configured: false, error: err.message };
  }
}

// Tenta um GET com transactionId fictício. Se a Duttyfy responder
// 401/403 → auth falhou. Se 400/404 → URL e auth OK, transação não existe
// (que é o que esperamos). Qualquer 2xx → URL OK.
async function probeDuttyfy() {
  const url = readEncryptedUrl();
  const probeId = `test_probe_${Date.now()}`;
  const probeUrl = `${url}${url.includes('?') ? '&' : '?'}transactionId=${encodeURIComponent(probeId)}`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 6000);
  try {
    const resp = await fetch(probeUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(tid);
    const text = await resp.text().catch(() => '');
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return {
      status: resp.status,
      ok: resp.ok,
      authOk: resp.status !== 401 && resp.status !== 403,
      expectedBehavior: resp.status === 401 || resp.status === 403
        ? 'AUTH_FAIL — chave encriptada inválida ou expirada'
        : (resp.status === 400 || resp.status === 404)
          ? 'OK — chave válida, transação de probe não existe (esperado)'
          : (resp.status >= 200 && resp.status < 300)
            ? 'OK — endpoint respondeu'
            : 'INESPERADO',
      bodySample: body,
    };
  } catch (err) {
    clearTimeout(tid);
    return { error: err.message || 'fetch_failed' };
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }

  const inspection = {
    duttyfy: inspectDuttyfyUrl(),
    lowtrack: inspectLowtrackToken(),
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      message: 'GET: inspeção de env vars (sem chamadas externas). Use POST pra probe Duttyfy ou dry-run LowTrack.',
      inspection,
    });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { lowtrackDryRun, duttyfyProbe } = body;

  const result = { inspection, checks: {} };

  // Probe Duttyfy (chamada real, mas não cria venda)
  if (duttyfyProbe) {
    try {
      result.checks.duttyfy = await probeDuttyfy();
    } catch (err) {
      result.checks.duttyfy = { error: err.message };
    }
  }

  // Dry-run LowTrack: monta o MESMO payload que webhook.js geraria,
  // mas NÃO faz POST. Devolve pra inspeção.
  if (lowtrackDryRun) {
    const sample = {
      event: 'sale.approved',
      event_id: 'TEST_DRY_RUN_approved',
      transaction_id: 'TEST_DRY_RUN_TXN',
      amount: 19.9,
      currency: 'BRL',
      payment_method: 'pix',
      product: { id: 1, name: 'Pedido Free Fire' },
      products: [{ id: 1, name: 'Pedido Free Fire' }],
      customer: {
        name: 'Cliente Teste',
        first_name: 'Cliente',
        last_name: 'Teste',
        email: 'teste@example.com',
        phone: '5511999999999',
        document: '11144477735',
        country: 'br',
      },
      tracking: {
        utm_source: 'test',
        utm_medium: 'test',
        utm_campaign: 'test',
      },
      metadata: {
        platform: 'freefire-9anos',
        source: 'dry-run',
      },
    };
    const token = process.env.LOWTRACK_API_KEY || '';
    result.checks.lowtrack = {
      wouldPost: true,
      url: 'https://lowtrack.com.br/api/webhook',
      tokenMasked: maskToken(token),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ? token.slice(0, 4) + '…' + token.slice(-4) : '<empty>'}`,
      },
      payloadPreview: sample,
      note: 'Nada foi enviado. Payload idêntico ao do webhook real.',
    };
  }

  result.summary = {
    duttyfyConfigured: inspection.duttyfy.configured,
    lowtrackConfigured: inspection.lowtrack.configured,
    duttyfyProbeRan: !!duttyfyProbe,
    lowtrackDryRun: !!lowtrackDryRun,
  };

  return json(res, 200, result);
}
