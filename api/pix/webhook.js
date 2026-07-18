import { getSale, updateStatus } from '../_lib/storage.js';
import { sendLowtrackEvent } from '../_lib/lowtrack.js';
import { getSaleStatus } from '../_lib/duttyfy.js';
import { waitUntil } from '@vercel/functions';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return res;
}

function extractTransactionId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  // A Duttyfy pode mandar _id.$oid OU transactionId OU id.
  const candidates = [
    payload?.data?.id,
    payload?.data?.transactionId,
    payload?.data?.transaction_id,
    payload?.data?.saleId,
    payload?.data?.sale_id,
    payload?.data?.external_id,
    payload?.data?.reference,
    payload?.data?._id?.$oid,  // novo formato da Duttyfy
    payload?.id,
    payload?.transactionId,
    payload?.transaction_id,
    payload?._id?.$oid,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^[A-Za-z0-9_\-]{4,80}$/.test(c)) return c;
  }
  return null;
}

// Extrai o amount em CENTAVOS (formato interno do projeto).
// A Duttyfy já devolve amount em CENTAVOS — não multiplicamos.
function extractAmount(payload) {
  if (!payload) return null;
  const candidates = [
    payload?.amount,              // novo formato Duttyfy (raiz)
    payload?.data?.amount,
    payload?.paidAmount,
    payload?.data?.paidAmount,
    payload?.data?.items?.price,  // itens como objeto: {price: 200}
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

// Extrai dados do cliente do webhook Duttyfy (pode vir em `customer` na raiz
// ou em `data.customer`).
function extractCustomer(payload) {
  const c = payload?.customer || payload?.data?.customer || payload?.payment?.customer || {};
  return {
    name: String(c.name || '').trim(),
    email: String(c.email || '').trim().toLowerCase(),
    phone: String(c.phone || c.phoneNumber || '').replace(/\D/g, ''),
    document: String(c.document?.number || c.document || c.documentNumber || '').replace(/\D/g, ''),
  };
}

function extractUtm(payload) {
  // A Duttyfy pode mandar UTM como objeto OU string crua "utm_source=FB&utm_medium=...".
  // Aqui normalizamos pra sempre devolver objeto.
  const raw = payload?.utm || payload?.data?.utm || payload?.tracking?.utm;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const obj = {};
    if (!raw) return obj;
    const s = raw.replace(/^\?/, '');
    for (const part of s.split('&')) {
      const [k, v] = part.split('=');
      if (k && v) {
        try { obj[decodeURIComponent(k)] = decodeURIComponent(v); }
        catch { obj[k] = v; }
      }
    }
    return obj;
  }
  return {};
}

// Status final consolidado: prioriza status EXPLÍCITO, depois infere do event.
// CRÍTICO: só considera PAID quando houver confirmação EXPLÍCITA do gateway
// (status: PAID/APPROVED/COMPLETED/CONFIRMED/SUCCESS/PAGO).
// ANTES: tinha fallback agressivo que considerava PAID se o nome do evento
// contivesse "paid" (ex: "transaction.paid"). Mas esse nome de evento é
// genérico e pode vir com status PENDING, virando falso positivo que
// marcava vendas não pagas como pagas e disparava Purchase no Meta.
// Só infere por nome do evento em casos não-PIX (refund/cancel/expire/fail).
function extractStatus(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const event = String(payload.event || payload.type || payload?.data?.event || payload?.data?.type || '').toLowerCase();
  // Status pode vir em vários lugares — Duttyfy manda em raiz do payload
  const status = String(
    payload?.status ||     // formato raiz do payload Duttyfy
    payload?.data?.status ||
    payload?.data?.state ||
    payload?.state ||
    ''
  ).toUpperCase();

  // status explícito vence — incluindo COMPLETED que é o que a Duttyfy manda
  if (['PAID', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'SUCCESS', 'PAGO', 'CONCLUIDA', 'CONCLUIDO', 'RECEIVED'].includes(status)) return 'PAID';
  if (status === 'FAILED') return 'FAILED';
  if (['CANCELLED', 'CANCELED', 'EXPIRED', 'REFUNDED'].includes(status)) {
    return status === 'CANCELED' ? 'CANCELLED' : status;
  }
  // Se o status está como PENDING (ou vazio), NUNCA infere PAID pelo nome do evento.
  // O nome "transaction.paid" sozinho não significa que o PIX caiu — só a Duttyfy
  // confirma isso via /api/pix/status/<id>. Se chegou webhook sem status conclusivo,
  // a gente consulta a Duttyfy sob demanda (o status/[id].js faz isso automaticamente).
  if (event.includes('refund') || event.includes('reembolso') || event.includes('estorno')) return 'REFUNDED';
  if (event.includes('cancel')) return 'CANCELLED';
  if (event.includes('expire')) return 'EXPIRED';
  if (event.includes('fail')) return 'FAILED';
  // Status inconclusivo (ex: "transaction.paid" com status: PENDING ou ausente).
  // Devolve null pra que o /api/pix/status/[id].js consulte a Duttyfy quando o
  // frontend perguntar. Assim a venda SÓ vira PAID com confirmação real.
  return null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'method_not_allowed' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }

  const transactionId = extractTransactionId(payload);
  let status = extractStatus(payload);

  // Log de auditoria: registra IP de origem do webhook (servidor da Duttyfy)
  try {
    const originIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    console.log('[webhook] recebido de', originIp,
      'evento=', payload?.event || payload?.type,
      'status=', payload?.status || payload?.data?.status,
      'txId=', transactionId);
    // Log do payload bruto pra debug (sem dados sensíveis do cliente)
    console.log('[webhook] payload keys:', Object.keys(payload || {}));
    if (payload?.data && typeof payload.data === 'object') {
      console.log('[webhook] payload.data keys:', Object.keys(payload.data));
    }
    // Log do sample (incluindo status raiz pra debug novo formato)
    console.log('[webhook] sample:', JSON.stringify({
      status_raiz: payload?.status,
      status_data: payload?.data?.status,
      transactionId_raiz: payload?.transactionId,
      transactionId_data: payload?.data?.transactionId,
      oid_raiz: payload?._id?.$oid,
      oid_data: payload?.data?._id?.$oid,
      amount_raiz: payload?.amount,
      utm_tipo: typeof payload?.utm,
      utm_sample: typeof payload?.utm === 'string' ? payload.utm.slice(0, 80) : 'object',
    }));
  } catch {}

  // CRÍTICO: a Duttyfy às vezes manda webhook inicial com nome "transaction.paid"
  // mas com status PENDING (é só notificação de criação, não de pagamento).
  // O extractStatus agora retorna null pra esse caso (correto, evita falso positivo),
  // mas se a venda realmente foi paga e o webhook veio incompleto, precisamos
  // consultar a Duttyfy aqui pra confirmar antes de descartar.
  // Se a Duttyfy disser PAID/COMPLETED, atualizamos o status e disparamos o approved.
  //
  // FALLBACK EXTRA: a Duttyfy também pode "esquecer" o status PAID (responder
  // PENDING pra uma venda que realmente caiu). Se o storage local já tem PAID
  // (gravado por um webhook anterior válido com status EXPLÍCITO), confiamos
  // nele e disparamos o approved de novo — caso a LowTrack tenha perdido o evento.
  if (status === null) {
    // 1) Tenta confirmar pelo storage local (se já tinha PAID antes)
    try {
      const localCheck = await getSale(transactionId);
      if (localCheck && localCheck.status === 'PAID' && localCheck.paidAt) {
        status = 'PAID';
        console.log('[webhook] storage local já tinha PAID para', transactionId, '— disparando approved sem consultar Duttyfy');
      }
    } catch {}

    // 2) Se ainda null, consulta a Duttyfy com RETRY+BACKOFF.
    // A Duttyfy pode demorar 1-5s pra normalizar o status depois do pagamento.
    // Como esse webhook tá dentro do budget de 9s do Hobby, dá pra fazer
    // 3 tentativas com backoff (1s + 2s + 4s = 7s total) antes de desistir.
    if (status === null) {
      const DELAYS_MS = [1000, 2000, 4000]; // 3 tentativas: 1s, 2s, 4s
      for (let attempt = 0; attempt <= DELAYS_MS.length; attempt++) {
        try {
          if (attempt === 0) {
            console.log('[webhook] status inconclusivo no payload, consultando Duttyfy (tentativa 1) para', transactionId);
          } else {
            console.log(`[webhook] retry ${attempt + 1}/${DELAYS_MS.length + 1} após ${DELAYS_MS[attempt - 1]}ms`);
          }
          const remote = await getSaleStatus(transactionId);
          const remoteStatus = String(remote?.status || '').toUpperCase();
          console.log(`[webhook] Duttyfy retornou status=${remoteStatus} (tentativa ${attempt + 1})`);

          if (remoteStatus === 'PAID' || remoteStatus === 'COMPLETED' || remoteStatus === 'APPROVED' || remoteStatus === 'CONFIRMED') {
            status = 'PAID';
            console.log('[webhook] confirmado PAID via Duttyfy para', transactionId);
            break;
          } else if (remoteStatus === 'CANCELLED' || remoteStatus === 'CANCELED') {
            status = 'CANCELLED';
            break;
          } else if (remoteStatus === 'EXPIRED') {
            status = 'EXPIRED';
            break;
          } else if (remoteStatus === 'FAILED') {
            status = 'FAILED';
            break;
          } else if (remoteStatus === 'REFUNDED') {
            status = 'REFUNDED';
            break;
          }
          // Se retornou PENDING ou outro status não-terminal, tenta de novo
          if (attempt < DELAYS_MS.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[attempt]));
          }
        } catch (err) {
          console.warn(`[webhook] falha na tentativa ${attempt + 1} de consultar Duttyfy:`, err.message);
          if (attempt < DELAYS_MS.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[attempt]));
          }
        }
      }
      // Se depois de tudo ainda tá null, o /api/pix/status/[id].js
      // vai consultar a Duttyfy quando o frontend perguntar via polling.
    }
  }

  if (!transactionId) {
    console.warn('Webhook sem transactionId', payload);
    return jsonResponse(res, 200, { received: true, ignored: true, reason: 'no_id' });
  }

  const existing = await getSale(transactionId);
  const payloadAmount = extractAmount(payload);
  const payloadCustomer = extractCustomer(payload);
  const payloadUtm = extractUtm(payload);

  // DIAGNÓSTICO: loga se o storage está vazio (cold start = root cause de approved perdido)
  if (!existing) {
    console.warn('[webhook] storage VAZIO para', transactionId, '— cold start provável. Usando dados do payload Duttyfy.');
  }

  // Monta objeto "sale" pra enviar à LowTrack.
  // Prioridade: storage (mais completo) → payload Duttyfy.
  // CORREÇÃO CRÍTICA: quando existing é null (cold start no Vercel Hobby),
  // os campos vinham todos vazios e a LowTrack rejeitava silenciosamente.
  // Agora usa payloadCustomer como fallback real.
  const saleForLowtrack = {
    name: existing?.name || payloadCustomer.name || 'Cliente Free Fire',
    email: existing?.email || payloadCustomer.email || '',
    phone: existing?.phone || payloadCustomer.phone || '',
    document: existing?.document || payloadCustomer.document || '',
    playerId: existing?.playerId || '',
    items: existing?.items || [{ id: 1, title: 'Pedido Free Fire', name: 'Pedido Free Fire', price: payloadAmount || 0, qty: 1, total: payloadAmount || 0 }],
    totalCents: existing?.totalCents || payloadAmount || 0,
    amount_cents: payloadAmount || existing?.totalCents || 0,
    utm: { ...(existing?.utm || {}), ...payloadUtm },
    user_ip: existing?.user_ip || '',
    user_agent: existing?.user_agent || '',
    product_name: 'Pedido Free Fire',
  };

  // Log de divergência financeira
  if (payloadAmount && existing?.totalCents && payloadAmount !== existing.totalCents) {
    console.error('[webhook] DIVERGÊNCIA valor', {
      transactionId,
      esperado: existing.totalCents,
      recebido: payloadAmount,
      diff: payloadAmount - existing.totalCents,
    });
    try {
      await updateStatus(transactionId, status || existing.status || 'PENDING', {
        amountMismatch: { expected: existing.totalCents, received: payloadAmount },
      });
    } catch {}
  }

  // Dispara evento LowTrack — SEM depender do storage estar presente.
  // IMPORTANTE: assim como create.js, NÃO dependemos só do waitUntil.
  // Vercel Hobby pode matar o background imediatamente após res.end(),
  // então primeiro tentamos concluir via await com timeout curto, e o
  // waitUntil serve apenas como redundância para o caso de o fetch
  // demorar mais que a janela. Sem isso, sale.approved se perde e a
  // LowTrack só vê o pending (que é o sintoma reportado).
  if (status === 'PAID') {
    // AUDITORIA: loga toda aprovação disparada, com origem e timestamp.
    // Se aparecer "approved" no LowTrack sem essa linha no log, é bug.
    console.log('[lowtrack][AUDIT] disparando approved', {
      transactionId,
      at: new Date().toISOString(),
      source: 'duttyfy-webhook',
      hadStorage: !!existing,
      storageStatus: existing?.status,
      storagePaidAt: existing?.paidAt,
      saleEmail: saleForLowtrack.email,
      saleName: saleForLowtrack.name,
      saleAmount: saleForLowtrack.totalCents,
    });
    const approvedPromise = sendLowtrackEvent(saleForLowtrack, 'approved', transactionId, { source: 'duttyfy-webhook' })
      .then((result) => {
        console.log('[lowtrack][AUDIT] approved resultado', transactionId, result?.ok ? 'OK' : 'FAIL', result?.status || result?.error || '');
        return result;
      })
      .catch((err) => console.error('[lowtrack] approved erro', transactionId, err.message));
    waitUntil(approvedPromise);
    // Aguarda até 6s (cabe dentro do maxDuration 9s do Hobby e dá folga
    // pro timeout de 8s do postToLowtrack).
    await Promise.race([
      approvedPromise,
      new Promise((resolve) => setTimeout(resolve, 6000)),
    ]);
  } else if (status === 'REFUNDED') {
    console.log('[lowtrack] disparando refunded', transactionId);
    const refundedPromise = sendLowtrackEvent(saleForLowtrack, 'refunded', transactionId, { source: 'duttyfy-webhook' })
      .catch((err) => console.error('[lowtrack] refunded erro', transactionId, err.message));
    waitUntil(refundedPromise);
    await Promise.race([
      refundedPromise,
      new Promise((resolve) => setTimeout(resolve, 6000)),
    ]);
  }

  // Atualiza storage (best-effort, não bloqueia o evento LowTrack acima)
  // CORREÇÃO: SEMPRE persiste no storage, mesmo se existing era null (cold start).
  // Antes, a branch `else if (status)` NÃO setava lowtrackApproved=true, causando
  // re-disparo de approved pelo status/[id].js (polling do frontend).
  try {
    const baseData = existing || {};
    const isApproved = status === 'PAID';
    await updateStatus(transactionId, status || baseData.status || 'PENDING', {
      paidAt: isApproved ? (payload?.data?.paidAt || payload?.paidAt || new Date().toISOString()) : undefined,
      paidAmount: payloadAmount,
      raw: payload,
      webhookAt: Date.now(),
      // Sempre marca lowtrackApproved quando status=PAID (independente de ter existing)
      ...(isApproved ? { lowtrackApproved: true, lowtrackApprovedAt: new Date().toISOString() } : {}),
      // Se não tinha no storage, salva dados do customer pra uso futuro
      ...(!existing ? {
        source: 'webhook-only',
        customer: payloadCustomer,
        name: payloadCustomer.name,
        email: payloadCustomer.email,
        phone: payloadCustomer.phone,
        document: payloadCustomer.document,
        utm: payloadUtm,
        totalCents: payloadAmount || 0,
        createdAt: Date.now(),
      } : {}),
    });
  } catch (e) {
    console.warn('[webhook] updateStatus falhou', transactionId, e.message);
  }

  return jsonResponse(res, 200, { received: true });
}