import { createSale, DuttyfyAuthError, DuttyfyApiError, DuttyfyNetworkError, isValidCPF, generateValidOrKnownCPF } from '../_lib/duttyfy.js';
import { setSale, listSales } from '../_lib/storage.js';
import { sendLowtrackEvent } from '../_lib/lowtrack.js';
import { startWatcher } from '../_lib/watcher.js';
import { waitUntil } from '@vercel/functions';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cache de idempotência local ao módulo — sobrevive entre requests dentro
// da mesma instância da função. Vercel Hobby roda instâncias separadas por
// request, mas se várias chamadas consecutivas caírem na mesma instância,
// este cache pega. TTL 30 min.
const idemCache = new Map(); // clientRequestId -> { at, sale }
const IDEM_TTL_MS = 30 * 60 * 1000;
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idemCache.entries()) {
    if (now - v.at > IDEM_TTL_MS) idemCache.delete(k);
  }
}, 10 * 60 * 1000);
if (timer && typeof timer.unref === 'function') timer.unref();

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

function badRequest(res, error) {
  return jsonResponse(res, 400, { error });
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonResponse(res, 400, { error: 'payload_invalido', detail: 'body_nao_e_json' });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(res, 400, {
      error: 'payload_invalido',
      detail: 'body_vazio_ou_invalido',
      bodyType: typeof body,
      isArray: Array.isArray(body),
      preview: JSON.stringify(body).slice(0, 100),
    });
  }

  const { email, name, phone, document, items, totalCents, utm, playerId } = body;

