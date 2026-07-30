import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
let index = fs.readFileSync(indexPath, "utf8");

if (!index.includes('rel="manifest"')) {
  index = index.replace('<meta name="description"', '<link rel="manifest" href="./manifest.webmanifest">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n  <meta name="description"');
}
if (!index.includes("assets/intelligence-v2-9.css")) {
  index = index.replace('  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">', '  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">\n  <link rel="stylesheet" href="./assets/intelligence-v2-9.css?v=1">');
}
index = index.replace(/assets\/app-v4\.js\?v=\d+/, "assets/app-v4.js?v=4");
if (!index.includes("assets/learning-v2-9.js")) {
  index = index.replace('  <script type="module" src="./assets/app-v4.js?v=4"></script>', '  <script type="module" src="./assets/app-v4.js?v=4"></script>\n  <script type="module" src="./assets/learning-v2-9.js?v=1"></script>\n  <script type="module" src="./assets/pwa-v2-9.js?v=1"></script>');
}
fs.writeFileSync(indexPath, index);
console.log("✓ Camadas inteligentes e PWA integradas ao pacote final.");
