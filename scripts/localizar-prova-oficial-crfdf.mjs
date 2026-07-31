const PAGE = 'https://quadrix.org.br/informacoes/1013/';
const response = await fetch(PAGE, {headers: {'user-agent': 'Mozilla/5.0'}});
if (!response.ok) throw new Error(`Página oficial indisponível: HTTP ${response.status}`);
const html = await response.text();
console.log(`OFFICIAL_PAGE_STATUS=${response.status}`);
console.log(`OFFICIAL_PAGE_LENGTH=${html.length}`);
const urls = new Set();
for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
  try {
    const absolute = new URL(match[1], PAGE).href;
    if (/pdf|prova|gabarito|arquivo|download|anexo/i.test(absolute)) urls.add(absolute);
  } catch {}
}
for (const url of urls) console.log(`OFFICIAL_LINK=${url}`);
if (!urls.size) {
  console.log('OFFICIAL_HTML_SNIPPET=' + html.slice(0, 5000).replace(/\s+/g, ' '));
}