// Normaliza UTMs: aceita objeto OU string crua "utm_source=x&utm_medium=y"
// (vinda do window.location.search do frontend). Garante que Duttyfy e LowTrack
// sempre recebam UTMs completas, mesmo se a página atual (parte1.html) não tem
// os params na URL — porque elas foram propagadas via sessionStorage.
function normalizeUtm(utmInput) {
  if (!utmInput) return {};
  if (typeof utmInput === 'string') {
    // Remove leading "?" se vier
    const s = utmInput.replace(/^\?/, '');
    const obj = {};
    if (!s) return obj;
    for (const part of s.split('&')) {
      const [k, v] = part.split('=');
      if (k && v) obj[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return obj;
  }
  if (typeof utmInput === 'object') return utmInput;
  return {};
}

const utmNormalized = normalizeUtm(utm);

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return badRequest(res, 'email_invalido');
  }

  if (!name || typeof name !== 'string' || name.trim().length < 3) {
    return badRequest(res, 'nome_invalido');
  }

  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    return badRequest(res, 'telefone_invalido');
  }

  const documentDigits = String(document || '').replace(/\D/g, '');
  if (documentDigits.length !== 11) {
    return badRequest(res, 'cpf_invalido');
  }

  // ID da conta Free Fire (6 a 20 dígitos, não-todo-zero). É CRÍTICO:
  // é pra essa conta que os diamantes vão. Sem isso, a entrega falha.
  const playerIdDigits = String(playerId || '').replace(/\D/g, '').slice(0, 20);
  if (playerIdDigits.length < 6 || playerIdDigits.length > 20 || /^0+$/.test(playerIdDigits)) {
    return badRequest(res, 'player_id_invalido');
  }

  // IDEMPOTÊNCIA via clientRequestId (FRONTEND GERA 1x POR PÁGINA, MESMO ATÉ RELOAD).
  // Se o frontend reenviar com o MESMO clientRequestId em <30min, retorna a venda
  // existente em vez de criar outra na Duttyfy. Resolve o sintoma "PIX gerado
  // duas vezes" (double-click, retry por 504, navegação back/forward).
  //
  // IMPORTANTE: Vercel Hobby executa cada request numa instância separada
  // da função, então o `storage.js` (Map em memória) zera entre execuções.
  // Por isso mantemos um cache local no próprio módulo (idemCache), que
  // persiste enquanto a instância da função estiver viva (cold start zera,
  // mas isso é raro no Hobby em horário de pico).
  const clientRequestId = String(req.body?.clientRequestId || req.headers['x-idempotency-key'] || '').trim().slice(0, 80);
  if (clientRequestId) {
    // 1) Cache local no módulo (mais rápido e sobrevive entre requests
    //    dentro da mesma instância da função).
    const cached = idemCache.get(clientRequestId);
    if (cached && (Date.now() - cached.at) < 1800_000) { // 30 min
      console.log('[create] idempotência HIT (cache local) crId=', clientRequestId);
      return jsonResponse(res, 200, cached.sale);
    }
    // 2) Fallback no storage global (cobre caso o cache local tenha sido
    //    descartado por cold start entre requests).
    try {
      const all = await listSales();
      const recent = all.find((s) => s.clientRequestId === clientRequestId);
      if (recent) {
        console.log('[create] idempotência HIT (storage) crId=', clientRequestId);
        const saleResp = {
          transactionId: recent.id || recent.transactionId,
          qrCodeBase64: recent.qrCodeBase64 || '',
          copyPaste: recent.copyPaste || '',
          expiresAt: recent.expiresAt || null,
          reused: true,
        };
        idemCache.set(clientRequestId, { at: Date.now(), sale: saleResp });
        return jsonResponse(res, 200, saleResp);
      }
    } catch (err) {
      console.warn('[create] idempotência check (storage) falhou', err.message);
    }
  }

  // FALLBACK: também bloqueia reuso pelo playerId em 60s (cobre quando o
  // frontend não envia clientRequestId, ex: hotfix legado).
  try {
    const all = await listSales();
    const now = Date.now();
    const recent = all.find((s) =>
      s.playerId === playerIdDigits &&
      s.status === 'PENDING' &&
      (now - (s.createdAt || 0)) < 60_000 &&
      Math.abs((s.totalCents || 0) - Number(totalCents)) <= 10
    );
    if (recent) {
      console.log('[create] idempotência FALLBACK HIT playerId=', playerIdDigits);
      const saleResp = {
        transactionId: recent.id || recent.transactionId,
        qrCodeBase64: recent.qrCodeBase64 || '',
        copyPaste: recent.copyPaste || '',
        expiresAt: recent.expiresAt || null,
        reused: true,
      };
      if (clientRequestId) idemCache.set(clientRequestId, { at: Date.now(), sale: saleResp });
      return jsonResponse(res, 200, saleResp);
    }
  } catch {}

  // A Duttyfy valida DV de CPF. Se o cliente mandou placeholder ('00000000000')
  // ou um CPF inválido, gera um CPF válido (aleatório ou conhecido) pra não rejeitar a venda.
  const finalDocument = isValidCPF(documentDigits) ? documentDigits : generateValidOrKnownCPF();

  if (!Array.isArray(items) || items.length === 0) {
    return badRequest(res, 'carrinho_vazio');
  }

  const cleanItems = [];
  let recalculated = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      return badRequest(res, 'item_invalido');
    }
    const name = String(raw.name || '').trim();
    const price = Number(raw.price);
    const qty = Number(raw.qty);
    const id = raw.id !== undefined ? Number(raw.id) : null;
    if (!name) return badRequest(res, 'item_invalido');
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(price)) {
      return badRequest(res, 'item_invalido');
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 50 || !Number.isInteger(qty)) {
      return badRequest(res, 'item_invalido');
    }
    cleanItems.push({
      id,
      title: name.slice(0, 80),
      price,
      qty,
      total: price * qty,
    });
    recalculated += price * qty;
  }

  const clientTotal = Number(totalCents);
  if (!Number.isFinite(clientTotal) || clientTotal <= 0 || !Number.isInteger(clientTotal)) {
    return badRequest(res, 'total_incorreto');
  }
  if (clientTotal !== recalculated) {
    return badRequest(res, 'total_incorreto');
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const postbackUrl = `${proto}://${host}/api/pix/webhook`;

  // Captura IP/UA do cliente real pra enviar à LowTrack (melhora EMQ no CAPI).
  // Estes são os únicos momentos que temos request do cliente — webhook vem do servidor da Duttyfy.
  const user_ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '';
  const user_agent = String(req.headers['user-agent'] || '').slice(0, 300);

  try {
    const sale = await createSale({
      // Duttyfy recebe amount em CENTAVOS — manda direto, sem converter.
      amount: recalculated,
      customer: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phoneDigits,
        document: { number: finalDocument, type: 'cpf' },
      },
      items: cleanItems.map((it) => ({
        title: it.title,
        quantity: it.qty,
        unitPrice: it.price,
      })),
      postbackUrl,
      utm: utmNormalized,
    });

    if (!sale.transactionId) {
      console.error('Duttyfy create-sale sem transactionId', sale.raw);
      return jsonResponse(res, 502, { error: 'duttyfy_resposta_invalida', raw: sale.raw });
    }

    // Se a Duttyfy não mandou pixCode (BR Code), aborta com erro claro.
    if (!sale.copyPaste) {
      console.error('Duttyfy não retornou pixCode no response', sale.raw);
      return jsonResponse(res, 502, { error: 'duttyfy_resposta_invalida', detail: 'pixCode_vazio', raw: sale.raw });
    }

    await setSale(sale.transactionId, {
      status: 'PENDING',
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phoneDigits,
      document: finalDocument,
      playerId: playerIdDigits,
      clientRequestId: clientRequestId || null,
      items: cleanItems,
      totalCents: recalculated,
      qrCodeBase64: sale.qrCodeBase64,
      copyPaste: sale.copyPaste,
      expiresAt: sale.expiresAt,
      utm: utmNormalized,
      user_ip,
      user_agent,
      createdAt: Date.now(),
      source: 'create.js',
    });

    // Salva no cache de idempotência pra próximas chamadas com mesmo crId
    // (mesmo dentro da mesma instância da função) voltarem a mesma venda.
    if (clientRequestId) {
      idemCache.set(clientRequestId, {
        at: Date.now(),
        sale: {
          transactionId: sale.transactionId,
          qrCodeBase64: sale.qrCodeBase64 || '',
          copyPaste: sale.copyPaste || '',
          expiresAt: sale.expiresAt || null,
          reused: true,
        },
      });
    }

    // Dispara evento "pending" pra LowTrack (best-effort, mas SEM depender só do waitUntil).
    // O Vercel Hobby às vezes mata o waitUntil cedo demais (especialmente em cold starts
    // ou quando o response já foi enviado). Pra garantir que o evento sai:
    //   1. Espera o fetch resolver (await direto, com timeout curto)
    //   2. Loga o resultado pra debug
    //   3. Se o frontend demorar a redirecionar, dá tempo de concluir
    // O endpoint inteiro está dentro do maxDuration de 10s do Hobby, e o postToLowtrack
    // tem timeout de 6s, então cabe.
    const stored = {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phoneDigits,
      document: finalDocument,
      playerId: playerIdDigits,
      items: cleanItems,
      totalCents: recalculated,
      utm: utmNormalized,
      user_ip,
      user_agent,
    };
    console.log('[lowtrack] disparando pending', sale.transactionId, 'utm=', JSON.stringify(utmNormalized));
    const lowtrackPromise = sendLowtrackEvent(stored, 'pending', sale.transactionId, { user_ip, user_agent, source: 'create.js' })
      .catch((err) => console.error('[lowtrack] pending erro', sale.transactionId, err.message));
    // Mantém a promise viva APÓS res.end via waitUntil (redundância).
    waitUntil(lowtrackPromise);
    // Também tenta concluir ANTES de res.end pra não depender do waitUntil.
    // Se demorar mais que 5s, segue o baile e o waitUntil cobre.
    await Promise.race([
      lowtrackPromise,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    // Inicia watcher que faz polling ativo na Duttyfy.
    // Resolve o caso onde a Duttyfy NÃO manda webhook de aprovação —
    // o watcher detecta o PAID sozinho e dispara sale.approved.
    startWatcher(sale.transactionId, stored);

    return jsonResponse(res, 200, {
      transactionId: sale.transactionId,
      qrCodeBase64: sale.qrCodeBase64,
      copyPaste: sale.copyPaste,
      expiresAt: sale.expiresAt,
    });
  } catch (err) {
    if (err instanceof DuttyfyAuthError) {
      console.error('[gateway] auth error', err.message);
      return jsonResponse(res, 502, { error: 'duttyfy_offline', detail: err.message });
    }
    if (err instanceof DuttyfyNetworkError) {
      console.error('[gateway] network error', err.message);
      return jsonResponse(res, 502, { error: 'duttyfy_offline', detail: err.message });
    }
    if (err instanceof DuttyfyApiError) {
      console.error('[gateway] api error', err.status, err.message, err.body);
      return jsonResponse(res, 502, { error: 'duttyfy_rejeitado', detail: err.message, gatewayBody: err.body, gatewayStatus: err.status });
    }
    console.error('Erro inesperado em create.js', err.message, err.stack);
    return jsonResponse(res, 500, { error: 'erro_interno', detail: err.message });
  }
}