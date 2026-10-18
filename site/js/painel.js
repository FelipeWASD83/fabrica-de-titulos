// O painel da direita: lista de camadas e os controles da camada escolhida e do título inteiro.
// Cada controle muda o projeto e avisa com o tipo da mudança: "forma" (refaz o 3D), "cor" (só repinta),
// "lista" (nomes e ordem) ou "tela" (botões, splash, deslocamento).

import { ESTILOS, aplicarEstilo } from "./estado.js";
import { retanguloDaCamada } from "./previa.js";

function criar(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  if (["input", "select"].includes(tag) && !attrs.name) attrs = { ...attrs, name: `campo${++criar.n}` };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined) el.append(f);
  return el;
}
criar.n = 0;

function secao(titulo, aberta, ...campos) {
  const d = criar("details", { class: "secao" }, criar("summary", {}, titulo), criar("div", { class: "secao-corpo" }, ...campos));
  d.open = aberta;
  return d;
}

export class Painel {
  constructor({ lista, propriedades, globais, mudou }) {
    Object.assign(this, { lista, propriedades, globais, mudou });
    this.projeto = null;
    this.selecionada = null;
    this.abertas = new Set(["Texto", "Tamanho e posição"]);
  }

  definir(projeto, selecionada) {
    this.projeto = projeto;
    this.selecionada = selecionada;
    this.montarLista();
    this.montarPropriedades();
    this.montarGlobais();
  }

  camada() {
    return this.projeto.camadas.find((c) => c.id === this.selecionada) || null;
  }

  // --- controles genéricos ---

  faixa(rotulo, obj, chave, min, max, passo, tipo, dica) {
    const num = criar("input", { type: "number", min, max, step: passo, value: +(+obj[chave]).toFixed(3) });
    const barra = criar("input", { type: "range", min, max, step: passo, value: obj[chave] });
    const aplicar = (v) => {
      if (!Number.isFinite(v)) return;
      obj[chave] = v;
      this.mudou(tipo);
    };
    barra.addEventListener("input", () => { num.value = barra.value; aplicar(+barra.value); });
    num.addEventListener("change", () => { barra.value = num.value; aplicar(+num.value); });
    const campo = criar("label", { class: "campo", title: dica || "" }, criar("span", {}, rotulo),
      criar("div", { class: "campo-faixa" }, barra, num));
    return campo;
  }

  cor(rotulo, obj, chaves, tipo) {
    const ins = chaves.map((k) => {
      const i = criar("input", { type: "color", value: obj[k] });
      i.addEventListener("input", () => { obj[k] = i.value; this.mudou(tipo); });
      return i;
    });
    return criar("label", { class: "campo" }, criar("span", {}, rotulo), criar("div", { class: "cores" }, ...ins));
  }

  escolha(rotulo, obj, chave, opcoes, tipo, depois) {
    const sel = criar("select", {}, ...opcoes.map(([v, t]) => criar("option", { value: v }, t)));
    sel.value = obj[chave];
    sel.addEventListener("change", () => { obj[chave] = sel.value; this.mudou(tipo); if (depois) depois(); });
    return criar("label", { class: "campo" }, criar("span", {}, rotulo), sel);
  }

  marca(rotulo, obj, chave, tipo) {
    const ch = criar("input", { type: "checkbox" });
    ch.checked = Boolean(obj[chave]);
    ch.addEventListener("change", () => { obj[chave] = ch.checked; this.mudou(tipo); });
    return criar("label", { class: "campo" }, criar("span", {}, rotulo), criar("span", {}, ch));
  }

  _secao(titulo, ...campos) {
    const d = secao(titulo, this.abertas.has(titulo), ...campos);
    d.addEventListener("toggle", () => (d.open ? this.abertas.add(titulo) : this.abertas.delete(titulo)));
    return d;
  }

  // --- lista de camadas (a de cima da lista é a que fica na frente: a última do projeto) ---

