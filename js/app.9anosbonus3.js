(() => {
const steps = [
        { kind: "intro", kicker: "Convite especial",
          title: "🎁 VOCÊ FOI SELECIONADO PRO DESAFIO DE 9 ANOS DO FREE FIRE",
          body: ["<strong>Parabéns.</strong> Você tá entre os jogadores que vão testar o novo cupom de aniversário.", "O <strong>Free Fire</strong> tá celebrando 9 anos com a OB54 e liberou um presente exclusivo pra você — um <strong>CUPOM DE 90% OFF</strong> pra usar em diamantes hoje.", "Responda 5 perguntas rápidas pra desbloquear. Leva menos de 30 segundos."],
          button: "🚀 DESBLOQUEAR MEU CUPOM", discount: 0 },
        { kind: "question", kicker: "Pergunta 1", title: "Qual é seu maior objetivo no Free Fire esse ano?",
          discount: 0, bonus: 80,
          options: [
            { emoji: "🏆", label: "Chegar no Mestre / Grão-Mestre" },
            { emoji: "🎯", label: "Conseguir todas as skins lendárias" },
            { emoji: "💎", label: "Comprar diamantes com desconto real" }
          ]},
        { kind: "info", kicker: "Você sabia?", title: "9 em cada 10 jogadores perdem eventos lendários",
          body: ["🔥 <strong>9 em cada 10</strong> jogadores já perderam uma skin lendária por falta de diamantes na hora certa.", "💎 Mas <strong>hoje</strong> você pode virar esse jogo com o cupom de 90% que a gente liberou.", "⏱️ <strong>Só 47 cupons</strong> sobraram nesse lote. Quem responde primeiro, leva."],
          button: "👉 Continuar pro desafio", discount: 15 },
        { kind: "question", kicker: "Pergunta 2", title: "Em qual mapa você é imbatível?",
          discount: 15, requiredCorrect: true, bonus: 100,
          options: [
            { label: "Bermuda", image: "assets/json-images/bermuda.avif", correct: true },
            { label: "Purgatório", image: "assets/json-images/purgatorio.avif" },
            { label: "Kalahari", image: "assets/json-images/kalahari.avif" },
            { label: "Alpine", image: "assets/json-images/alpine.avif" }
          ]},
        { kind: "question", kicker: "Pergunta 3", title: "Qual modo foi lançado primeiro no Free Fire?",
          discount: 30, requiredCorrect: true, bonus: 110,
          options: [
            { label: "Battle Royale", image: "assets/json-images/battle-royale-novo-mobile.jpg", correct: true },
            { label: "Gladiadores FF", image: "assets/json-images/gladiadores-ff-mobile.jpg" },
            { label: "Contra Squad", image: "assets/json-images/contra-squad-novo-mobile.jpg" },
            { label: "Ataque a Comboio", image: "assets/json-images/ataque-a-comboio-mobile.jpg" }
          ]},
        { kind: "reserve", kicker: "🔥 Reserva ativa", title: "SEU CUPOM TÁ RESERVADO",
          body: ["Você entrou na fila prioritária de cupons. Restam só <strong>14 cupons</strong> nesse lote.", "Sua reserva fica ativa por <strong>7 minutos</strong>. Termina o desafio agora pra garantir."],
          button: "⏱️ TERMINAR AGORA", discount: 45 },
        { kind: "question", kicker: "Pergunta 4", title: "Qual dessas empresas é a dona oficial do Free Fire?",
          discount: 60, requiredCorrect: true, hideLabels: true, bonus: 100,
          options: [
            { label: "Garena", image: "assets/garena-logo-whatsapp.png", correct: true },
            { label: "Tencent", image: "assets/tencent-logo-novo-transparente.png" },
            { label: "Supercell", image: "assets/supercell-logo-novo-transparente.png" },
            { label: "Ubisoft", image: "assets/ubisoft-logo-novo-transparente.png" }
          ]},
        { kind: "question", kicker: "Pergunta 5", title: "Qual personagem aumenta a velocidade de cura dos aliados?",
          discount: 75, requiredCorrect: true, bonus: 120,
          options: [
            { label: "Moco", image: "assets/json-images/moco.avif", fallbackImage: "assets/json-images/character-fallback.png" },
            { label: "Kapella", image: "assets/json-images/kapella.avif", fallbackImage: "assets/json-images/character-fallback.png", correct: true },
            { label: "Hayato", image: "assets/json-images/hayato.avif", fallbackImage: "assets/json-images/character-fallback.png" },
            { label: "Laura", image: "assets/json-images/laura.avif", fallbackImage: "assets/json-images/character-fallback.png" }
          ]},
        { kind: "question", kicker: "Pergunta final", title: "Se o cupom de 90% OFF tivesse validação agora, você usaria?",
          discount: 90, bonus: 60,
          options: [
            { emoji: "🔥", label: "Sim, com certeza! Vou pegar agora" },
            { emoji: "🤔", label: "Vou pensar..." },
            { emoji: "❌", label: "Não me interessa" }
          ]},
        { kind: "social", kicker: "Validando...", title: "Conferindo suas respostas",
          body: ["Validando suas respostas no servidor...", "Reservando seu cupom na fila prioritária..."],
          button: "⏱️ Continuar", discount: 90 },
        { kind: "redeem", kicker: "🎉 SUCESSO", title: "CUPOM DESBLOQUEADO — RESGATE AGORA",
          body: ["<strong>Você desbloqueou 90% de desconto</strong> na compra de diamantes Free Fire. Válido por 10 minutos — não perca."],
          button: "💰 RESGATAR MEU CUPOM", discount: 90 }
      ];

      let stepIndex = 0;
      let attempts = 0;
      let reserveProgressTimer = null;
      let reserveCountdownTimer = null;
      let socialProgressTimer = null;
      let socialRedirectTimer = null;
      let introCountdownTimer = null;
      const nextStepSound = new Audio("assets/som-proxima-etapa.mp3");
      nextStepSound.preload = "none";
      nextStepSound.volume = 0.162;
      const selectSound = new Audio("assets/selecionar.mp3");
      selectSound.preload = "none";
      selectSound.volume = 0.18;
      const backgroundMusic = new Audio("assets/musica-de-fundo.mp3");
      backgroundMusic.preload = "none";
      backgroundMusic.loop = true;
      let backgroundMusicStarted = false;
      let backgroundAudioContext = null;
      let backgroundGainNode = null;
      const progressMarks = [0, 12, 20, 28, 36, 45, 54, 63, 72, 82, 92, 100];
      const trackerStorageKey = "ffQuizLeadTracker";
      const trackerSessionKey = "ffQuizLeadSession";
      const rechargeUrl = "/ff/index.html";
      const trackingParamKeys = new Set(["fbclid", "gclid", "ttclid", "msclkid", "src", "sck", "xcod"]);
      const el = (id) => document.getElementById(id);

      // ===== Diamantes de brinde (gamificação — só persuasão, custo zero) =====
      const BONUS_STORAGE_KEY = "ffQuizBonus";
      const DISCOUNT_STORAGE_KEY = "ffQuizDiscount";
      const awardedBonus = new Set();
      let bonusModalOpen = false;
      let advancing = false; // trava avanço enquanto o modal de brinde está aberto / durante transição
      const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

      function bonusTotal() {
        let sum = 0;
        awardedBonus.forEach((i) => { sum += steps[i]?.bonus || 0; });
        return sum;
      }

      function persistBonus() {
        try {
          localStorage.setItem(BONUS_STORAGE_KEY, String(bonusTotal()));
          // Guarda o MAIOR desconto já alcançado (não regride se pular etapas).
          const prev = parseInt(localStorage.getItem(DISCOUNT_STORAGE_KEY) || "0", 10) || 0;
          const cur = steps[stepIndex]?.discount || 0;
          localStorage.setItem(DISCOUNT_STORAGE_KEY, String(Math.max(prev, cur)));
        } catch {}
      }

      function updateBonusHud() {
        const node = el("bonusValue");
        if (node) node.textContent = fmtNum(bonusTotal());
      }

      function closeBonusModal() {
        const m = el("bonusModal");
        if (m) m.classList.remove("open");
        bonusModalOpen = false;
      }

      // Notificação de brinde no CENTRO da tela. TRAVA o avanço até o clique em "Próxima".
      // onNext é chamado UMA vez só, quando o usuário clica no botão.
      function showBonusModal(delta, total, onNext) {
        const modal = el("bonusModal");
        if (!modal) { if (typeof onNext === "function") onNext(); return; } // fallback: não trava se faltar o modal
        const deltaEl = el("bonusModalDelta");
        const totalEl = el("bonusModalTotal");
        if (deltaEl) deltaEl.textContent = `+${fmtNum(delta)}`;
        if (totalEl) totalEl.textContent = fmtNum(total);
        bonusModalOpen = true;
        modal.classList.add("open");
        const btn = el("bonusNextBtn");
        if (btn) {
          // clona pra descartar listeners antigos → garante 1 avanço só, sem duplicar.
          const fresh = btn.cloneNode(true);
          btn.parentNode.replaceChild(fresh, btn);
          fresh.addEventListener("click", () => {
            if (!bonusModalOpen) return; // guarda contra clique duplo
            closeBonusModal();
            playSelectSound();
            if (typeof onNext === "function") onNext();
          }, { once: true });
        }
      }

      // Premia o brinde da etapa (uma vez) e ABRE o modal, travando o avanço.
      // Retorna true se abriu o modal (o caller NÃO deve auto-avançar).
      // Se a etapa não tem brinde OU já foi premiada, retorna false (avança normal).
      function awardBonusAndGate(index) {
        const step = steps[index];
        if (!step || !(step.bonus > 0) || awardedBonus.has(index)) return false;
        awardedBonus.add(index);
        const total = bonusTotal();
        persistBonus();
        updateBonusHud();
        showBonusModal(step.bonus, total, () => goNext());
        return true;
      }

      function progress() {
        return progressMarks[stepIndex] ?? Math.round((stepIndex / Math.max(1, steps.length - 1)) * 100);
      }

      function trackerStepLabel(step, index) {
        if (step.kind === "intro") return "Início";
        if (step.kind === "social") return "Prova social";
        if (step.kind === "redeem") return "Parabéns";
        if (step.kind === "reserve") return "Cupom reservado";
        return step.kicker || `Etapa ${index + 1}`;
      }

      function trackerSessionId() {
        let sessionId = sessionStorage.getItem(trackerSessionKey);
        if (sessionId) return sessionId;
        sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(trackerSessionKey, sessionId);
        return sessionId;
      }

      function readTracker() {
        const now = Date.now();
        try {
          const parsed = JSON.parse(localStorage.getItem(trackerStorageKey) || "");
          if (parsed && parsed.sessions) return parsed;
        } catch {}
        return { version: 1, createdAt: now, updatedAt: now, steps: [], sessions: {} };
      }

      function writeTracker(data) {
        localStorage.setItem(trackerStorageKey, JSON.stringify(data));
      }

      function updateTracker(stepNumber, updater) {
        const now = Date.now();
        const sessionId = trackerSessionId();
        const data = readTracker();
        data.version = 1;
        data.createdAt = data.createdAt || now;
        data.updatedAt = now;
        data.steps = steps.map((item, index) => ({ index, label: trackerStepLabel(item, index), kind: item.kind, discount: item.discount }));
        const session = data.sessions[sessionId] || { id: sessionId, startedAt: now, updatedAt: now, currentStep: stepNumber, maxStep: stepNumber, reached: {}, advanced: {} };
        updater(session, now);
        session.updatedAt = now;
        data.sessions[sessionId] = session;
        writeTracker(data);
      }

      function trackStepView(stepNumber) {
        updateTracker(stepNumber, (session, now) => {
          session.currentStep = stepNumber;
          session.maxStep = Math.max(session.maxStep || 0, stepNumber);
          session.reached[String(stepNumber)] = session.reached[String(stepNumber)] || now;
        });
      }

      function trackStepAdvance(stepNumber) {
        updateTracker(stepNumber, (session, now) => {
          session.advanced[String(stepNumber)] = now;
        });
      }

      function trackQuizCompletion(stepNumber) {
        updateTracker(stepNumber, (session, now) => {
          session.completedAt = now;
          session.advanced[String(stepNumber)] = now;
        });
      }

      function buildRechargeUrl() {
        try {
          const destination = new URL(rechargeUrl);
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.forEach((value, key) => {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey.startsWith("utm_") || trackingParamKeys.has(normalizedKey)) {
              destination.searchParams.set(key, value);
            }
          });
          return destination.toString();
        } catch {
          return rechargeUrl;
        }
      }

      function playNextStepSound() {
        try {
          if (nextStepSound.preload === "none") nextStepSound.preload = "auto";
          nextStepSound.currentTime = 0;
          nextStepSound.play().catch(() => {});
        } catch {}
      }

      function boostBackgroundMusic() {
        if (backgroundGainNode) return;
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) return;
        try {
          backgroundAudioContext = new AudioContextConstructor();
          const source = backgroundAudioContext.createMediaElementSource(backgroundMusic);
          backgroundGainNode = backgroundAudioContext.createGain();
          backgroundGainNode.gain.value = 1.1;
          source.connect(backgroundGainNode).connect(backgroundAudioContext.destination);
        } catch {
          backgroundGainNode = null;
        }
      }

      function startBackgroundMusic() {
        if (backgroundMusicStarted) return;
        try {
          if (backgroundMusic.preload === "none") backgroundMusic.preload = "metadata";
          boostBackgroundMusic();
          backgroundMusicStarted = true;
          if (backgroundAudioContext?.state === "suspended") {
            backgroundAudioContext.resume().catch(() => {});
          }
          backgroundMusic.play().catch(() => {
            backgroundMusicStarted = false;
          });
        } catch {}
      }

      function playSelectSound() {
        startBackgroundMusic();
        try {
          if (selectSound.preload === "none") selectSound.preload = "auto";
          selectSound.currentTime = 0;
          selectSound.play().catch(() => {});
        } catch {}
      }

      function handleNextClick() {
        if (advancing) return; // ignora clique repetido durante transição
        advancing = true;
        playSelectSound();
        // Se a etapa dá brinde, abre o modal e SÓ avança quando clicar "Próxima".
        if (!awardBonusAndGate(stepIndex)) goNext();
      }

      function goNext() {
        const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
        if (nextIndex !== stepIndex) {
          trackStepAdvance(stepIndex);
          playNextStepSound();
        }
        stepIndex = nextIndex;
        render();
      }

      backgroundMusic.addEventListener("ended", () => {
        backgroundMusic.currentTime = 0;
        backgroundMusic.play().catch(() => {});
      });
      document.addEventListener("pointerdown", startBackgroundMusic, { once: true });
      document.addEventListener("keydown", startBackgroundMusic, { once: true });

      function clearReserveMotion() {
        window.clearInterval(reserveProgressTimer);
        window.clearInterval(reserveCountdownTimer);
        window.clearInterval(socialProgressTimer);
        window.clearTimeout(socialRedirectTimer);
        window.clearInterval(introCountdownTimer);
        reserveProgressTimer = null;
        reserveCountdownTimer = null;
        socialProgressTimer = null;
        socialRedirectTimer = null;
        introCountdownTimer = null;
      }

      function formatReserveTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        return `${minutes}:${seconds}`;
      }

      function startIntroCountdown() {
        const clock = el("introClock");
        let secondsLeft = 600;

        const updateClock = () => {
          clock.textContent = formatReserveTime(secondsLeft);
        };

        updateClock();
        introCountdownTimer = window.setInterval(() => {
          secondsLeft = Math.max(0, secondsLeft - 1);
          updateClock();
          if (secondsLeft <= 0) {
            window.clearInterval(introCountdownTimer);
            introCountdownTimer = null;
          }
        }, 1000);
      }

      function startReserveMotion() {
        const ring = el("reserveRing");
        const percent = el("reservePercent");
        const clock = el("reserveClock");
        let loaded = 0;
        let secondsLeft = 420;

        const updateProgress = () => {
          const pct = `${loaded}%`;
          ring.style.setProperty("--pct", pct);
          percent.textContent = pct;
        };

        const updateClock = () => {
          clock.textContent = formatReserveTime(secondsLeft);
        };

        updateProgress();
        updateClock();

        reserveProgressTimer = window.setInterval(() => {
          loaded = Math.min(100, loaded + 2);
          updateProgress();
          if (loaded >= 100) {
            window.clearInterval(reserveProgressTimer);
            reserveProgressTimer = null;
          }
        }, 60);

        reserveCountdownTimer = window.setInterval(() => {
          secondsLeft = Math.max(0, secondsLeft - 1);
          updateClock();
          if (secondsLeft <= 0) {
            window.clearInterval(reserveCountdownTimer);
            reserveCountdownTimer = null;
          }
        }, 1000);
      }

      function startSocialLoading() {
        const fill = el("socialLoadFill");
        const percent = el("socialLoadPercent");
        let loaded = 0;

        const updateSocialProgress = () => {
          fill.style.width = `${loaded}%`;
          percent.textContent = `${loaded}%`;
        };

        updateSocialProgress();
        socialProgressTimer = window.setInterval(() => {
          loaded = Math.min(100, loaded + 1);
          updateSocialProgress();
          if (loaded >= 100) {
            window.clearInterval(socialProgressTimer);
            socialProgressTimer = null;
          }
        }, 100);

        socialRedirectTimer = window.setTimeout(goNext, 10000);
      }

      function render() {
        advancing = false; // nova etapa renderizada — libera avanço
        clearReserveMotion();
        const step = steps[stepIndex];
        trackStepView(stepIndex);
        const pct = progress();
        el("hudProgress").textContent = `${pct}% completo`;
        el("progressBar").style.width = `${pct}%`;
        el("introCountdownShell").style.display = step.kind === "intro" ? "grid" : "none";el("discountBanner").style.display = stepIndex > 0 ? "block" : "none";
        // Chip de brinde só aparece depois da 1ª tela (não na intro).
        const bonusHudEl = el("bonusHud");
        if (bonusHudEl) bonusHudEl.style.display = stepIndex > 0 ? "flex" : "none";
        el("discountValue").textContent = `${String(step.discount).padStart(2, "0")}%`;
        el("card").className = `mission-card is-${step.kind} ${step.kind === "intro" ? "is-intro" : ""} ${stepIndex === 1 ? "is-step-one" : ""} ${step.kicker === "Pergunta final" ? "is-final-question" : ""}`;
        el("kicker").textContent = step.kicker;
        el("title").textContent = step.title;
        el("title").style.display = (step.kind === "intro" || step.kind === "redeem") ? "none" : "block";
        el("subtitle").textContent = step.subtitle || "";
        el("subtitle").style.display = step.subtitle ? "block" : "none";
        el("bodyCopy").innerHTML = (step.kind === "intro" || step.kind === "reserve" || step.kind === "social" || step.kind === "redeem") ? "" : (step.body || []).map((line) => `<p>${line}</p>`).join("");
        const dynamic = el("dynamicContent");
        dynamic.innerHTML = "";

        if (step.kind === "intro") {
          dynamic.innerHTML = `<div class="intro-banner"><img src="assets/json-images/banner-inicial-640.webp" srcset="assets/json-images/banner-inicial-640.webp 640w, assets/json-images/banner-inicial-960.webp 960w, assets/json-images/banner-inicial-1200.webp 1200w" sizes="100vw" alt="Banner 9 anos Free Fire" width="1052" height="592" decoding="async" fetchpriority="high"></div><h1 class="intro-title">${step.title}</h1><div class="body-copy intro-copy">${step.body.map((line) => `<p>${line}</p>`).join("")}</div><button class="primary-action" type="button">Iniciar desafio</button>`;
          startIntroCountdown();
          dynamic.querySelector("button").addEventListener("click", handleNextClick);
        } else if (step.kind === "reserve") {
          dynamic.innerHTML = `<div class="reserve-progress-shell"><div class="reserve-box"><span class="reserve-badge">OS CUPONS ESTÃO ACABANDO</span><p class="reserve-copy">Você entrou na fila prioritária de cupons. A cada resposta, seu desconto acumulado fica mais forte.</p><div class="reserve-progress-grid"><div class="reserve-meter"><span class="reserve-meter-title">Carregando reserva</span><div class="reserve-ring" id="reserveRing"><strong id="reservePercent">0%</strong></div></div><div class="reserve-side-card"><div class="reserve-count-pill">23 cupons disponíveis</div><img src="assets/json-images/diamantes-cupom.jpg" alt="" loading="lazy" decoding="async"></div></div><div class="reserve-timer">Seu cupom fica reservado por <strong id="reserveClock">7:00</strong><br>Continue antes que a reserva expire.</div></div></div><button class="primary-action" type="button">${step.button}</button>`;
          startReserveMotion();
          dynamic.querySelector("button").addEventListener("click", handleNextClick);
        } else if (step.kind === "loading") {
          dynamic.innerHTML = `<div class="loading-panel" aria-hidden="true"><span></span><span></span><span></span></div><button class="primary-action" type="button">${step.button}</button>`;
          dynamic.querySelector("button").addEventListener("click", handleNextClick);
        } else if (step.kind === "social") {
          dynamic.innerHTML = `<div class="social-loading-panel"><div class="social-load-bar"><span id="socialLoadFill"></span><strong id="socialLoadPercent">0%</strong></div><p>Conferindo respostas...</p><p>Verificando e enviando ao servidor. Aguarde ser redirecionado.</p></div><div class="proof-board"><div class="testimony-card authority"><div class="testimony-head"><img src="assets/json-images/reclame-aqui.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>RECLAME AQUI</span><em>Melhores empresas no Reclame AQUI</em></div></div><p>A empresa atingiu a reputação máxima no Reclame AQUI. Sua nota média nos últimos 6 meses é <strong>9.0/10. Reputação RA1000</strong></p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/ana-p.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Ana P.</span><em>São Paulo, SP</em></div></div><p>Fiz o quiz e consegui <strong>5.200 diamantes com 90% de desconto!</strong> Super fácil e rápido!</p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/lucas-m.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Lucas M.</span><em>Rio de Janeiro, RJ</em></div></div><p>Achei que era fake, mas realmente funciona! Peguei meus <strong>5.200 + 1.120 diamantes bônus</strong> em minutos!</p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/gustavo-r.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Gustavo R.</span><em>Belo Horizonte, MG</em></div></div><p>Não acreditei no começo, mas fiz o quiz e realmente consegui os <strong>5.200 diamantes com desconto.</strong></p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/rafael-d.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Rafael D.</span><em>Curitiba, PR</em></div></div><p>Funcionou direitinho! Agora sempre que precisar de diamantes, já sei onde ir. <strong>Recomendo demais!</strong></p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/mariana-f.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Mariana F.</span><em>Fortaleza, CE</em></div></div><p>Já gastei muito dinheiro em diamantes antes, mas esse quiz foi um achado! Peguei <strong>5.200 + 1.120 de bônus</strong> e paguei quase nada!</p><small>★★★★★</small></div><div class="testimony-card"><div class="testimony-head"><img src="assets/json-images/daniel-g.avif" alt="" class="testimony-avatar" loading="lazy" decoding="async"><div><span>Daniel G.</span><em>Salvador, BA</em></div></div><p>Processo super rápido! Fiz o quiz e em minutos já tinha meu código para resgatar os diamantes. <strong>Vale muito a pena!</strong></p><small>★★★★★</small></div></div>`;
          startSocialLoading();
        } else if (step.kind === "redeem") {
          const UNLOCK_SECONDS = 30;
          dynamic.innerHTML = `<div class="redeem-panel"><img src="assets/booyah-icon.png" alt="Booyah" class="redeem-booyah" loading="lazy" decoding="async"><h1 class="redeem-title">CUPOM 90% DESBLOQUEADO</h1><div class="redeem-prize"><div class="redeem-art-wrap"><video id="redeemVideo" class="redeem-video" src="ff/videos/vslff.mp4" playsinline preload="auto" controls></video></div></div><p class="redeem-status">Você concluiu o desafio de aniversário.</p><p class="redeem-copy">Assista ao vídeo abaixo para liberar seu <strong>cupom exclusivo</strong> e garantir os melhores itens do evento de aniversário de 9 anos Free Fire.</p><button class="primary-action redeem-locked" type="button" disabled><span class="redeem-btn-label">${step.button}</span></button><p class="redeem-note" id="redeemNote">Assista ao vídeo para liberar o resgate</p></div>`;

          const redeemBtn = dynamic.querySelector("button");
          const redeemNote = dynamic.querySelector("#redeemNote");
          const redeemVideo = dynamic.querySelector("#redeemVideo");
          const btnLabel = dynamic.querySelector(".redeem-btn-label");
          const originalLabel = step.button;
          let unlockTimer = null;
          let countdownInterval = null;
          let unlocked = false;

          function unlockRedeem() {
            if (unlocked) return;
            unlocked = true;
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            redeemBtn.disabled = false;
            redeemBtn.classList.remove("redeem-locked");
            if (btnLabel) btnLabel.textContent = originalLabel;
            if (redeemNote) redeemNote.textContent = "Toque no botão para ativar seu resgate";
          }

          function startUnlockCountdown() {
            // Só arma uma vez (no primeiro play) — pausar/retomar não reinicia.
            if (unlockTimer || unlocked) return;
            let remaining = UNLOCK_SECONDS;
            if (btnLabel) btnLabel.textContent = `Aguarde ${remaining}s...`;
            if (redeemNote) redeemNote.textContent = "Continue assistindo para liberar seu cupom";
            countdownInterval = setInterval(() => {
              remaining -= 1;
              if (remaining <= 0) {
                unlockRedeem();
                return;
              }
              if (btnLabel) btnLabel.textContent = `Aguarde ${remaining}s...`;
            }, 1000);
            unlockTimer = setTimeout(unlockRedeem, UNLOCK_SECONDS * 1000);
          }

          if (redeemVideo) {
            redeemVideo.addEventListener("play", startUnlockCountdown, { once: false });
          }

          redeemBtn.addEventListener("click", () => {
            if (redeemBtn.disabled) return;
            playSelectSound();
            trackQuizCompletion(stepIndex);
            // Garante brinde + desconto final gravados pra loja ler.
            try {
              localStorage.setItem(BONUS_STORAGE_KEY, String(bonusTotal()));
              localStorage.setItem(DISCOUNT_STORAGE_KEY, "90");
            } catch {}
            window.location.assign(buildRechargeUrl());
          });
        } else if (step.kind === "info") {
          dynamic.innerHTML = `<button class="primary-action compact-action" type="button">${step.button}</button>`;
          dynamic.querySelector("button").addEventListener("click", handleNextClick);
        } else if (step.kind === "question") {
          const hasLogos = step.options.some((option) => option.image);
          const hasCompactAnswers = !hasLogos && step.options.every((option) => !option.emoji && option.label.length <= 4);
          const hideOptionLabels = Boolean(step.hideLabels);
          const wrap = document.createElement("div");
          wrap.className = `options-grid ${hasLogos ? "logo-options" : ""} ${hasCompactAnswers ? "compact-options" : ""} ${hideOptionLabels ? "image-only-options" : ""}`;
          step.options.forEach((option) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option-button";
            button.setAttribute("aria-label", option.label);
            button.innerHTML = option.image
              ? `<img src="${option.image}" alt="" class="option-media" loading="lazy" decoding="async">${hideOptionLabels ? "" : `<span class="option-label">${option.label}</span>`}`
              : `<span class="option-text">${option.emoji ? `<b>${option.emoji}</b>` : ""}${option.label}</span>`;
            if (option.fallbackImage) {
              const media = button.querySelector(".option-media");
              media?.addEventListener("error", () => {
                media.src = option.fallbackImage;
              }, { once: true });
            }
            button.addEventListener("click", () => selectOption(option, button, step));
            wrap.appendChild(button);
          });
          dynamic.appendChild(wrap);
        }

        renderStepHud();
        updateBonusHud();
      }

      function selectOption(option, button, step) {
        if (advancing) return; // já respondeu — ignora cliques em outras opções durante a transição
        playSelectSound();
        button.classList.add("selected");
        if (!step.requiredCorrect || option.correct) {
          advancing = true;
          button.classList.add("is-correct");
          // Deixa o flash de "acertou" aparecer, depois abre o modal de brinde (que trava
          // o avanço até "Próxima"). Se a etapa não der brinde, avança normal.
          window.setTimeout(() => {
            if (!awardBonusAndGate(stepIndex)) goNext();
          }, step.requiredCorrect ? 520 : 420);
          return;
        }
        attempts += 1;
        button.classList.add("is-wrong");
        el("attemptText").textContent = `Tentativas usadas: ${attempts}`;
        window.setTimeout(() => el("errorModal").classList.add("open"), 220);
      }

      function renderStepHud() {
        const hud = el("stepsHud");
        hud.innerHTML = "";
        steps.forEach((_, index) => {
          const dot = document.createElement("button");
          dot.type = "button";
          dot.setAttribute("aria-label", `Ir para etapa ${index + 1}`);
          dot.className = index <= stepIndex ? "active" : "";
          dot.addEventListener("click", () => {
            playSelectSound();
            stepIndex = index;
            render();
          });
          hud.appendChild(dot);
        });
      }

      el("retryButton").addEventListener("click", () => {
        playSelectSound();
        el("errorModal").classList.remove("open");
        render();
      });

      // Defer the initial render to next idle frame so the static HUD (logo, fonts) paints first.
      // This keeps the logo from being pushed below LCP by JavaScript DOM churn.
      if ('requestIdleCallback' in window) requestIdleCallback(render, { timeout: 2000 });
      else requestAnimationFrame(render);
})();
