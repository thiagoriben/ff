// Endpoint admin pra forçar aprovação de uma venda.
// USO: usado quando a Duttyfy perdeu o status (responde PENDING mas a venda
// realmente caiu — evidência: tracking completo, nome real, CAPI Enviado).
//
// SEGURANÇA: protegido por token no header. Token vem de process.env.ADMIN_TOKEN.
// Sem ele, ninguém pode disparar.
//
// POST /api/admin/force-approve
// Headers: { "x-admin-token": "<ADMIN_TOKEN>", "Content-Type": "application/json" }
// Body: { "transactionIds": ["uuid1", "uuid2", ...] }
//
// Resposta: { ok, results: [{ txId, lowtrack: "approved" | "failed", reason? }] }

import { sendLowtrackEvent } from '../_lib/lowtrack.js';
import { getSale, setSale } from '../_lib/storage.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return res;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'method_not_allowed' });

  // Auth: exige header x-admin-token casando com ADMIN_TOKEN
  const token = req.headers['x-admin-token'];
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    console.error('[admin] ADMIN_TOKEN não configurado');
    return jsonResponse(res, 503, { error: 'admin_disabled' });
  }
  if (!token || token !== expected) {
    return jsonResponse(res, 401, { error: 'unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.transactionIds)) {
    return jsonResponse(res, 400, { error: 'transactionIds_ausente_ou_invalido' });
  }

  console.log('[admin] force-approve solicitado para', body.transactionIds.length, 'IDs');

  const results = [];
  for (const txId of body.transactionIds) {
    if (typeof txId !== 'string' || !/^[A-Za-z0-9_\-\.]{4,80}$/.test(txId)) {
      results.push({ txId, lowtrack: 'failed', reason: 'id_invalido' });
      continue;
    }

    // Pega dados do storage (se houver) ou monta payload mínimo
    const existing = await getSale(txId);

    // Se não tem no storage, monta payload mínimo com os dados do admin request
    const sale = existing || {
      transactionId: txId,
      email: body.customerEmail || `admin-recovered-${txId.slice(0, 8)}@example.com`,
      name: body.customerName || `Venda recuperada ${txId.slice(0, 8)}`,
      phone: body.customerPhone || '',
      document: body.customerDocument || '',
      items: [{ id: 1, title: 'Pedido Free Fire (recuperado)', name: 'Pedido Free Fire (recuperado)', price: 0, qty: 1, total: 0 }],
      totalCents: body.totalCents || 0,
      amount_cents: body.totalCents || 0,
      utm: {},
      user_ip: '',
      user_agent: 'admin-force-approve',
    };

    // Marca como PAID no storage
    await setSale(txId, {
      status: 'PAID',
      paidAt: new Date().toISOString(),
      recoveredByAdmin: true,
      source: 'admin-force-approve',
    });

    // Dispara sale.approved pra LowTrack
    try {
      const r = await sendLowtrackEvent(sale, 'approved', txId, { source: 'admin-force-approve' });
      console.log('[admin] sendLowtrackEvent retornou:', JSON.stringify(r));
      // Aceita ok=true OU status 2xx como sucesso
      if (r && (r.ok || (r.status >= 200 && r.status < 300))) {
        results.push({ txId, lowtrack: 'approved', status: r.status });
        console.log('[admin] approved OK', txId, r.status);
      } else if (r && r.skipped) {
        results.push({ txId, lowtrack: 'failed', reason: 'skipped', detail: r.reason || 'no_token' });
        console.warn('[admin] approved SKIPPED', txId, r.reason);
      } else {
        const detail = r ? JSON.stringify(r.body || r.error || r).slice(0, 300) : 'null';
        results.push({ txId, lowtrack: 'failed', reason: 'lowtrack_rejeitado', detail, httpStatus: r?.status });
        console.warn('[admin] approved FAILED', txId, r?.status, detail);
      }
    } catch (err) {
      results.push({ txId, lowtrack: 'failed', reason: err.message });
      console.error('[admin] approved erro', txId, err.message);
    }
  }

  const allOk = results.every((r) => r.lowtrack === 'approved');
  return jsonResponse(res, allOk ? 200 : 207, {
    ok: allOk,
    total: results.length,
    approved: results.filter((r) => r.lowtrack === 'approved').length,
    failed: results.filter((r) => r.lowtrack !== 'approved').length,
    results,
  });
}
