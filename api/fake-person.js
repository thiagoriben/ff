// Server-side fetch do 4devs pra gerar dados fake de pessoa brasileira.
// Retorna: { name, phone, document, email }

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return res;
}

function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function extractFirstName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return parts[0] || '';
}

function fakeEmailFromName(name) {
  const cleaned = String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, '.')
    .slice(0, 40);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${cleaned}.${suffix}@example.com`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'method_not_allowed' });
  }

  const url = 'https://www.4devs.com.br/api/v1/gerador_de_pessoas';
  let raw = '';
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 10000);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      body: JSON.stringify({ acao: 'gerar_pessoa', sexo: 'H', idade: 25, pontuacao: 'S' }),
      signal: ctrl.signal,
    });
    clearTimeout(id);
    raw = await response.text();
  } catch (err) {
    return jsonResponse(res, 502, {
      error: '4devs_offline',
      detail: err.message,
      fallback: true,
    });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse(res, 502, { error: '4devs_resposta_invalida', detail: raw.slice(0, 200), fallback: true });
  }

  const name = data.nome || data.name || data.fullName || data.full_name;
  const phoneRaw = data.telefone || data.phone || data.celular || data.celular_whatsapp;
  const cpfRaw = data.cpf || data.document || data.CPF;

  if (!name) {
    return jsonResponse(res, 502, { error: '4devs_sem_nome', data, fallback: true });
  }

  const phone = onlyDigits(phoneRaw);
  const document = onlyDigits(cpfRaw);
  const email = fakeEmailFromName(extractFirstName(name));

  return jsonResponse(res, 200, { name, phone, document, email });
}