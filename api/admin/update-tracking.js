// Endpoint admin pra ATUALIZAR o tracking (UTMs) de uma venda que já foi
// registrada na LowTrack como approved sem UTMs completas (cold start).
//
// Estratégia: reenvia sale.approved com event_id único (ISO + random) e
// status explícito. Se a LowTrack deduplica por transaction_id+status,
// 409 retorna. Se aceita múltiplos eventos, o CAPI ainda processa o mais
// recente via event_id.
//
// POST /api/admin/update-tracking
// Header: x-admin-token: <ADMIN_TOKEN>
// Body: {
//   transactionId: string,
//   sale: { name, email, phone, document, items, totalCents, utm (object), user_ip, user_agent }
// }

import { sendLowtrackEvent } from '../_lib/lowtrack.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
}
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload, null, 2));
  return res;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const token = req.headers['x-admin-token'];
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || token !== expected) {
    return json(res, 401, { error: 'unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { transactionId, sale, dryRun } = body;

  if (!transactionId || typeof transactionId !== 'string' || !/^[A-Za-z0-9_\-]{4,80}$/.test(transactionId)) {
    return json(res, 400, { error: 'transactionId_invalido' });
  }
  if (!sale || typeof sale !== 'object') {
    return json(res, 400, { error: 'sale_obrigatorio' });
  }
  if (!sale.utm || typeof sale.utm !== 'object' || Object.keys(sale.utm).length === 0) {
    return json(res, 400, { error: 'utm_obrigatorio_objeto_nao_vazio' });
  }

  // ATENÇÃO: sendLowtrackEvent cria event_id como `${txId}_${status}` — pra
  // rastrear update separadamente, sobrescrevemos com event_id único usando
  // Date.now() + sufixo. Múltiplos reenvios com mesmo txId funcionam.
  if (dryRun) {
    return json(res, 200, {
      wouldSend: true,
      event: 'sale.approved',
      transactionId,
      eventIdPattern: `${transactionId}_approved_update_${Date.now()}`,
      saleUtmKeys: Object.keys(sale.utm),
      note: 'Nada foi enviado. Remova dryRun pra disparar.',
    });
  }

  console.log('[update-tracking][AUDIT] disparando approved com UTMs completas', {
    transactionId,
    at: new Date().toISOString(),
    utmKeys: Object.keys(sale.utm),
    saleEmail: sale.email,
  });

  try {
    const result = await sendLowtrackEvent(sale, 'approved', transactionId, {
      source: 'admin-update-tracking',
      // event_id totalmente novo (não derivado do txId) — se LowTrack
      // deduplica só por event_id, isso bypassa. Se deduplica por tx_id,
      // vai retornar 409 (limite da plataforma).
      eventIdOverride: `track_${transactionId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    if (result.ok) {
      return json(res, 200, { ok: true, transactionId, lowtrack: result });
    }
    if (result.skipped) {
      return json(res, 200, { ok: false, skipped: true, reason: result.reason, transactionId, lowtrack: result });
    }
    return json(res, 502, {
      ok: false,
      transactionId,
      lowtrack: result,
      hint: 'LowTrack pode ter rejeitado com 409 (already registered same status). Mesmo assim o CAPI pode processar o novo evento pelo event_id. Veja logs LowTrack.',
    });
  } catch (err) {
    console.error('[update-tracking] erro', err);
    return json(res, 500, { error: 'unexpected', detail: err.message });
  }
}
