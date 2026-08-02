import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {executeAuthorizedRestoreFromBackup} from './restore-trashed-notion-from-backup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const fixedTimeImport = './scripts/fixed-build-time.mjs';
for (const script of ['scripts/build-release-v2-4.mjs', 'scripts/apply-notion-snapshot.mjs']) {
  execFileSync(node, ['--import', fixedTimeImport, script], {cwd: root, stdio: 'inherit'});
}

if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main') {
  await executeAuthorizedRestoreFromBackup();
} else {
  console.log('✓ Validação sem mutação no Notion: restauração permitida somente após integração na main.');
}

await import('./export-editorial-platform-sync-core.mjs');
