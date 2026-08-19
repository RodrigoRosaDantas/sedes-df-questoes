import {activeProfileId, profileKey, currentRoute, readJSON, saveJSON, toast, observeApp} from "./shared-v2-13.js?v=1";

const VAULT_SCHEMA = 1;
const MAX_SNAPSHOTS = 5;
const MAX_CHARS = 3500000;
const vaultKey = () => profileKey("vault.v1");
const fnv1a = input => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
function collect() {
  const prefix = `sedes.questoes.${activeProfileId()}.`;
  const data = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix) && key !== vaultKey()) data[key] = localStorage.getItem(key);
  }
  data["sedes.questoes.activeProfile.v3"] = localStorage.getItem("sedes.questoes.activeProfile.v3");
  return data;
}
function snapshot(reason = "automático") {
  const data = collect();
  const serialized = JSON.stringify(data);
  if (serialized.length < 20) return null;
  const hash = fnv1a(serialized);
  const vault = readJSON(vaultKey(), {schema: VAULT_SCHEMA, snapshots: []});
  if (vault.snapshots?.[0]?.hash === hash) return vault.snapshots[0];
  const item = {id: `${Date.now()}-${hash}`, createdAt: new Date().toISOString(), reason, hash, data};
  const snapshots = [item, ...(vault.snapshots || [])].slice(0, MAX_SNAPSHOTS);
  while (JSON.stringify({schema: VAULT_SCHEMA, snapshots}).length > MAX_CHARS && snapshots.length > 1) snapshots.pop();
  return saveJSON(vaultKey(), {schema: VAULT_SCHEMA, snapshots}) ? item : null;
}
function restore(id) {
  const item = readJSON(vaultKey(), {snapshots: []}).snapshots.find(snapshotItem => snapshotItem.id === id);
  if (!item) return toast("Ponto de restauração não localizado.", "error");
  if (!confirm(`Restaurar o progresso de ${new Date(item.createdAt).toLocaleString("pt-BR")}? O estado atual será preservado.`)) return;
  snapshot("antes da restauração");
  Object.entries(item.data || {}).forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
  location.reload();
}
async function deriveKey(passphrase, salt) {
  const source = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256"}, source, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
}
const toBase64 = bytes => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function exportProtected() {
  const passphrase = prompt("Crie uma senha com pelo menos 8 caracteres para proteger o backup.");
  if (!passphrase || passphrase.length < 8) return toast("Senha insuficiente.", "error");
  snapshot("exportação protegida");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const clear = new TextEncoder().encode(JSON.stringify({schema: 1, profile: activeProfileId(), createdAt: new Date().toISOString(), data: collect()}));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, clear));
  const envelope = {format: "sedes-protected-backup", version: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(encrypted)};
  const url = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2)], {type: "application/json"}));
  const link = Object.assign(document.createElement("a"), {href: url, download: `sedes-protegido-${activeProfileId()}-${new Date().toISOString().slice(0, 10)}.json`});
  link.click(); URL.revokeObjectURL(url); toast("Backup protegido gerado.", "success");
}
async function importProtected(file) {
  try {
    const envelope = JSON.parse(await file.text());
    if (envelope.format !== "sedes-protected-backup" || envelope.version !== 1) throw new Error("Formato inválido");
    const passphrase = prompt("Digite a senha do backup.");
    if (!passphrase) return;
    const key = await deriveKey(passphrase, fromBase64(envelope.salt));
    const clear = await crypto.subtle.decrypt({name: "AES-GCM", iv: fromBase64(envelope.iv)}, key, fromBase64(envelope.data));
    const payload = JSON.parse(new TextDecoder().decode(clear));
    if (payload.schema !== 1 || typeof payload.data !== "object") throw new Error("Conteúdo inválido");
    if (!confirm("Importar este backup protegido? O estado atual será preservado em um ponto de restauração.")) return;
    snapshot("antes da importação");
    Object.entries(payload.data).forEach(([keyName, value]) => value === null ? localStorage.removeItem(keyName) : localStorage.setItem(keyName, value));
    location.reload();
  } catch (error) { console.error(error); toast("Senha incorreta ou arquivo inválido.", "error"); }
}
async function storageText() {
  if (!navigator.storage?.estimate) return "Diagnóstico indisponível neste navegador.";
  const {usage = 0, quota = 0} = await navigator.storage.estimate();
  const percent = quota ? Math.round(usage / quota * 1000) / 10 : 0;
  return `${(usage / 1048576).toFixed(1)} MB usados de ${(quota / 1048576).toFixed(0)} MB (${percent}%).`;
}
async function injectVault() {
  if (currentRoute() !== "desempenho" || document.querySelector("[data-vault-tools]")) return;
  const host = [...document.querySelectorAll(".performance-panel")].find(panel => /backup local|backup complementar/i.test(panel.textContent || ""));
  if (!host) return;
  const vault = readJSON(vaultKey(), {schema: VAULT_SCHEMA, snapshots: []});
  const section = document.createElement("div");
  section.className = "vault-tools"; section.dataset.vaultTools = "";
  section.innerHTML = `<hr><p class="eyebrow">Cofre local</p><h3>Pontos de restauração e backup protegido</h3><p class="muted" data-storage-diagnostic>Calculando armazenamento…</p><div class="vault-actions"><button class="btn" data-vault-snapshot>Criar ponto</button><button class="btn primary" data-vault-export>Backup com senha</button><label class="btn file-button">Importar protegido<input type="file" accept="application/json" data-vault-import></label></div><div class="vault-list">${(vault.snapshots || []).map(item => `<button class="vault-item" data-vault-restore="${item.id}"><strong>${new Date(item.createdAt).toLocaleString("pt-BR")}</strong><small>${item.reason}</small></button>`).join("") || "<p class=\"muted\">Nenhum ponto criado ainda.</p>"}</div>`;
  host.append(section);
  section.querySelector("[data-storage-diagnostic]").textContent = await storageText();
  section.querySelector("[data-vault-snapshot]").addEventListener("click", () => { snapshot("manual"); toast("Ponto de restauração criado.", "success"); location.reload(); });
  section.querySelector("[data-vault-export]").addEventListener("click", exportProtected);
  section.querySelector("[data-vault-import]").addEventListener("change", event => event.target.files?.[0] && importProtected(event.target.files[0]));
  section.querySelectorAll("[data-vault-restore]").forEach(button => button.addEventListener("click", () => restore(button.dataset.vaultRestore)));
}
snapshot("inicialização");
setInterval(() => snapshot("automático"), 60000);
window.addEventListener("pagehide", () => snapshot("saída"));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") snapshot("segundo plano"); });
observeApp(injectVault);