import {ensureData, state, observeApp} from "./shared-v2-13.js?v=1";

function enhanceReleaseMetadata() {
  if (!state.release) return;
  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector("[data-release-footer]")) {
    const item = document.createElement("span");
    item.dataset.releaseFooter = "";
    item.textContent = `v${state.release.app_version} · ${String(state.release.source_sha || "local").slice(0, 7)}`;
    footer.append(item);
  }
  const sync = document.querySelector("#sync-label");
  if (sync && !sync.title) sync.title = `Release ${state.release.app_version} · commit ${state.release.source_sha || "local"}`;
}

ensureData().then(() => observeApp(enhanceReleaseMetadata)).catch(error => console.error("Falha na release unificada:", error));
