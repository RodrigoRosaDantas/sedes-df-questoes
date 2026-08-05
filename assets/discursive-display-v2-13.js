const CATALOG_URL = './data/release/catalogo.json';
let catalogPromise;
let scheduled = false;
let lastMaterialKey = '';

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const rich = value => esc(value || '').replace(/\n/g, '<br>');

async function catalog() {
  catalogPromise ||= fetch(CATALOG_URL, {cache: 'no-store'}).then(response => {
    if (!response.ok) throw new Error(`Catálogo indisponível: ${response.status}`);
    return response.json();
  });
  return catalogPromise;
}

async function materialByVisibleTitle() {
  const title = document.querySelector('.detail-hero h1')?.textContent?.trim();
  if (!title) return null;
  const data = await catalog();
  const metadata = (data.materials || []).find(item => String(item.nome || '').trim() === title);
  if (!metadata) return null;
  const url = new URL(String(metadata.file || '').replace(/^\.\//, ''), document.baseURI);
  const material = await fetch(url, {cache: 'no-store'}).then(response => {
    if (!response.ok) throw new Error(`Material indisponível: ${response.status}`);
    return response.json();
  });
  return {metadata, material};
}

function displayCard(item, index) {
  const number = Number(item.numero_original || item.numero) || index + 1;
  return `<article class="discursive-display-card card">
    <header><div><p class="eyebrow">Somente leitura · não pontuada</p><h3>Questão discursiva ${number}</h3></div><span class="pill">${esc(item.dificuldade || 'Discursiva')}</span></header>
    ${item.texto_base ? `<section class="discursive-text-base"><strong>Texto-base</strong><p>${rich(item.texto_base)}</p></section>` : ''}
    <section><strong>Comando da banca</strong><p>${rich(item.enunciado)}</p></section>
    ${item.orientacao ? `<section class="discursive-guidance"><strong>Orientação de abordagem</strong><p>${rich(item.orientacao)}</p></section>` : ''}
    ${item.fundamento ? `<section><strong>Referências</strong><p>${rich(item.fundamento)}</p></section>` : ''}
    ${item.pegadinha ? `<section><strong>Atenção</strong><p>${rich(item.pegadinha)}</p></section>` : ''}
    <footer><span>Não entra no cronômetro, no gabarito nem nas estatísticas.</span>${item.fonte_oficial ? `<a href="${esc(item.fonte_oficial)}" target="_blank" rel="noopener noreferrer">Fonte oficial ↗</a>` : ''}</footer>
  </article>`;
}

async function enhanceMaterial() {
  const detail = document.querySelector('.detail-hero');
  if (!detail || document.querySelector('[data-discursive-display]')) return;
  const result = await materialByVisibleTitle();
  const discursivas = result?.material?.discursivas || [];
  if (!discursivas.length) return;
  const key = `${result.material.id}:${discursivas.map(item => item.codigo).join(',')}`;
  if (key === lastMaterialKey && document.querySelector('[data-discursive-display]')) return;
  lastMaterialKey = key;

  const summary = detail.querySelector('.detail-summary');
  if (summary && !summary.querySelector('[data-discursive-summary]')) {
    summary.insertAdjacentHTML('beforeend', `<div data-discursive-summary><small>Discursivas</small><strong>${discursivas.length}</strong></div>`);
  }

  const modeGrid = document.querySelector('.mode-grid');
  if (!modeGrid) return;
  modeGrid.insertAdjacentHTML('afterend', `<section class="section discursive-display" data-discursive-display>
    <div class="section-head"><div><p class="eyebrow">Caderno oficial</p><h2>Questão discursiva para consulta</h2><p>Conteúdo exibido integralmente, sem resposta automática e sem impacto no desempenho.</p></div><span class="stamp">${discursivas.length} item de consulta</span></div>
    <div class="discursive-display-list">${discursivas.map(displayCard).join('')}</div>
  </section>`);
}

async function enhanceHome() {
  const status = document.querySelector('.bank-status');
  if (!status || status.querySelector('[data-discursive-bank]')) return;
  const data = await catalog();
  const displayOnly = Number(data.summary?.discursivas_consulta || 0);
  if (!displayOnly) return;
  status.insertAdjacentHTML('beforeend', `<div data-discursive-bank><span>Discursivas para consulta</span><strong>${displayOnly}</strong><small>itens visíveis, sem correção automática</small></div>`);
}

async function enhance() {
  scheduled = false;
  try {
    await Promise.all([enhanceMaterial(), enhanceHome()]);
  } catch (error) {
    console.error('Falha ao carregar discursivas para visualização:', error);
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(enhance);
}

new MutationObserver(schedule).observe(document.querySelector('#app'), {childList: true, subtree: true});
window.addEventListener('hashchange', () => {
  lastMaterialKey = '';
  schedule();
});
schedule();
