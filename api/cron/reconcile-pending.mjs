// Cron job: reconcilia vendas pendentes consultando a Duttyfy.
// Roda a cada 5 minutos via Vercel Cron.
//
// Pra cada venda com status PENDING há mais de 2 minutos:
//   1. Consulta a Duttyfy pra confirmar o status real
//   2. Se PAID/PAGA/COMPLETED → dispara sale.approved pra LowTrack
//   3. Se EXPIRED/CANCELLED → atualiza status no storage (sem disparar LowTrack)
//
// Isso cobre os cenários onde o webhook da Duttyfy:
//   - Chegou só com status PENDING inicial (antes do pagamento)
//   - Nunca chegou

import { listSales, updateStatus } from '../_lib/storage.js';
import { sendLowtrackEvent } from '../_lib/lowtrack.js';
import { getSaleStatus, DuttyfyAuthError, DuttyfyApiError, DuttyfyNetworkError } from '../_lib/duttyfy.js';

const MIN_AGE_MS = 2 * 60 * 1000; // só reconcilia vendas com mais de 2min
const MAX_PER_RUN = 50; // não martela a Duttyfy — processa até 50 por vez

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // Segurança: Vercel Cron manda header Authorization Bearer com CRON_SECRET.
  // Se não tiver CRON_SECRET configurado, exige header x-cron-token.
  const authHeader = req.headers['authorization'] || '';
  const cronToken = process.env.CRON_SECRET || process.env.RECONCILE_TOKEN;
  if (cronToken) {
    const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-token'];
    if (provided !== cronToken) {
      return jsonResponse(res, 401, { error: 'unauthorized' });
    }
  }

  console.log('[cron] reconcile-pending iniciado');
  const all = await listSales();
  const now = Date.now();

  const pending = all.filter((s) => {
    if (s.status !== 'PENDING') return false;
    // Proteção: só processa vendas com mais de 2min (evita racing com webhook real)
    if (!s.createdAt) return false;
    if (now - s.createdAt < MIN_AGE_MS) return false;
    return true;
  }).slice(0, MAX_PER_RUN);

  console.log(`[cron] ${pending.length} vendas pendentes pra reconciliar`);

  const results = [];
  for (const s of pending) {
    try {
      const remote = await getSaleStatus(s.id);
      const remoteStatus = String(remote?.status || '').toUpperCase();
      console.log(`[cron] ${s.id} → Duttyfy=${remoteStatus}`);

      if (remoteStatus === 'PAID' || remoteStatus === 'COMPLETED' || remoteStatus === 'APPROVED' || remoteStatus === 'CONFIRMED') {
        // Atualiza storage
        await updateStatus(s.id, 'PAID', {
          paidAt: remote.paidAt || new Date().toISOString(),
          reconciledBy: 'cron',
          reconciledAt: now,
        });
        // Dispara approved pra LowTrack
        const saleForLowtrack = {
          name: s.name,
          email: s.email,
          phone: s.phone,
          document: s.document,
          items: s.items,
          totalCents: s.totalCents,
          amount_cents: s.totalCents,
          utm: s.utm,
          user_ip: s.user_ip,
          user_agent: s.user_agent,
          product_name: 'Pedido Free Fire',
        };
        const r = await sendLowtrackEvent(saleForLowtrack, 'approved', s.id, { source: 'cron-reconcile' });
        results.push({ txId: s.id, action: 'approved', lowtrack: r.ok ? 'ok' : 'failed' });
      } else if (remoteStatus === 'EXPIRED') {
        await updateStatus(s.id, 'EXPIRED', { expiredAt: now, reconciledBy: 'cron' });
        results.push({ txId: s.id, action: 'expired' });
      } else if (remoteStatus === 'CANCELLED') {
        await updateStatus(s.id, 'CANCELLED', { cancelledAt: now, reconciledBy: 'cron' });
        results.push({ txId: s.id, action: 'cancelled' });
      } else {
        // PENDING mesmo — não faz nada
        results.push({ txId: s.id, action: 'still_pending' });
      }
    } catch (err) {
      if (err instanceof DuttyfyAuthError || err instanceof DuttyfyNetworkError || err instanceof DuttyfyApiError) {
        console.warn(`[cron] ${s.id} erro Duttyfy: ${err.message}`);
        results.push({ txId: s.id, action: 'error', error: err.message });
      } else {
        console.error(`[cron] ${s.id} erro: ${err.message}`);
        results.push({ txId: s.id, action: 'error', error: err.message });
      }
    }
  }

  const summary = {
    total: pending.length,
    approved: results.filter(r => r.action === 'approved').length,
    expired: results.filter(r => r.action === 'expired').length,
    cancelled: results.filter(r => r.action === 'cancelled').length,
    still_pending: results.filter(r => r.action === 'still_pending').length,
    errors: results.filter(r => r.action === 'error').length,
    results,
  };

  console.log('[cron] resumo:', JSON.stringify(summary));
  return jsonResponse(res, 200, summary);
}
