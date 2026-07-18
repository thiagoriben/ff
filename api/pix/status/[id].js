import { getSale } from '../../_lib/storage.js';
import { getSaleStatus, DuttyfyAuthError, DuttyfyApiError, DuttyfyNetworkError } from '../../_lib/duttyfy.js';
import { updateStatus } from '../../_lib/storage.js';
import { sendLowtrackEvent } from '../../_lib/lowtrack.js';

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
      // AUDITORIA: loga toda vez que o backend confirma PAID via Duttyfy.
      // Se o frontend disparar Purchase sem essa linha no log, é bug.
      console.log('[status][AUDIT] confirmando PAID via Duttyfy', {
        transactionId: id,
        at: new Date().toISOString(),
        rawStatus,
        duttyfyPaidAt: remote.paidAt,
        wasAlreadyPaidInLocal: wasAlreadyPaid,
        remoteKeys: remote?.raw ? Object.keys(remote.raw) : [],
        hasCustomerInRemote: !!(remote?.raw?.customer || remote?.raw?.data?.customer),
        hasAmountInRemote: !!(remote?.raw?.amount || remote?.raw?.data?.amount),
      });

      // NOVO: se a venda AINDA não foi aprovada na LowTrack (caso onde a
      // Duttyfy não mandou webhook OU mandou em instância cold e evaporou),
      // dispara agora. Resolve o bug onde o frontend pollingava e via PAID
      // mas o webhook nunca chegou (ou chegou sem UTMs completas).
      if (!wasAlreadyPaid) {
        try {
          if (!local) {
            // Cold start: storage vazio. Reconstruir payload mínimo a partir
            // do que tem (data Duttyfy já devolvida em remote.raw.customer etc).
            // Sem UTMs completas, mas MELHOR que perder a conversão.
            const customerObj = remote?.raw?.customer || remote?.raw?.data?.customer || {};
            const itemsRaw = remote?.raw?.data?.items || remote?.raw?.items;
            const reconstructed = {
              transactionId: id,
              name: customerObj.name || '',
              email: customerObj.email || '',
              phone: String(customerObj.phone || customerObj.phoneNumber || '').replace(/\D/g, ''),
              document: String(customerObj.document?.number || customerObj.document || customerObj.documentNumber || '').replace(/\D/g, ''),
              items: Array.isArray(itemsRaw) ? itemsRaw : [{ id: 1, title: 'Pedido Free Fire', name: 'Pedido Free Fire', price: 0, qty: 1, total: 0 }],
              totalCents: remote?.raw?.amount || remote?.raw?.data?.amount || 0,
              amount_cents: remote?.raw?.amount || remote?.raw?.data?.amount || 0,
              utm: {},
              user_ip: '',
              user_agent: 'status-polling-cold-recovery',
            };
            console.log('[status][AUDIT] cold recovery: disparando approved com payload reconstruído (sem UTMs)', { transactionId: id });
            const r = await sendLowtrackEvent(reconstructed, 'approved', id, { source: 'status-polling-cold-recovery' });
            if (r && r.ok) {
              console.log('[status][AUDIT] cold recovery OK', { transactionId: id, http: r.status });
            } else {
              console.warn('[status][AUDIT] cold recovery enviou mas LowTrack retornou', { transactionId: id, status: r?.status, error: r?.error, skipped: r?.skipped, reason: r?.reason });
            }
          } else {
            console.log('[status][AUDIT] disparando approved via polling', { transactionId: id });
            await sendLowtrackEvent(local, 'approved', id, { source: 'status-polling' });
          }
          await updateStatus(id, 'PAID', {
            paidAt,
            lowtrackApproved: true,
            lowtrackApprovedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[status] erro ao disparar approved:', id, err.message);
          await updateStatus(id, nextStatus, { paidAt, remoteCheckedAt: Date.now() });
        }
      } else {
        await updateStatus(id, nextStatus, { paidAt, remoteCheckedAt: Date.now() });
      }
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