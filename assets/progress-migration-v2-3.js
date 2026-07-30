(() => {
  const VERSION_KEY = "sedes.questoes.progressMigration.v2.3";
  const VERSION = "2026-07-30-1";
  if (localStorage.getItem(VERSION_KEY) === VERSION) return;

  const profileIds = ["rodrigo", "amanda", "andressa"];
  for (const profileId of profileIds) {
    const historyKey = `sedes.questoes.${profileId}.history.v3`;
    const errorsKey = `sedes.questoes.${profileId}.errors.v3`;
    let history = [];
    let errors = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (Array.isArray(parsed)) history = parsed;
    } catch { history = []; }
    try {
      const parsed = JSON.parse(localStorage.getItem(errorsKey) || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) errors = parsed;
    } catch { errors = {}; }

    const answerEvidence = new Map();
    const migratedHistory = history.map(attempt => {
      const answers = attempt.answers && typeof attempt.answers === "object" ? attempt.answers : {};
      const answeredQuestionIds = Object.entries(answers)
        .filter(([, answer]) => Boolean(answer))
        .map(([id]) => id);
      const presentedQuestionIds = Array.isArray(attempt.presentedQuestionIds)
        ? attempt.presentedQuestionIds
        : Array.isArray(attempt.questionIds) ? attempt.questionIds : answeredQuestionIds;
      const questionResults = (attempt.questionResults || []).map(result => {
        const answer = Object.hasOwn(result, "answer") ? result.answer : answers[result.id] || null;
        const evidence = answerEvidence.get(result.id) || {presented: false, answered: false, wrong: false};
        evidence.presented = true;
        if (answer) {
          evidence.answered = true;
          if (!result.correct) evidence.wrong = true;
        }
        answerEvidence.set(result.id, evidence);
        return {...result, answer};
      });
      for (const id of presentedQuestionIds) {
        if (!answerEvidence.has(id)) answerEvidence.set(id, {presented: true, answered: Boolean(answers[id]), wrong: false});
      }
      const answered = answeredQuestionIds.length;
      const correct = Number(attempt.correct || 0);
      return {
        ...attempt,
        answered,
        accuracy: answered ? Math.round(correct / answered * 1000) / 10 : 0,
        presentedQuestionIds,
        answeredQuestionIds,
        questionIds: answeredQuestionIds,
        questionResults,
        metricsMigrated: true,
      };
    });

    const migratedErrors = Object.fromEntries(Object.entries(errors).filter(([id]) => {
      const evidence = answerEvidence.get(id);
      if (!evidence) return true;
      return evidence.wrong || evidence.answered;
    }));

    try {
      localStorage.setItem(historyKey, JSON.stringify(migratedHistory));
      localStorage.setItem(errorsKey, JSON.stringify(migratedErrors));
    } catch (error) {
      console.warn(`Não foi possível migrar o progresso de ${profileId}:`, error);
    }
  }
  localStorage.setItem(VERSION_KEY, VERSION);
})();
