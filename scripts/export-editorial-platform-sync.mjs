import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {executeAuthorizedTrashRequest} from './trash-unpublished-notion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const fixedTimeImport = './scripts/fixed-build-time.mjs';
for (const script of ['scripts/build-release-v2-4.mjs', 'scripts/apply-notion-snapshot.mjs']) {
  execFileSync(node, ['--import', fixedTimeImport, script], {cwd: root, stdio: 'inherit'});
}

await executeAuthorizedTrashRequest();
await import('./export-editorial-platform-sync-core.mjs');
