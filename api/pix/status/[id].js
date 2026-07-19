import { getSale } from '../../_lib/storage.js';
import { getSaleStatus, DuttyfyAuthError, DuttyfyApiError, DuttyfyNetworkError } from '../../_lib/duttyfy.js';
import { updateStatus } from '../../_lib/storage.js';
// NOTA: este endpoint SÓ reporta status. O evento `approved` pra LowTrack é
// disparado por /api/pix/confirm (com UTMs do cliente) e pelo webhook da Duttyfy.
// Antes daqui saía approved com utm:{} (cold-recovery), que ganhava o dedup da
// LowTrack e gravava a conversão SEM UTM. Por isso foi removido.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return res;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'method_not_allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_\-]{4,80}$/.test(id)) {
    return jsonResponse(res, 400, { error: 'id_invalido' });
  }

  const local = await getSale(id);

  // IMPORTANTE: SEMPRE consulta a Duttyfy como fonte da verdade, mesmo se o local diz PAID.
  // Bug crítico: o webhook tem fallback agressivo de extractStatus que pode marcar PAID
  // por engano (evento "transaction.paid" com status real PENDING). Se confiarmos no local,
  // um pagamento que nunca aconteceu vira "aprovado" e dispara Purchase no Meta / libera upsell.
  // A Duttyfy é quem tem o status real do PIX — confiamos só nela.
  try {
    const remote = await getSaleStatus(id);
    let nextStatus = 'PENDING';
    let paidAt = null;
    const rawStatus = String(remote.status || '').toUpperCase();
    const wasAlreadyPaid = local && local.status === 'PAID' && local.lowtrackApproved;

    if (['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED'].includes(rawStatus)) {
      nextStatus = 'PAID';
      paidAt = remote.paidAt || new Date().toISOString();
      // Só reporta/atualiza status. O approved (com UTMs) sai pelo /api/pix/confirm
      // e pelo webhook da Duttyfy — aqui NÃO disparamos mais (evita approved sem UTM).
      console.log('[status][AUDIT] PAID confirmado via Duttyfy (approved sai via confirm/webhook)', {
        transactionId: id, at: new Date().toISOString(), rawStatus, wasAlreadyPaidInLocal: wasAlreadyPaid,
      });
      await updateStatus(id, 'PAID', { paidAt, remoteCheckedAt: Date.now() });
    } else if (['CANCELLED', 'CANCELED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(rawStatus)) {
      nextStatus = rawStatus === 'CANCELED' ? 'CANCELLED' : rawStatus;
      await updateStatus(id, nextStatus, { paidAt, remoteCheckedAt: Date.now() });
    } else {
      await updateStatus(id, nextStatus, { remoteCheckedAt: Date.now() });
    }
    return jsonResponse(res, 200, { id, status: nextStatus, paidAt });
  } catch (err) {
    if (err instanceof DuttyfyAuthError || err instanceof DuttyfyNetworkError || err instanceof DuttyfyApiError) {
      // Se falhou de consultar Duttyfy E local existe, usa local; senão devolve PENDING
      const fallbackStatus = (local && local.status) || 'PENDING';
      return jsonResponse(res, 200, { id, status: fallbackStatus, paidAt: (local && local.paidAt) || null });
    }
    console.error('Erro inesperado em status/[id].js', err);
    const fallbackStatus = (local && local.status) || 'PENDING';
    return jsonResponse(res, 200, { id, status: fallbackStatus, paidAt: (local && local.paidAt) || null });
  }
}