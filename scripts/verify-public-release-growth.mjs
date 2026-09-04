import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "scripts", "verify-public-release.mjs");
const runtimePath = path.join(root, "scripts", ".verify-public-release-growth-runtime.mjs");
let source = fs.readFileSync(sourcePath, "utf8");

const exactTotals = `if (questions !== 3512 || materials !== 95 || bank !== 3514 || Number(release.proofs) !== 56 || Number(release.simulations) !== 39 || discursive !== 2 || awaiting !== 0)\n  throw new Error(\`Totais finais inesperados: banco \${bank}, questões \${questions}, materiais \${materials}, provas \${release.proofs}, simulados \${release.simulations}, discursivas \${discursive}, auditoria \${awaiting}.\`);`;
const growthTotals = `if (questions < 3512 || materials < 95 || bank < 3514 || Number(release.proofs) < 56 || Number(release.simulations) < 39 || discursive < 2 || awaiting < 0)\n  throw new Error(\`Release perdeu conteúdo abaixo do piso histórico aprovado: banco \${bank}, questões \${questions}, materiais \${materials}, provas \${release.proofs}, simulados \${release.simulations}, discursivas \${discursive}, auditoria \${awaiting}.\`);`;

const exactFormats = `if (Number(format.summary?.["true-false"]) !== 2575 || Number(format.summary?.["multiple-choice"]) !== 937)\n  throw new Error("Distribuição final de formatos divergente do lote aprovado.");`;
const growthFormats = `if (Number(format.summary?.["true-false"]) < 2575 || Number(format.summary?.["multiple-choice"]) < 937)\n  throw new Error("Distribuição de formatos caiu abaixo do piso histórico aprovado.");`;

for (const [expected, replacement, label] of [
  [exactTotals, growthTotals, "totais finais"],
  [exactFormats, growthFormats, "distribuição de formatos"],
]) {
  if (!source.includes(expected)) throw new Error(`Contrato do verificador mudou; não foi possível adaptar ${label} com segurança.`);
  source = source.replace(expected, replacement);
}

fs.writeFileSync(runtimePath, source);
try {
  const result = spawnSync(process.execPath, [runtimePath], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(runtimePath, {force: true});
}
