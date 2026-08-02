import {executeAuthorizedTrashRequest} from './trash-unpublished-notion.mjs';

await executeAuthorizedTrashRequest();
await import('./export-editorial-platform-sync-core.mjs');
