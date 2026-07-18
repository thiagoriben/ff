// Helper server-side para a Duttyfy PIX API.
// IMPORTANTE: este módulo NUNCA deve ser importado pelo front-end.
// A URL encriptada é lida exclusivamente de process.env.DUTTYFY_PIX_URL_ENCRYPTED.

// --- Classes de erro ---
class DuttyfyAuthError extends Error {
  constructor(m) { super(m); this.name = 'DuttyfyAuthError'; this.status = 401; }
}
class DuttyfyApiError extends Error {
  constructor(m, s, b) { super(m); this.name = 'DuttyfyApiError'; this.status = s; this.body = b; }
}
class DuttyfyNetworkError extends Error {
  constructor(m) { super(m); this.name = 'DuttyfyNetworkError'; this.status = 502; }
}

function getEncryptedUrl() {
  let url = process.env.DUTTYFY_PIX_URL_ENCRYPTED || '';
  // Remove BOM invisível () que às vezes vem do PowerShell ao setar env vars.
  // Também remove espaços / newlines nas pontas.
  if (url.charCodeAt(0) === 0xFEFF) url = url.slice(1);
  url = url.trim();
  if (!url) throw new DuttyfyAuthError('DUTTYFY_PIX_URL_ENCRYPTED não configurada');
  return url;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Monta a string "utm=..." que a Duttyfy aceita. Aceita objeto de UTMs vindo do front.
function buildUtmString(utmInput) {
  if (!utmInput) return '';
  // Se já é string, usa como está (front manda string crua com utm_source=...&...)
  if (typeof utmInput === 'string') return utmInput.replace(/^\?/, '');
  // Se é objeto, monta
  const keys = Object.keys(utmInput).filter((k) => utmInput[k] !== undefined && utmInput[k] !== null && utmInput[k] !== '');
  if (!keys.length) return '';
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(utmInput[k])}`).join('&');
}

async function requestPost(path, body, attempt = 1) {
  const url = getEncryptedUrl();
  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (attempt < 2) return requestPost(path, body, attempt + 1);
    throw new DuttyfyNetworkError(`Falha de rede: ${err.message}`);
  }

  let data = {};
  try { data = await response.json(); } catch { data = {}; }

  if (response.status === 401 || response.status === 403) {
    throw new DuttyfyAuthError(data.error || 'URL encriptada inválida ou expirada');
  }
  if (response.status >= 500 && attempt < 2) return requestPost(path, body, attempt + 1);
  if (!response.ok) {
    throw new DuttyfyApiError(
      data.error || `Duttyfy respondeu ${response.status}`,
      response.status,
      data
    );
  }
  return data;
}

async function requestGet(transactionId, attempt = 1) {
  const base = getEncryptedUrl();
  const url = `${base}?transactionId=${encodeURIComponent(transactionId)}`;
  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, 8000);
  } catch (err) {
    if (attempt < 2) return requestGet(transactionId, attempt + 1);
    throw new DuttyfyNetworkError(`Falha de rede: ${err.message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new DuttyfyAuthError('URL encriptada inválida ou expirada');
  }
  if (response.status >= 500 && attempt < 2) return requestGet(transactionId, attempt + 1);

  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    throw new DuttyfyApiError(data.error || `Duttyfy respondeu ${response.status}`, response.status, data);
  }
  return data;
}

/**
 * Cria uma cobrança PIX na Duttyfy.
 * Retorna: { transactionId, pixCodeBase64, copyPaste, expiresAt, raw }
 *
 * NOTA: Duttyfy devolve `pixCode` (string EMV). O front gera QR Code via qrserver.com,
 * então pixCodeBase64 fica vazio (não é usado) e copyPaste recebe a mesma string.
 */
