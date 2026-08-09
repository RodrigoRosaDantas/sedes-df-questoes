import fs from "node:fs";

const shared = fs.readFileSync(new URL("../assets/shared-v2-13.js", import.meta.url), "utf8");

if (!/history\.replaceState\(history\.state,\s*["']{2},\s*["']#\/resolver["']\)/.test(shared)) {
  throw new Error("Nova sessão deve trocar a rota com history.replaceState antes do reload.");
}
if (/location\.hash\s*=\s*["']#\/resolver["']/.test(shared)) {
  throw new Error("Regressão: createCompatibleSession não pode disparar hashchange antes do reload.");
}
if (!/saveJSON\(profileKey\(["']session\.v3["']\), payload\)[\s\S]*history\.replaceState[\s\S]*location\.reload\(\)/.test(shared)) {
  throw new Error("A transição precisa gravar a sessão, trocar a URL sem hashchange e só então recarregar.");
}

console.log("✓ Sessão v2.22: transição atômica sem hashchange intermediário nem sobrescrita tardia.");
