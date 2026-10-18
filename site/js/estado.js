// O projeto (o que se salva) e os modelos prontos. Coordenadas em unidades do logo: as do minecraft.png vanilla de
// 1024 de largura, 4 por pixel de interface; 0,0 é o canto do logo vanilla.

export const FORMATO_PROJETO = 1;

// Estilos de cor (só a aparência; a geometria fica)
export const ESTILOS = {
  avaritia: {
    nome: "Avaritia (arco-íris e cósmico)",
    face: { modo: "arco-iris", cor1: "#ff6fb0", cor2: "#7a5cff", luz: 0.25, quina: 0.8, saturacao: 1 },
    lado: { modo: "cosmica", cor1: "#40176f", cor2: "#0f0829", estrelas: true, densidade: 1 },
    paredes: "#000000",
    contornoCor: "#000000",
    rachaduras: { ligadas: true, quantidade: 3, semente: 11 },
  },
  pedra: {
    nome: "Pedra (como o MINECRAFT)",
    face: { modo: "degrade", cor1: "#cec3be", cor2: "#b0a5a1", luz: 0, quina: 0.35, saturacao: 1 },
    lado: { modo: "degrade", cor1: "#3d3938", cor2: "#282625", estrelas: false, densidade: 1 },
    paredes: "#000000",
    contornoCor: "#000000",
    rachaduras: { ligadas: true, quantidade: 4, semente: 5 },
  },
  azul: {
    nome: "Azul (como o Mini Series)",
    face: { modo: "degrade", cor1: "#52b8ef", cor2: "#1b6c9f", luz: 0.1, quina: 0.9, saturacao: 1 },
    lado: { modo: "degrade", cor1: "#c4ecff", cor2: "#0a8ad6", estrelas: false, densidade: 1 },
    paredes: "#000000",
    contornoCor: "#000000",
    rachaduras: { ligadas: true, quantidade: 1, semente: 3 },
  },
};

// Geometria do INFINITO da ferramenta Python (render_infinito.py): vista de baixo, medida no print do Mini Series
export const PRESET_INFINITO = {
  texto: "INFINITO",
  vista: "baixo",
  linha: 206,
  centroX: 512,
  coluna: (0.81 * 1024 * 53 / 71 - 18) / 53,
  alturaFace: 68,
  espessura: 40,
  distFuga: 850,
};

// Geometria parecida com a do MINECRAFT do jogo (vista de cima)
export const PRESET_CIMA = {
  texto: "MINECRAFT",
  vista: "cima",
  linha: 129.5,
  centroX: 512,
  coluna: 1003 / 71,
  alturaFace: 120.5,
  espessura: 36.5,
  distFuga: 1600,
};

let contador = 0;
export function novoId() {
  contador += 1;
  return `c${Date.now().toString(36)}${contador}`;
}

function clonar(o) {
  return JSON.parse(JSON.stringify(o));
}

export function camadaDeTexto(geometria, estilo = "avaritia", nome = null) {
  const e = clonar(ESTILOS[estilo]);
  return {
    id: novoId(),
    tipo: "texto",
    nome: nome || geometria.texto,
    visivel: true,
    ...clonar(geometria),
    contorno: 8,
    contornoCor: e.contornoCor,
    face: e.face,
    lado: e.lado,
    paredes: e.paredes,
    rachaduras: e.rachaduras,
    animacao: { cores: true, estrelas: true },
  };
}

/** "minecraft": o logo do jogo; "edicao": o "JAVA EDITION". Retângulos padrão iguais aos do vanilla. */
export function camadaVanilla(qual) {
  const base = qual === "minecraft"
    ? { x: 0, y: 0, largura: 1024, altura: 176, nome: "MINECRAFT (imagem do jogo)" }
    : { x: 256, y: 148, largura: 512, altura: 56, nome: "JAVA EDITION (imagem do jogo)" };
  return { id: novoId(), tipo: "vanilla", qual, visivel: true, ...base };
}

/** O título que o mod traz hoje: INFINITO atrás, MINECRAFT do jogo na frente. */
export function projetoPadrao() {
  return {
    formato: FORMATO_PROJETO,
    nome: "MC:INFINITO",
    global: {
      deslocamentoY: -10,      // o conjunto sobe 10 pixels de interface
      splashX: 1004,
      splashY: 156,
      botoes: 10,              // só para a prévia: o mod desce os botões pela config dele
      segundosPorVolta: 6,
      quadros: 48,
    },
    camadas: [camadaDeTexto(PRESET_INFINITO, "avaritia"), camadaVanilla("minecraft")],
  };
}

/** Projeto lido de arquivo: completa o que faltar com o padrão, para versão velha não quebrar. */
export function completarProjeto(p) {
  const padrao = projetoPadrao();
  const out = { ...padrao, ...p, global: { ...padrao.global, ...(p.global || {}) } };
  out.camadas = (p.camadas || padrao.camadas).map((c) => {
    if (c.tipo === "texto") {
      const base = camadaDeTexto(PRESET_INFINITO);
      return {
        ...base, ...c,
        face: { ...base.face, ...(c.face || {}) },
        lado: { ...base.lado, ...(c.lado || {}) },
        rachaduras: { ...base.rachaduras, ...(c.rachaduras || {}) },
        animacao: { ...base.animacao, ...(c.animacao || {}) },
        id: c.id || novoId(),
      };
    }
    return { ...camadaVanilla(c.qual || "minecraft"), ...c, id: c.id || novoId() };
  });
  return out;
}

export function aplicarEstilo(camada, estilo) {
  const e = clonar(ESTILOS[estilo]);
  Object.assign(camada, { face: e.face, lado: e.lado, paredes: e.paredes, contornoCor: e.contornoCor, rachaduras: e.rachaduras });
}
