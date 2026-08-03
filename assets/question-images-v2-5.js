(() => {
  const visuals = new Map([
    [
      "A imagem a seguir pode ser percebida como um círculo, embora seja uma forma circular incompleta. Essa percepção só é possível pela predominância da métrica na relação entre forma e fundo.",
      {
        src: "./assets/question-images/seedf-2025-art-a-072.svg",
        alt: "Forma circular incompleta com uma abertura no quadrante superior direito.",
        caption: "Reconstrução vetorial acessível da forma circular incompleta apresentada na questão 72.",
      },
    ],
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
    [
      "Um possível sinônimo de “perguntaram”, no primeiro quadrinho, seria",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png",
        alt: "Tirinha em dois quadrinhos sobre pertencimento à terra e expulsão de povos originários.",
        caption: "Tirinha original compartilhada pelas questões 6, 7 e 8.",
      },
    ],
    [
      "Substituindo-se “a gente” por um pronome pessoal correspondente na fala “Por isso expulsaram a gente!”, ela seria reescrita da seguinte maneira:",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png",
        alt: "Tirinha em dois quadrinhos sobre pertencimento à terra e expulsão de povos originários.",
        caption: "Tirinha original compartilhada pelas questões 6, 7 e 8.",
      },
    ],
    [
      "Mantendo-se o sentido original do texto, o trecho “somos daquela terra” poderia ser substituído por",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png",
        alt: "Tirinha em dois quadrinhos sobre pertencimento à terra e expulsão de povos originários.",
        caption: "Tirinha original compartilhada pelas questões 6, 7 e 8.",
      },
    ],
    [
      "A imagem acima apresenta exemplos de como serão efetuadas as conversões das placas de automóveis antigas para o novo modelo, que será adotado em todo o Mercosul. As principais mudanças são a ausência do estado e da cidade onde o carro foi emplacado e a substituição de um dos algoritmos da placa antiga por uma letra, conforme a regra exibida na imagem. Sendo assim, supondo-se que um indivíduo tenha adquirido um automóvel usado, more em um município diferente do município onde o carro foi emplacado e precise fazer a substituição da atual placa, cujo código é AEI – 1334, para o modelo novo, é correto afirmar que a placa de seu carro passará a ser",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q017-conversao-placas.png",
        alt: "Tabela de conversão de algarismos para letras no padrão Mercosul de placas veiculares.",
        caption: "Tabela original de conversão apresentada na questão 17.",
      },
    ],
    [
      "A imagem acima mostra um mapa que exibe o município de Alto Paraíso de Goiás. Nele, um segmento de reta, que liga a Cidade da Fraternidade à região central de Alto Paraíso de Goiás, mede 8,5 cm. Nesse caso, considerando-se que o referido mapa tenha sido construído na escala 1:400.000, é correto afirmar que, na realidade, tal segmento mede",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q018-mapa-escala.png",
        alt: "Mapa de Alto Paraíso de Goiás com segmento de 8,5 cm e escala 1:400.000.",
        caption: "Mapa original apresentado na questão 18.",
      },
    ],
    [
      "Para a felicidade dos moradores de um bairro da região metropolitana de Goiânia, foi inaugurado o primeiro clube aquático municipal público, que poderá ser usado por toda a população, tanto da capital quanto do seu entorno. No clube, uma das piscinas tem profundidade variável, conforme a ilustração a seguir. A superfície de tal piscina é um retângulo com 6 m de comprimento e 2 m de largura. A maior profundidade mede 2,5 m e a menor, 1 m. Com base nessa situação hipotética, é correto afirmar que, para encher completamente a piscina, são necessários",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q020-piscina.png",
        alt: "Esquema de piscina retangular com profundidade variável de 2,5 m a 1 m.",
        caption: "Esquema original apresentado na questão 20.",
      },
    ],
    [
      "Em relação à figura acima, julgue os itens subsequentes. I A divisão ilustrada corresponde a uma divisão posterior à Constituição de 1934, um pouco antes do surgimento de Goiás como capitania independente. II Até meados do século XVIII, a região de Goiás estava subordinada à capitania de São Paulo, conforme se observa no mapa. III O mapa representa a divisão administrativa do Brasil no início do século XVIII, cujo território já avançava para além dos limites de Tordesilhas. Assinale a alternativa correta.",
      {
        src: "./assets/question-images/alto-paraiso-go-2023-orientador-social/q025-mapa-capitanias.png",
        alt: "Mapa da divisão administrativa do Brasil no início do século XVIII.",
        caption: "Mapa original apresentado na questão 25.",
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
