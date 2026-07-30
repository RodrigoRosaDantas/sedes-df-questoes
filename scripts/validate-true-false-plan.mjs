import fs from "node:fs";

const index = JSON.parse(fs.readFileSync("data/true-false/index.json", "utf8"));
const expected = new Map([
  ["PROVA-QDX-SEEDF-2022-GPPGADM-A-", 120],
  ["PROVA-QDX-SEEDF-2025-PROFADM-A-", 120],
]);

if (!Array.isArray(index.planned)) throw new Error("Planejamento C/E ausente.");
for (const [prefix, count] of expected) {
  const item = index.planned.find(entry => entry.prefix === prefix);
  if (!item || Number(item.questions) !== count) throw new Error(`Lote divergente: ${prefix}`);
}
if (index.planned.reduce((sum, item) => sum + Number(item.questions || 0), 0) !== 240) {
  throw new Error("Total planejado de questões C/E deve ser 240.");
}
console.log("✓ Planejamento C/E validado: 2 provas e 240 itens em auditoria.");
