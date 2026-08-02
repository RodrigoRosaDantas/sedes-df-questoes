import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const request = JSON.parse(read('data/notion/restore-unpublished-request.json'));
if (request.operation !== 'restore_trashed_notion_pages' || request.authorized !== true) {
  throw new Error('Solicitação de restauração inválida.');
}
if (request.expected?.before !== 2536 || request.expected?.restored !== 2458 || request.expected?.after !== 4994) {
  throw new Error('Contagens da restauração divergentes.');
}
if (request.target_ids_sha256 !== '2b4ed19bf9a029a31f5b64fb2d1869e81a368decf1425d6c1cd73c5f50deeaf2') {
  throw new Error('Hash da restauração divergente.');
}

const wrapper = read('scripts/export-editorial-platform-sync.mjs');
if (!wrapper.includes("process.env.GITHUB_EVENT_NAME === 'push'")
    || !wrapper.includes("process.env.GITHUB_REF === 'refs/heads/main'")) {
  throw new Error('Restauração não está limitada ao push da main.');
}
if (/executeAuthorizedTrashRequest|trash-unpublished-notion/.test(wrapper)) {
  throw new Error('Gatilho destrutivo ainda presente no exportador.');
}

for (const forbidden of [
  'data/notion/trash-unpublished-request.json',
  'scripts/trash-unpublished-notion.mjs',
  'scripts/notion-trash-plan.mjs',
  'scripts/notion-trash-common.mjs',
]) {
  if (fs.existsSync(path.join(root, forbidden))) throw new Error(`Arquivo destrutivo ainda presente: ${forbidden}`);
}

console.log('✓ Operação de restauração validada sem gatilho de lixeira e restrita ao push da main.');
