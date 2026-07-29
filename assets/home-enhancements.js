(() => {
  const CONFIG_URL = "./data/concurso.json";
  const CATALOG_URL = "./data/catalogo.json";
  const HISTORY_KEY = "sedes.questoes.history.v2";
  const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

  let exam;
  let catalog;
  let countdownTimer;
  let enhancementQueued = false;

  const escapeHTML = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const readHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  };

  const examDateObject = () => new Date(`${exam.data_prova}T12:00:00-03:00`);

  const getCountdown = () => {
    const difference = new Date(exam.alvo_contagem).getTime() - Date.now();
    if (difference <= 0) return {finished: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalDays: 0};
    const totalSeconds = Math.floor(difference / 1000);
    return {
      finished: false,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      totalDays: Math.ceil(difference / 86400000),
    };
  };

  const formatDate = (date) => new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE,
  });

  const countdownUnit = (value, label) => `<div class="countdown-unit"><strong data-countdown-${label}>${String(value).padStart(2, "0")}</strong><span>${label}</span></div>`;

  const renderExamCard = () => {
    const countdown = getCountdown();
    const questions = catalog?.summary?.questoes || 0;
    const dailyPace = countdown.totalDays ? Math.max(1, Math.ceil(questions / countdown.totalDays)) : 0;
    const locationDate = formatDate(exam.divulgacao_locais_horarios);
    const date = examDateObject();
    const day = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", timeZone: DISPLAY_TIME_ZONE}).format(date);
    const month = new Intl.DateTimeFormat("pt-BR", {month: "short", timeZone: DISPLAY_TIME_ZONE}).format(date).replace(".", "");
    const year = new Intl.DateTimeFormat("pt-BR", {year: "numeric", timeZone: DISPLAY_TIME_ZONE}).format(date);
    const weekday = new Intl.DateTimeFormat("pt-BR", {weekday: "long", timeZone: DISPLAY_TIME_ZONE}).format(date);
    const numericDate = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: DISPLAY_TIME_ZONE,
    }).format(date);

    return `<section id="exam-countdown" class="exam-focus card" aria-labelledby="exam-title">
      <div class="exam-main">
        <div class="exam-heading">
          <div class="exam-date-badge"><strong>${day}</strong><span>${escapeHTML(month)} ${year}</span></div>
          <div class="exam-copy">
            <p class="eyebrow">Próxima prova da SEDES/DF</p>
            <h2 id="exam-title">${escapeHTML(exam.cargo)}</h2>
            <p>${escapeHTML(exam.etapa)} · ${escapeHTML(exam.banca)} · código ${escapeHTML(exam.codigo_cargo)}</p>
            <div class="exam-meta-line"><span>${escapeHTML(weekday)}</span><span>${escapeHTML(numericDate)}</span><span>Brasília/DF</span></div>
          </div>
        </div>
        <div class="countdown-label"><strong>${countdown.finished ? "Data da prova alcançada" : "Tempo até o dia da prova"}</strong><span>Contagem pelo horário de Brasília</span></div>
        <div class="countdown-grid" aria-label="Contagem regressiva para a prova">
          ${countdownUnit(countdown.days, "dias")}
          ${countdownUnit(countdown.hours, "horas")}
          ${countdownUnit(countdown.minutes, "minutos")}
          ${countdownUnit(countdown.seconds, "segundos")}
        </div>
      </div>
      <aside class="exam-side-info" aria-label="Informações da prova">
        <div class="exam-fact"><span>Data da prova</span><strong>${formatDate(exam.data_prova)}</strong></div>
        <div class="exam-fact"><span>Locais e horários</span><strong>${locationDate}</strong></div>
        <div class="exam-fact"><span>Acervo publicado</span><strong>${questions} questões</strong></div>
        <div class="exam-fact"><span>Ritmo para completar o acervo</span><strong>${dailyPace ? `${dailyPace} questões/dia` : "Prova realizada"}</strong></div>
        <div class="exam-actions-row">
          <button class="btn primary" type="button" data-exam-train>Treinar 20 questões</button>
          <a class="btn" href="${escapeHTML(exam.url_oficial)}" target="_blank" rel="noopener noreferrer">Cronograma oficial ↗</a>
        </div>
        <p class="exam-note">${escapeHTML(exam.observacao)}</p>
      </aside>
    </section>`;
  };

  const renderPreparationInsight = () => {
    const history = readHistory();
    const last = history[0];
    const countdown = getCountdown();
    const message = last
      ? `Última tentativa: ${escapeHTML(last.materialName)} · ${Number(last.percent || 0).toLocaleString("pt-BR")}% de aproveitamento.`
      : "Seu histórico começa após a primeira tentativa concluída neste aparelho.";
    return `<section id="preparation-insight" class="preparation-insight card">
      <div><i>↗</i><span><strong>${countdown.finished ? "Continue revisando o acervo" : `${countdown.totalDays} dias corridos até a prova`}</strong><small>${message}</small></span></div>
      <button class="btn" type="button" data-exam-catalog>Escolher um simulado</button>
    </section>`;
  };

  const updateCountdown = () => {
    if (!exam) return;
    const countdown = getCountdown();
    const values = {dias: countdown.days, horas: countdown.hours, minutos: countdown.minutes, segundos: countdown.seconds};
    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-countdown-${key}]`).forEach(element => {
        element.textContent = String(value).padStart(2, "0");
      });
    });
    document.querySelectorAll("[data-exam-days]").forEach(element => {
      element.textContent = countdown.finished ? "prova realizada" : `${countdown.days}d ${String(countdown.hours).padStart(2, "0")}h`;
    });
    document.title = countdown.finished
      ? "SEDES/DF Questões"
      : `${countdown.days}d ${countdown.hours}h para a prova | SEDES/DF Questões`;
  };

  const bindEnhancementEvents = () => {
    const trainingButton = document.querySelector("[data-exam-train]");
    if (trainingButton) trainingButton.onclick = () => document.querySelector("[data-random]")?.click();

    const catalogButton = document.querySelector("[data-exam-catalog]");
    if (catalogButton) catalogButton.onclick = () => {
      document.querySelector("#catalogo")?.scrollIntoView({behavior: "smooth", block: "start"});
    };
  };

  const enhanceHome = () => {
    enhancementQueued = false;
    if (!exam || !catalog) return;
    const hero = document.querySelector("#app > .hero");
    if (!hero) return;

    if (!document.querySelector("#exam-countdown")) hero.insertAdjacentHTML("afterend", renderExamCard());
    const metrics = document.querySelector("#app > .metrics");
    if (metrics && !document.querySelector("#preparation-insight")) metrics.insertAdjacentHTML("afterend", renderPreparationInsight());

    const topActions = document.querySelector(".top-actions");
    if (topActions && !document.querySelector("#exam-top-pill")) {
      const examDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", timeZone: DISPLAY_TIME_ZONE,
      }).format(examDateObject());
      topActions.insertAdjacentHTML("afterbegin", `<span id="exam-top-pill" class="exam-top-pill">Prova ${escapeHTML(examDate)} · <b data-exam-days></b></span>`);
    }
    bindEnhancementEvents();
    updateCountdown();
  };

  const queueEnhancement = () => {
    if (enhancementQueued) return;
    enhancementQueued = true;
    queueMicrotask(enhanceHome);
  };

  Promise.all([
    fetch(CONFIG_URL, {cache: "no-store"}).then(response => {
      if (!response.ok) throw new Error(`Configuração da prova: HTTP ${response.status}`);
      return response.json();
    }),
    fetch(CATALOG_URL, {cache: "no-store"}).then(response => {
      if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
      return response.json();
    }),
  ]).then(([examData, catalogData]) => {
    exam = examData;
    catalog = catalogData;
    new MutationObserver(queueEnhancement).observe(document.querySelector("#app"), {childList: true});
    enhanceHome();
    countdownTimer = window.setInterval(updateCountdown, 1000);
    window.addEventListener("pagehide", () => window.clearInterval(countdownTimer), {once: true});
  }).catch(error => console.warn("Melhorias da página inicial indisponíveis:", error));
})();
