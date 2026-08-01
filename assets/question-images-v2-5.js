(() => {
  const visuals = new Map([
    [
      "A figura apresentada retrata o processo orçamentário, considerando a etapa de elaboração da Proposta de Lei Orçamentária Anual (PLOA) no Brasil. De acordo com a Lei nº 4.320/1964, a competência dessa elaboração é do",
      {
        src: "./assets/question-images/iades-seecdf-2023-ppggadm-a-054.svg",
        alt: "Fluxograma cíclico do processo orçamentário com elaboração da proposta, discussão e aprovação, execução, controle e avaliação.",
        caption: "Reconstrução vetorial acessível do ciclo do processo orçamentário apresentado na questão 54.",
      },
    ],
    [
      "No Windows 10 e 11, ao excluir um arquivo utilizando a tecla Del, o arquivo é removido permanentemente do sistema, não podendo ser recuperado pela Lixeira.",
      {
        src: "./assets/question-images/crtr12-2026-q35-original.jpg",
        alt: "Representação da tecla Del, usada para excluir um arquivo no Windows.",
        caption: "Tecla Del reproduzida no caderno da prova CRTR-12/Quadrix 2026.",
      },
    ],
    [
      "No Excel 2016, caso se selecione um intervalo de células com números, será exibida a ferramenta Análise Rápida (ícone reproduzido abaixo).",
      {
        src: "./assets/images/excel-analise-rapida-q23.svg",
        alt: "Ícone da ferramenta Análise Rápida do Microsoft Excel 2016: botão quadrado com pequena grade e raio laranja.",
        caption: "Ferramenta Análise Rápida do Excel 2016.",
      },
    ],
  ]);

  function figureFor(visual) {
    const figure = document.createElement("figure");
    figure.className = "question-visual";
    figure.dataset.questionVisual = "true";
    const image = document.createElement("img");
    image.src = visual.src;
    image.alt = visual.alt;
    image.loading = "lazy";
    image.decoding = "async";
    const caption = document.createElement("figcaption");
    caption.textContent = visual.caption;
    figure.append(image, caption);
    return figure;
  }

  function enhance() {
    const questionTitle = document.querySelector("h1.question-title");
    if (questionTitle && !questionTitle.parentElement.querySelector(":scope > [data-question-visual]")) {
      const visual = visuals.get(questionTitle.textContent.trim());
      if (visual) questionTitle.before(figureFor(visual));
    }
    document.querySelectorAll(".result-question h3").forEach(title => {
      const visual = visuals.get(title.textContent.trim());
      if (visual && !title.parentElement.querySelector(":scope > [data-question-visual]")) title.before(figureFor(visual));
    });
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, {subtree: true, childList: true});
  document.addEventListener("DOMContentLoaded", enhance);
})();
