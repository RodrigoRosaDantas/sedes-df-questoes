import {ensureData, state, currentRoute, esc, observeApp} from "./shared-v2-13.js?v=1";

function enhanceRelease() {
  if (!state.release) return;
  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector("[data-release-footer]")) {
    const item = document.createElement("span");
    item.dataset.releaseFooter = "";
    item.textContent = `v${state.release.app_version} · ${String(state.release.source_sha || "local").slice(0, 7)}`;
    footer.append(item);
  }
  const sync = document.querySelector("#sync-label");
  if (sync) sync.title = `Release ${state.release.app_version} · commit ${state.release.source_sha || "local"}`;
  if (currentRoute() !== "inicio" || document.querySelector("[data-release-health]")) return;
  const bank = document.querySelector(".bank-status");
  if (!bank) return;
  const card = document.createElement("section");
  card.className = "release-health card";
  card.dataset.releaseHealth = "";
  card.innerHTML = `<div><p class="eyebrow">Integridade da publicação</p><h2>Release ${esc(state.release.app_version)}</h2><p>Versão, catálogo, cache e hashes derivados da mesma fonte de build.</p></div>
    <div class="release-health-grid"><span><small>Questões</small><strong>${Number(state.release.questions || 0).toLocaleString("pt-BR")}</strong></span><span><small>Materiais</small><strong>${Number(state.release.materials || 0)}</strong></span><span><small>Commit</small><strong>${esc(String(state.release.source_sha || "local").slice(0, 7))}</strong></span><span><small>Cache</small><strong>${esc(state.release.cache_version || "—")}</strong></span></div>`;
  bank.insertAdjacentElement("afterend", card);
}

ensureData().then(() => observeApp(enhanceRelease)).catch(error => console.error("Falha na release unificada:", error));
