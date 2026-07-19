// Confirmação de pagamento vinda do CLIENTE (parte2).
//
// Por que existe: o storage é em memória (some no cold start do Vercel Hobby),
// então na hora de aprovar a venda o servidor não tem mais as UTMs. O cliente
// (parte2) TEM as UTMs no localStorage. Aqui ele manda o snapshot da venda
// (utm + cliente + itens) e o backend confere na Duttyfy; se PAID, dispara o
// `approved` pra LowTrack JÁ COM as UTMs reais.
//
// POST /api/pix/confirm
// Body: { txId, sale: { name,email,phone,document,items,totalCents,utm,playerId,user_agent } }
//
// Idempotente: a LowTrack deduplica por event_id (`${txId}_approved`), então
// chamar isso junto com o webhook da Duttyfy não duplica a conversão.

import { getSaleStatus, DuttyfyAuthError, DuttyfyApiError, DuttyfyNetworkError } from '../_lib/duttyfy.js';
import { sendLowtrackEvent } from '../_lib/lowtrack.js';
import { getSale, updateStatus } from '../_lib/storage.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return res;
}

function sanitizeSale(raw, fallbackUa) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  const items = Array.isArray(s.items) && s.items.length > 0
    ? s.items.map((it, i) => ({
        id: typeof it.id === 'number' ? it.id : i + 1,
        title: String(it.title || it.name || 'Pedido Free Fire').slice(0, 80),
        name: String(it.name || it.title || 'Pedido Free Fire').slice(0, 80),
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        total: Number(it.total) || (Number(it.price) || 0) * (Number(it.qty) || 1),
      }))
    : undefined;
  const utm = (s.utm && typeof s.utm === 'object') ? s.utm : {};
  return {
    name: String(s.name || '').slice(0, 120),
    email: String(s.email || '').trim().toLowerCase().slice(0, 120),
    phone: String(s.phone || '').replace(/\D/g, '').slice(0, 13),
    document: String(s.document || '').replace(/\D/g, '').slice(0, 14),
    playerId: String(s.playerId || '').replace(/\D/g, '').slice(0, 20),
    items,
    totalCents: Number(s.totalCents) || 0,
    amount_cents: Number(s.totalCents) || 0,
    utm,
    user_agent: String(s.user_agent || fallbackUa || '').slice(0, 300),
  };
}

const PAID_STATES = ['PAID', 'COMPLETED', 'APPROVED', 'CONFIRMED'];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return jsonResponse(res, 400, { error: 'payload_invalido' });

  const txId = String(body.txId || '').trim();
  if (!/^[A-Za-z0-9_\-\.]{4,80}$/.test(txId)) {
    return jsonResponse(res, 400, { error: 'txId_invalido' });
  }

  const user_ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || '';
  const sale = sanitizeSale(body.sale, req.headers['user-agent']);
  sale.user_ip = user_ip;

  // Se já foi aprovada nesta instância, não repete (dedup local best-effort).
  try {
    const local = await getSale(txId);
    if (local && local.lowtrackApproved) {
      return jsonResponse(res, 200, { ok: true, already: true, status: 'PAID' });
    }
  } catch {}

  // Confere status na Duttyfy (1 chamada — cabe no maxDuration 9s do Hobby).
  // Se ainda não confirmou, o webhook da Duttyfy dispara o approved depois (backup).
  let paid = false;
  try {
    const remote = await getSaleStatus(txId);
    const st = String(remote?.status || '').toUpperCase();
    if (PAID_STATES.includes(st)) paid = true;
    else if (['CANCELLED', 'CANCELED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(st)) {
      return jsonResponse(res, 200, { ok: false, status: st });
    }
  } catch (err) {
    if (!(err instanceof DuttyfyAuthError || err instanceof DuttyfyApiError || err instanceof DuttyfyNetworkError)) {
      console.error('[confirm] erro inesperado consultando Duttyfy', txId, err.message);
    }
    return jsonResponse(res, 200, { ok: false, status: 'ERROR', detail: err.message });
  }

  if (!paid) {
    return jsonResponse(res, 200, { ok: false, status: 'PENDING' });
  }

  // PAID confirmado → dispara approved COM as UTMs do cliente.
  console.log('[confirm][AUDIT] disparando approved (client-confirm)', {
    txId, at: new Date().toISOString(),
    utmKeys: sale.utm ? Object.keys(sale.utm) : [],
    email: sale.email,
  });
  try {
    const r = await sendLowtrackEvent(sale, 'approved', txId, { source: 'client-confirm', user_ip, user_agent: sale.user_agent });
    try {
      await updateStatus(txId, 'PAID', {
        paidAt: new Date().toISOString(),
        lowtrackApproved: true,
        lowtrackApprovedAt: new Date().toISOString(),
        source: 'client-confirm',
      });
    } catch {}
    const ok = !!(r && (r.ok || (r.status >= 200 && r.status < 300)));
    return jsonResponse(res, 200, { ok, status: 'PAID', lowtrack: r?.status || r?.error || (r?.skipped ? 'skipped' : 'sent') });
  } catch (err) {
    console.error('[confirm] erro ao disparar approved', txId, err.message);
    return jsonResponse(res, 200, { ok: false, status: 'PAID', error: err.message });
  }
}