  montarLista() {
    const ul = this.lista;
    ul.innerHTML = "";
    const camadas = this.projeto.camadas;
    [...camadas].reverse().forEach((c) => {
      const i = camadas.indexOf(c);
      const olho = criar("button", { class: "bt bt-pequeno bt-icone", title: c.visivel ? "Esconder" : "Mostrar" }, c.visivel ? "◉" : "○");
      olho.addEventListener("click", (e) => { e.stopPropagation(); c.visivel = !c.visivel; this.mudou("lista"); });
      const subir = criar("button", { class: "bt bt-pequeno bt-icone", title: "Para a frente" }, "↑");
      subir.disabled = i === camadas.length - 1;
      subir.addEventListener("click", (e) => { e.stopPropagation(); [camadas[i], camadas[i + 1]] = [camadas[i + 1], camadas[i]]; this.mudou("lista"); });
      const descer = criar("button", { class: "bt bt-pequeno bt-icone", title: "Para trás" }, "↓");
      descer.disabled = i === 0;
      descer.addEventListener("click", (e) => { e.stopPropagation(); [camadas[i], camadas[i - 1]] = [camadas[i - 1], camadas[i]]; this.mudou("lista"); });
      const apagar = criar("button", { class: "bt bt-pequeno bt-icone", title: "Apagar camada" }, "×");
      apagar.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Apagar a camada "${c.nome}"?`)) return;
        camadas.splice(i, 1);
        if (this.selecionada === c.id) this.selecionada = camadas[camadas.length - 1]?.id || null;
        this.mudou("lista", this.selecionada);
      });
      const tipo = c.tipo === "texto" ? (c.vista === "baixo" ? "texto, de baixo" : "texto, de cima") : "do jogo";
      const li = criar("li", { class: `camada${c.id === this.selecionada ? " ativa" : ""}${c.visivel ? "" : " oculta"}` },
        olho, criar("span", { class: "camada-nome" }, c.nome), criar("span", { class: "camada-tipo" }, tipo), subir, descer, apagar);
      li.addEventListener("click", () => this.mudou("selecao", c.id));
      ul.appendChild(li);
    });
  }

  // --- propriedades da camada escolhida ---

  montarPropriedades() {
    const div = this.propriedades;
    div.innerHTML = "";
    const c = this.camada();
    if (!c) {
      div.append(criar("p", { class: "dica" }, "Escolha uma camada na lista ou clique nela na prévia."));
      return;
    }
    if (c.tipo === "vanilla") return div.append(...this._propsVanilla(c));
    div.append(...this._propsTexto(c));
  }

  _propsTexto(c) {
    const nome = criar("input", { type: "text", value: c.texto, spellcheck: "false", maxlength: "40" });
    nome.addEventListener("input", () => {
      const antigo = c.texto;
      c.texto = nome.value;
      if (c.nome === antigo || !c.nome) c.nome = nome.value || "Texto";
      this.mudou("forma");
      this.montarLista();
    });
    const estilos = criar("div", { class: "estilos" }, ...Object.entries(ESTILOS).map(([chave, e]) => {
      const b = criar("button", { class: "bt bt-pequeno" }, e.nome);
      b.addEventListener("click", () => { aplicarEstilo(c, chave); this.mudou("forma"); this.montarPropriedades(); });
      return b;
    }));
    const tamanho = { valor: 100 };
    const geral = this.faixa("Tamanho geral (%)", tamanho, "valor", 20, 300, 1, "nada",
      "Aumenta ou diminui tudo junto: largura, altura, espessura e contorno.");
    let anterior = 100;
    geral.querySelectorAll("input").forEach((i) => i.addEventListener("change", () => {
      const f = tamanho.valor / anterior;
      anterior = tamanho.valor;
      // a distância do ponto de fuga escala junto: assim a forma fica a mesma, só maior ou menor
      c.coluna *= f; c.alturaFace *= f; c.espessura *= f; c.contorno *= f; c.distFuga *= f;
      this.mudou("forma");
      this.montarPropriedades();
    }));
    const centralizar = criar("button", { class: "bt bt-pequeno" }, "Centralizar na horizontal");
    centralizar.addEventListener("click", () => { c.centroX = 512; this.mudou("forma"); this.montarPropriedades(); });
    const entre = criar("button", { class: "bt bt-pequeno", title: "Centraliza na emenda entre a camada de cima e a de baixo e põe na frente (como o JAVA EDITION do jogo)" },
      "Pôr entre as outras camadas");
    entre.addEventListener("click", () => {
      if (!this.centralizarEdicao(c)) { alert("Precisa de pelo menos duas outras camadas visíveis."); return; }
      this.mudou("lista", c.id);
      this.montarPropriedades();
    });

    return [
      this._secao("Texto",
        criar("label", { class: "campo" }, criar("span", {}, "Escrito"), nome),
        this.escolha("Fonte", c, "fonte", [["logo", "Logo do Minecraft (como o MINECRAFT)"], ["pixel", "Pixelada, 5 linhas (como o JAVA EDITION)"]], "forma"),
        criar("p", { class: "dica" }, "Letras A a Z, números e : . ! - ? (acento e minúscula viram a letra sem acento, maiúscula)."),
        criar("div", { class: "campo" }, criar("span", {}, "Estilo pronto"), estilos)),
      this._secao("Tamanho e posição",
        geral,
        this.faixa("Largura da letra", c, "coluna", 3, 40, 0.01, "forma", "Largura de uma coluna da fonte na borda de perto, em unidades do logo (4 = 1 pixel de interface)."),
        this.faixa("Altura da face", c, "alturaFace", 10, 300, 0.5, "forma", "Altura da face da letra na imagem."),
        this.faixa("Espessura", c, "espessura", 0, 150, 0.5, "forma", "Altura da parte de lado (embaixo na vista de cima, em cima na vista de baixo)."),
        this.faixa("Posição X (centro)", c, "centroX", -600, 1600, 1, "forma"),
        this.faixa("Posição Y (borda de perto)", c, "linha", -400, 800, 0.5, "forma", "Vista de cima: o pé da face. Vista de baixo: o topo da face."),
        criar("div", { class: "linha-botoes" }, centralizar, entre)),
      this._secao("Perspectiva",
        this.escolha("Vista", c, "vista", [["cima", "De cima (como o MINECRAFT)"], ["baixo", "De baixo (como o INFINITO)"]], "forma", () => this.montarLista()),
        this.faixa("Força", c, "distFuga", 250, 6000, 10, "forma", "Distância até o ponto de fuga, em unidades do logo. Menor = as letras das pontas inclinam mais. O MINECRAFT do jogo tem uns 1600; o INFINITO, 850."),
        criar("p", { class: "dica" }, "Na vista de cima as letras da esquerda e da direita inclinam para fora, como no logo do jogo; na de baixo, para dentro.")),
      this._secao("Cor da face",
        this.escolha("Tipo", c.face, "modo", [["arco-iris", "Arco-íris (Avaritia)"], ["degrade", "Degradê"], ["solida", "Uma cor"]], "cor"),
        this.cor("Cores (fundo, perto)", c.face, ["cor1", "cor2"], "cor"),
        this.faixa("Saturação do arco-íris", c.face, "saturacao", 0, 1.6, 0.01, "cor"),
        this.faixa("Luz no fundo", c.face, "luz", 0, 1, 0.01, "cor", "Clareia a parte de trás da letra."),
        this.faixa("Brilho da quina", c.face, "quina", 0, 1, 0.01, "cor", "A linha clara entre a face e a espessura.")),
      this._secao("Cor da espessura",
        this.escolha("Tipo", c.lado, "modo", [["cosmica", "Cósmica (Avaritia)"], ["degrade", "Degradê"], ["solida", "Uma cor"]], "cor"),
        this.cor("Cores (junto da face, longe)", c.lado, ["cor1", "cor2"], "cor"),
        this.marca("Estrelas", c.lado, "estrelas", "cor"),
        this.faixa("Quantidade de estrelas", c.lado, "densidade", 0.1, 1.8, 0.01, "cor")),
      this._secao("Contorno e paredes",
        this.faixa("Contorno", c, "contorno", 0, 30, 0.5, "forma", "Espessura da borda, em unidades do logo. O MINECRAFT do jogo tem 10."),
        this.cor("Cor do contorno", c, ["contornoCor"], "cor"),
        this.cor("Cor das paredes", c, ["paredes"], "cor"),
        criar("p", { class: "dica" }, "Paredes são os lados das letras; no logo do jogo elas são pretas, junto com o contorno.")),
      this._secao("Detalhes",
        this.marca("Rachaduras", c.rachaduras, "ligadas", "cor"),
        this.faixa("Rachaduras por letra", c.rachaduras, "quantidade", 0, 8, 1, "forma"),
        this.faixa("Sorteio", c.rachaduras, "semente", 1, 999, 1, "forma", "Troca o desenho das rachaduras.")),
      this._secao("Animação",
        this.marca("Cores correm", c.animacao, "cores", "cor"),
        this.marca("Estrelas piscam", c.animacao, "estrelas", "cor"),
        criar("p", { class: "dica" }, "Só anima no jogo com o mod. A velocidade fica em Título inteiro.")),
    ];
  }

  _propsVanilla(c) {
    const proporcao = c.qual === "minecraft" ? 1024 / 176 : 512 / 56;
    const larg = this.faixa("Largura", c, "largura", 50, 3000, 1, "forma");
    larg.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => {
      c.altura = Math.round(c.largura / proporcao);
    }));
    const original = criar("button", { class: "bt bt-pequeno" }, "Tamanho e lugar do jogo");
    original.addEventListener("click", () => {
      Object.assign(c, c.qual === "minecraft" ? { x: 0, y: 0, largura: 1024, altura: 176 } : { x: 256, y: 148, largura: 512, altura: 56 });
      this.mudou("forma");
      this.montarPropriedades();
    });
    const campos = [
      this.faixa("Posição X", c, "x", -1000, 2000, 1, "forma"),
      this.faixa("Posição Y", c, "y", -500, 1000, 1, "forma"),
      larg,
      criar("div", { class: "linha-botoes" }, original),
    ];
    if (c.qual === "edicao") {
      const meio = criar("button", { class: "bt bt-pequeno" }, "Pôr no meio dos dois textos");
      meio.addEventListener("click", () => { this.centralizarEdicao(c); this.mudou("forma"); this.montarPropriedades(); });
      campos.push(criar("div", { class: "linha-botoes" }, meio));
    }
    return [
      this._secao(c.qual === "minecraft" ? "MINECRAFT do jogo" : "JAVA EDITION do jogo",
        criar("p", { class: "dica" }, "Imagem do próprio Minecraft 1.21.1, com as rachaduras de pedra originais. No jogo, o mod usa a textura do jogo; ela não vai no pacote."),
        ...campos),
    ];
  }

  /**
   * Põe a camada (o JAVA EDITION, em texto 3D ou na imagem do jogo) no meio da emenda entre a camada de cima e a de
   * baixo, centralizada na horizontal, e na frente de tudo. Precisa de outras duas camadas visíveis.
   */
  centralizarEdicao(ed) {
    const outros = this.projeto.camadas.filter((c) => c !== ed && c.visivel)
      .map((c) => ({ c, r: retanguloDaCamada(c) })).filter((o) => o.r)
      .sort((a, b) => (a.r.y + a.r.altura / 2) - (b.r.y + b.r.altura / 2));
    if (outros.length < 2) return false;
    const cima = outros[0].r, baixo = outros[outros.length - 1].r;
    const emenda = (cima.y + cima.altura + baixo.y) / 2;
    if (ed.tipo === "texto") {
      // a caixa (janela) do texto 3D inclui o contorno; o centro dela fica na emenda
      const r = retanguloDaCamada(ed);
      ed.centroX = 512;
      ed.linha += emenda - (r.y + r.altura / 2);
    } else {
      ed.x = Math.round(512 - ed.largura / 2);
      ed.y = Math.round(emenda - ed.altura / 2);
    }
    const lista = this.projeto.camadas;
    lista.splice(lista.indexOf(ed), 1);
    lista.push(ed);
    return true;
  }

  // --- título inteiro ---

  montarGlobais() {
    const g = this.projeto.global;
    this.globais.innerHTML = "";
    this.globais.append(
      this.faixa("Subir ou descer tudo", g, "deslocamentoY", -60, 60, 1, "tela", "Em pixels de interface (negativo sobe). Vai no pacote do mod; no pacote sem mod o logo fica sempre no lugar do jogo."),
      this.faixa("Botões (só na prévia)", g, "botoes", -60, 100, 1, "tela", "Quanto o mod desce os botões. No jogo isso é a opção deslocamentoBotoes da config do mod (padrão 10)."),
      this.faixa("Texto amarelo X", g, "splashX", -400, 1600, 1, "tela", "Centro do texto que pula, em unidades do logo. O do jogo fica em 1004."),
      this.faixa("Texto amarelo Y", g, "splashY", -200, 600, 1, "tela", "O do jogo fica em 156."),
      this.faixa("Segundos por volta", g, "segundosPorVolta", 1, 30, 0.5, "cor", "Velocidade da animação na prévia. No jogo vale a da config do mod."),
      this.escolha("Quadros da animação", g, "quadros", [["24", "24"], ["48", "48 (como o INFINITO)"], ["96", "96"]], "nada"),
      criar("p", { class: "dica" }, "Mais quadros = animação mais lisa e pacote maior."),
    );
  }
}
