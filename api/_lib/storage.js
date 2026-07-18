// Storage em memória (process-local).
// Vendas se perdem entre deploys/cold starts — limitação aceita do Hobby.

const sales = new Map();

export async function setSale(id, data) {
  sales.set(id, { ...sales.get(id), ...data, updatedAt: Date.now() });
  return sales.get(id);
}

export async function getSale(id) {
  return sales.get(id) || null;
}

export async function updateStatus(id, status, extra = {}) {
  const current = sales.get(id);
  if (!current) {
    sales.set(id, { status, ...extra, createdAt: Date.now(), updatedAt: Date.now() });
    return sales.get(id);
  }
  const updated = { ...current, status, ...extra, updatedAt: Date.now() };
  sales.set(id, updated);
  return updated;
}

export async function listSales() {
  return Array.from(sales.entries()).map(([id, data]) => ({ id, ...data }));
}
