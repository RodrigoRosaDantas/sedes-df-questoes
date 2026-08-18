import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const node=process.execPath;
const run=(file,args=[],env={})=>execFileSync(node,[file,...args],{cwd:root,env:{...process.env,...env},stdio:"inherit"});
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const readJSON=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));
const checkoutSha=git(["rev-parse","HEAD"]),requestedSha=String(process.env.RELEASE_SOURCE_SHA||checkoutSha).trim();
if(!/^[0-9a-f]{40}$/.test(requestedSha)||requestedSha!==checkoutSha)throw new Error(`SHA do lote CRA-SP inválido: ${requestedSha}.`);
function trackedReleaseDigest(){const files=git(["ls-files","data/release"]).split("\n").filter(Boolean).sort(),hash=crypto.createHash("sha256");for(const relative of files){hash.update(relative);hash.update("\0");hash.update(fs.readFileSync(path.join(root,relative)));hash.update("\0");}return{files:files.length,sha256:hash.digest("hex")};}
const frozenRelease=trackedReleaseDigest();

run("scripts/apply-quadrix-mrosc-crasp-20260817.mjs",[],{GITHUB_SHA:requestedSha,RELEASE_DIR:"dist/data/release"});
run("scripts/derive-quadrix-mrosc-crasp-20260817.mjs",[],{GITHUB_SHA:requestedSha});
for(const script of ["scripts/build-content-model-v1.mjs","scripts/reconcile-discursive-release-meta.mjs","scripts/reconcile-public-metadata.mjs","scripts/reconcile-cloud-provenance-v1.mjs","scripts/reconcile-audit-hardening-v1.mjs"])run(script,[],{GITHUB_SHA:requestedSha});
for(const script of [
 "scripts/validate-session-transition-v2-22.mjs","scripts/validate-edital-relevance-v2-22.mjs","scripts/validate-audit-fixes-v2-22.mjs","scripts/validate-resolver-context-v2-19.mjs",
 "scripts/validate-home-question-format-v2-20.mjs","scripts/validate-home-question-format-v2-20-gate.mjs","scripts/validate-home-study-v2-16.mjs","scripts/validate-runtime-catalog.mjs",
 "scripts/validate-study-navigation-v2-6.mjs","scripts/validate-material-downloads.mjs","scripts/validate-platform-v2-13.mjs","scripts/validate-ux-v2-14.mjs","scripts/validate-navigation-v2-15.mjs",
 "scripts/validate-cloud-progress-v1.mjs","scripts/validate-work-convergence-v1.mjs","scripts/validate-audit-hardening-v1.mjs","scripts/validate-discursive-display.mjs","scripts/validate-dist-v2-10.mjs",
 "scripts/validate-governance-mode.mjs","scripts/validate-public-metadata-consistency.mjs","scripts/validate-study-by-role-v1.mjs"
])run(script);

const catalog=readJSON("dist/data/release/catalogo.json"),release=readJSON("dist/data/release/release-meta.json"),build=readJSON("dist/data/release/build-info.json"),format=readJSON("dist/data/release/question-format-index.json"),contentModel=readJSON("dist/data/release/content-model-v1.json"),receipt=readJSON("dist/data/release/quadrix-mrosc-crasp-20260817-receipt.json"),mapReceipt=readJSON("dist/data/release/quadrix-mrosc-crasp-20260817-map-receipt.json"),edital=readJSON("dist/data/release/edital-map-v1.json"),manifest=readJSON("data/notion/quadrix-mrosc-crasp-20260817/manifest.json");
const questions=Object.keys(catalog.question_index||{}).length,materials=Array.isArray(catalog.materials)?catalog.materials.length:0,bank=Number(release.banco_mestre||0),discursive=Number(release.discursive_display_items||0),awaiting=Number(release.awaiting_audit||0);
if(build.source_sha!==requestedSha||release.source_sha!==requestedSha)throw new Error("Recibos finais CRA-SP não pertencem ao checkout validado.");
if(questions!==3513||materials!==96||bank!==3515||Number(release.proofs)!==57||Number(release.simulations)!==39||discursive!==2||awaiting!==0)throw new Error(`Totais CRA-SP inesperados: banco ${bank}, questões ${questions}, materiais ${materials}, provas ${release.proofs}.`);
if(Number(format.summary?.["true-false"])!==2575||Number(format.summary?.["multiple-choice"])!==938||Number(format.question_count)!==3513)throw new Error("Distribuição de formatos CRA-SP divergente.");
if(Number(contentModel.question_count)!==3513||Number(contentModel.material_count)!==96)throw new Error("Modelo normalizado CRA-SP não fecha.");
if(receipt.operation_id!==manifest.operation_id||receipt.status!=="success"||Number(receipt.added_questions)!==1||Number(receipt.total_questions)!==3513||Number(receipt.total_materials)!==96||Number(receipt.total_proofs)!==57)throw new Error("Recibo de materialização CRA-SP inválido.");
if(mapReceipt.operation_id!==manifest.operation_id||mapReceipt.status!=="success"||Number(mapReceipt.catalog_additions)!==1||Number(mapReceipt.mapping_pairs)!==1||Number(mapReceipt.mapped_questions)!==1318||Number(mapReceipt.unmapped_questions)!==2195)throw new Error("Recibo de mapeamento CRA-SP inválido.");
const code=manifest.expected_codes?.[0],publicId=String(code).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,120);
if(!catalog.question_index?.[publicId])throw new Error(`Questão CRA-SP ausente do catálogo: ${code}.`);
const editalItems=new Map((edital.sections||[]).flatMap(section=>(section.items||[]).map(item=>[item.id,item])));
if(Number(editalItems.get("edas-suas-7")?.question_count||0)<4||!editalItems.get("edas-suas-7")?.question_ids?.includes(publicId))throw new Error("MROSC não recebeu a questão CRA-SP esperada.");
for(const [itemId,exact] of Object.entries(manifest.protected_exact||{}))if(Number(editalItems.get(itemId)?.question_count||0)!==Number(exact))throw new Error(`${itemId}: proteção editorial alterada.`);
if(bank-questions-discursive!==awaiting)throw new Error("Banco Mestre CRA-SP não fecha em objetivas + discursivas + auditoria.");
const currentRelease=trackedReleaseDigest();if(currentRelease.sha256!==frozenRelease.sha256||currentRelease.files!==frozenRelease.files)throw new Error("O lote CRA-SP alterou a release canônica versionada.");
console.log(`✓ CRA-SP MROSC validado no commit ${requestedSha.slice(0,8)}: ${bank} Banco Mestre = ${questions} objetivas + ${discursive} discursivas; ${materials} materiais, ${release.proofs} provas; 2575 C/E + 938 A–E; ${mapReceipt.mapped_questions} mapeadas; MROSC>=4; proteções preservadas.`);