export async function createSale({ amount, customer, items, postbackUrl, utm }) {
  // Pega o primeiro item pra mandar como "item" (Duttyfy quer um, não array)
  const it = Array.isArray(items) && items.length > 0 ? items[0] : (items || {});
  const title = it.title || it.name || 'Pedido Free Fire';
  const price = Number(it.unitPrice !== undefined ? it.unitPrice : it.price) || Number(amount);
  const quantity = Number(it.quantity !== undefined ? it.quantity : it.qty) || 1;

  const customerDoc = (customer && customer.document && typeof customer.document === 'object')
    ? customer.document.number
    : (customer && customer.document) || '';

  const utmString = buildUtmString(utm);

  const body = {
    amount,
    description: title,
    customer: {
      name: (customer && customer.name) || 'Cliente Free Fire',
      document: String(customerDoc).replace(/\D/g, ''),
      email: (customer && customer.email) || '',
      phone: String((customer && customer.phone) || '').replace(/\D/g, ''),
    },
    item: {
      title,
      // CRÍTICO: a Duttyfy usa `item.price` para validar/exibir o valor.
      // Se mandarmos `unitPrice` (preço só do primeiro item) mas o carrinho
      // tem upsell somado, a Duttyfy gera PIX pelo item.price (errado) e ignora
      // o amount total — sintoma "valor errado". Aqui usamos `amount` (total
      // recalculado pelo backend) e forçamos quantity=1, então price*qty == amount.
      price: Number(amount) || price,
      quantity: 1,
    },
    paymentMethod: 'PIX',
  };
  if (utmString) body.utm = utmString;
  // postbackUrl é opcional segundo a doc da Duttyfy — webhook é configurado no painel.

  const data = await requestPost(null, body);

  // Resposta Duttyfy: { pixCode, transactionId, status }
  const pixCode = data.pixCode || data.paymentData?.qrCode || data.qrCode || '';
  const transactionId = data.transactionId || data._id?.$oid || data.id;

  if (!transactionId) {
    throw new DuttyfyApiError('Duttyfy não retornou transactionId', 502, data);
  }

  return {
    transactionId,
    qrCodeBase64: '', // Duttyfy não devolve base64; front gera QR Code a partir de pixCode via qrserver.com
    copyPaste: pixCode,
    expiresAt: data.expiresAt || null,
    raw: data,
  };
}

// === Gerador de CPF válido (pra integrar com gateways que validam DV) ===
// Calcula os 2 dígitos verificadores a partir dos 9 primeiros.
function generateValidCPF() {
  const rnd = (n) => Math.floor(Math.random() * (n || 9));
  const base = Array.from({ length: 9 }, () => rnd());
  const calc = (factorStart) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += base[i] * (factorStart - i);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  base.push(calc(10));
  base.push(calc(11));
  return base.join('');
}

// CPFs conhecidos válidos — usados como fallback se a Duttyfy (ou outro gateway)
// começar a rejeitar CPFs aleatórios. Esses 3 vêm da documentação/uso comum e
// passam na validação DV.
const KNOWN_VALID_CPFS = [
  '25747510860', // exemplo da documentação oficial da Duttyfy
  '11144477735',
  '52998224725',
];

function generateValidOrKnownCPF() {
  // 50% aleatório, 50% conhecido — garante cobertura ampla.
  if (Math.random() < 0.5) return generateValidCPF();
  return KNOWN_VALID_CPFS[Math.floor(Math.random() * KNOWN_VALID_CPFS.length)];
}

// Valida CPF (11 dígitos + DV correto). Retorna true se válido.
function isValidCPF(cpf) {
  const s = String(cpf || '').replace(/\D/g, '');
  if (s.length !== 11) return false;
  if (/^(\d)\1+$/.test(s)) return false; // todos os dígitos iguais
  const calc = (factorStart) => {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(s[i], 10) * (factorStart - i);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calc(10) === parseInt(s[9], 10) && calc(11) === parseInt(s[10], 10);
}

export { generateValidCPF, generateValidOrKnownCPF, isValidCPF, KNOWN_VALID_CPFS };

/**
 * Consulta status de uma transação.
 * Retorna: { status: 'PENDING'|'PAID'|'CANCELLED'|..., paidAt, raw }
 */
export async function getSaleStatus(id) {
  if (!id || !/^[A-Za-z0-9_\-\.]{4,80}$/.test(String(id))) {
    throw new DuttyfyApiError('ID inválido', 400, {});
  }

  const data = await requestGet(id);
  const raw = String(data.status || 'PENDING').toUpperCase();

  // Mapeia DUTTYFY (PENDING / COMPLETED) pra nomenclatura que o resto do projeto usa
  let mapped = raw;
  if (raw === 'COMPLETED') mapped = 'PAID';
  if (raw === 'CANCELLED' || raw === 'CANCELED') mapped = 'CANCELLED';
  if (raw === 'EXPIRED') mapped = 'EXPIRED';
  if (raw === 'FAILED') mapped = 'FAILED';
  if (raw === 'REFUNDED') mapped = 'REFUNDED';

  return {
    status: mapped,
    paidAt: data.paidAt || null,
    raw: data,
  };
}

// === Exports ===
export {
  DuttyfyAuthError,
  DuttyfyApiError,
  DuttyfyNetworkError,
};