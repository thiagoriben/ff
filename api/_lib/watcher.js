// Watcher: faz polling ativo na Duttyfy pra detectar pagamentos.
// Resolve o caso onde a Duttyfy NÃO manda webhook de aprovação.
//
// Fluxo:
// 1. create.js chama startWatcher(txId, saleData) depois de criar a venda
// 2. Watcher faz polling a cada 5s por até 10 minutos
// 3. Quando Duttyfy confirma PAID → dispara sale.approved pra LowTrack
// 4. Usa waitUntil pra continuar rodando após o res.end()

import { waitUntil } from '@vercel/functions';
import { sendLowtrackEvent } from './lowtrack.js';
import { getSaleStatus, DuttyfyApiError, DuttyfyNetworkError } from './duttyfy.js';
import { getSale, updateStatus } from './storage.js';

const POLL_INTERVAL_MS = 5000;     // 5 segundos entre tentativas
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutos no máximo (cobertura total do PIX)

// Set pra evitar watchers duplicados na mesma instância
const activeWatchers = new Set();

export function startWatcher(transactionId, initialSaleData) {
  if (!transactionId || !initialSaleData) return;

  if (activeWatchers.has(transactionId)) return;
  activeWatchers.add(transactionId);

  console.log(`[watcher] iniciado para ${transactionId}`);

  const runPolling = async () => {
    const startedAt = Date.now();
    
    while (activeWatchers.has(transactionId)) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      
      if (!activeWatchers.has(transactionId)) break;

      try {
        const remote = await getSaleStatus(transactionId);
        const status = String(remote?.status || '').toUpperCase();

        if (status === 'PAID') {
          console.log(`[watcher] ${transactionId} confirmou PAID via Duttyfy — disparando approved`);
          // Pega dados mais recentes do storage pra não usar snapshot velho
          const freshSale = (await getSale(transactionId)) || initialSaleData;
          
          await sendLowtrackEvent(freshSale, 'approved', transactionId, { source: 'watcher' });
          
          // Marca no storage pra não re-disparar via status/[id].js
          try {
            await updateStatus(transactionId, 'PAID', {
              lowtrackApproved: true,
              lowtrackApprovedAt: new Date().toISOString(),
              paidAt: remote.paidAt || new Date().toISOString()
            });
          } catch (e) {
            console.warn(`[watcher] falha ao atualizar storage para ${transactionId}: ${e.message}`);
          }
          
          activeWatchers.delete(transactionId);
          break;
        }

        if (['CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(status)) {
          console.log(`[watcher] ${transactionId} finalizado com status ${status} — parando watcher`);
          try {
            await updateStatus(transactionId, status, { remoteCheckedAt: Date.now() });
          } catch (e) {}
          activeWatchers.delete(transactionId);
          break;
        }

        if (Date.now() - startedAt > MAX_DURATION_MS) {
          console.log(`[watcher] ${transactionId} timeout (10min) — parando watcher`);
          activeWatchers.delete(transactionId);
          break;
        }
      } catch (err) {
        if (err instanceof DuttyfyNetworkError || err instanceof DuttyfyApiError) {
          console.warn(`[watcher] ${transactionId} erro de rede: ${err.message} — continua tentando`);
          if (Date.now() - startedAt > MAX_DURATION_MS) {
            activeWatchers.delete(transactionId);
            break;
          }
          // Backoff opcional: espera mais um pouco em caso de erro
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        } else {
          console.error(`[watcher] ${transactionId} erro inesperado:`, err.message);
          activeWatchers.delete(transactionId);
          break;
        }
      }
    }
  };

  waitUntil(runPolling());
}