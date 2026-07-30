const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const currentRun = Number(process.env.GITHUB_RUN_ID || 0);
const currentSha = String(process.env.GITHUB_SHA || "");

if (!repository || !token || !currentRun) throw new Error("Contexto do GitHub Actions incompleto para rollback.");

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "sedes-df-questoes-rollback",
};
const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/pages.yml/runs?branch=main&event=push&status=success&per_page=30`;
const response = await fetch(endpoint, {headers});
if (!response.ok) throw new Error(`Não foi possível localizar release anterior: HTTP ${response.status}`);
const payload = await response.json();
const previous = (payload.workflow_runs || []).find(run => Number(run.id) !== currentRun && run.head_sha !== currentSha);
if (!previous) throw new Error("Nenhuma execução anterior aprovada foi encontrada para rollback.");

const rerun = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${previous.id}/rerun`, {
  method: "POST",
  headers,
});
if (!rerun.ok) throw new Error(`Rollback não pôde ser acionado: HTTP ${rerun.status}`);
console.log(`✓ Rollback acionado: workflow ${previous.id}, commit ${previous.head_sha}.`);
