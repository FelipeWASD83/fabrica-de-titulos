// A geometria do logo: letras como blocos deitados, vistas por uma câmera inclinada. Mesma matemática da ferramenta
// titulo-infinito/ferramentas/render_infinito.py (lá está a calibração no logo vanilla do 1.21.1).
// Coordenadas "do logo": as do minecraft.png vanilla de 1024 de largura (4 unidades = 1 pixel de interface).

import { gradeDaPalavra, virarGrade } from "./fonte.js";

export const ALTURA = 100;            // câmera acima do topo das letras (unidade do mundo)
export const UNID = 1.57465;          // largura de uma coluna da fonte
export const DZ = (78.9094 - 62.3588) / 10; // profundidade de uma meia-linha
export const CX = 528;                // a vertical dos pontos de fuga do logo vanilla
const DIST_HORIZONTE_PADRAO = 1534;
// nadir no mínimo a 2 alturas de face da borda de perto (escala junto com o texto)
const NADIR_MINIMO = 2;

export class Camera {
  // cy: centro da imagem; yHorizonte: ponto de fuga da profundidade; yNadir: ponto de fuga das verticais
  constructor(cx, cy, yHorizonte, yNadir) {
    this.cx = cx;
    this.cy = cy;
    this.foco = Math.sqrt((cy - yHorizonte) * (yNadir - cy));
    const incl = Math.atan((cy - yHorizonte) / this.foco);
    this.sen = Math.sin(incl);
    this.cos = Math.cos(incl);
  }

  projetar(X, Y, Z) {
    const pf = -Y * this.sen + Z * this.cos;
    const pd = -Y * this.cos - Z * this.sen;
    return [this.cx + (this.foco * X) / pf, this.cy + (this.foco * pd) / pf];
  }

  zNaLinha(y, Y = -ALTURA) {
    const k = (y - this.cy) / this.foco;
    return (-Y * this.cos + k * Y * this.sen) / (k * this.cos + this.sen);
  }

  xNaColuna(x, Z, Y = -ALTURA) {
    return ((x - this.cx) * (-Y * this.sen + Z * this.cos)) / this.foco;
  }
}

function buscar(f, lo, hi, alvo, crescente) {
  for (let i = 0; i < 90; i++) {
    const meio = (lo + hi) / 2;
    if ((f(meio) < alvo) === crescente) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

/**
 * Monta um texto 3D a partir de medidas na imagem (unidades do logo):
 *   linha       y da borda de perto (vista de cima: o pé da face; vista de baixo: o topo da face)
 *   centroX     centro da palavra
 *   coluna      largura de uma coluna da fonte na borda de perto (a palavra toda = coluna x colunas; assim
 *               mudar o texto não espreme as letras)
 *   alturaFace  altura da face na imagem
 *   espessura   altura da espessura na imagem (abaixo da face de cima; acima da face de baixo)
 *   distFuga    distância da borda de perto até o ponto de fuga (menor = perspectiva mais forte)
 *   vista       "cima" ou "baixo"
 * A câmera é achada pelas medidas, como o INFINITO na ferramenta Python. Devolve null se o texto estiver vazio.
 */
export function montarTexto(p) {
  let grade = gradeDaPalavra(p.texto);
  if (!grade.letras.length) return null;
  const baixo = p.vista === "baixo";
  if (baixo) grade = virarGrade(grade);
  const ncol = grade.colunas;
  const yPerto = p.linha;                          // na imagem ainda sem virar; a vista de baixo vira em torno dela
  const yHorizonte = yPerto - Math.max(60, p.distFuga);

  const montar = (yNadir) => {
    const cam = new Camera(CX, yPerto, yHorizonte, yNadir);
    const z = cam.zNaLinha(yPerto);
    const k = (p.coluna * (ALTURA * cam.sen + z * cam.cos)) / (cam.foco * UNID);
    const face = yPerto - cam.projetar(0, -ALTURA, z + 10 * k * DZ)[1];
    return { cam, z, k, face };
  };
  // nadir mais longe = câmera mais de raspão = face mais baixa para a mesma largura. Nadir colado no texto faz a
  // espessura virar um funil; o mínimo de 2 alturas de face deixa folga (o MINECRAFT do jogo fica a ~4, o INFINITO a ~20)
  const yNadir = buscar((yn) => montar(yn).face, yPerto + NADIR_MINIMO * p.alturaFace, yPerto + 200000, p.alturaFace, false);
  const { cam, z, k, face } = montar(yNadir);
  const xMeio = cam.xNaColuna(p.centroX, z);
  const alvo = yPerto + p.espessura;
  // a espessura projetada não passa do nadir: limita a busca e diz quanto deu
  const espessura = buscar((t) => cam.projetar(xMeio, -ALTURA - t, z)[1], 0, 500, alvo, true);
  const espessuraObtida = cam.projetar(xMeio, -ALTURA - espessura, z)[1] - yPerto;
  const avisos = [];
  if (Math.abs(face - p.alturaFace) > 1.5) {
    avisos.push(`a altura da face pedida (${Math.round(p.alturaFace)}) não cabe com essa largura de letra e essa força; ficou ${Math.round(face)}`);
  }
  if (Math.abs(espessuraObtida - p.espessura) > 1.5) {
    avisos.push(`a espessura pedida (${Math.round(p.espessura)}) não cabe nessa perspectiva; ficou ${Math.round(espessuraObtida)}`);
  }
  return {
    grade, cam, baixo, linha: yPerto,
    xEsq: xMeio - (ncol * k * UNID) / 2, zPerto: z, k, espessura,
    faceObtida: face, espessuraObtida, avisos,
  };
}

/** Converte y da imagem final para a imagem sem virar (e vice-versa: a conta é a mesma). */
export function virarY(t, y) {
  return t.baixo ? 2 * t.linha - y : y;
}

/** Os 8 cantos de um bloco da grade, projetados, já na imagem final. */
function cantosDoBloco(t, lin, col) {
  const xa = t.xEsq + col * t.k * UNID;
  const za = t.zPerto + (9 - lin) * t.k * DZ;
  const pts = [];
  for (const X of [xa, xa + t.k * UNID]) {
    for (const Z of [za, za + t.k * DZ]) {
      for (const Y of [-ALTURA, -ALTURA - t.espessura]) {
        const [x, y] = t.cam.projetar(X, Y, Z);
        pts.push([x, virarY(t, y)]);
      }
    }
  }
  return pts;
}

/** Retângulo (unidades do logo, inteiros) que contém o texto com o contorno. */
export function janela(t, contorno) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const g = t.grade;
  for (let l = 0; l < 10; l++) {
    for (let c = 0; c < g.colunas; c++) {
      if (!g.celulas[l * g.colunas + c]) continue;
      for (const [x, y] of cantosDoBloco(t, l, c)) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  const m = contorno + 3;
  const ax = Math.floor(x0 - m), ay = Math.floor(y0 - m);
  return { x: ax, y: ay, largura: Math.ceil(x1 + m) - ax, altura: Math.ceil(y1 + m) - ay };
}

// --- contorno de cantos vivos, como o do logo vanilla ---

function cascoConvexo(pontos) {
  const pts = [...pontos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const giro = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baixo = [], cima = [];
  for (const p of pts) {
    while (baixo.length >= 2 && giro(baixo[baixo.length - 2], baixo[baixo.length - 1], p) <= 0) baixo.pop();
    baixo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (cima.length >= 2 && giro(cima[cima.length - 2], cima[cima.length - 1], p) <= 0) cima.pop();
    cima.push(p);
  }
  return baixo.slice(0, -1).concat(cima.slice(0, -1));
}

function area(poli) {
  let s = 0;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i], b = poli[(i + 1) % poli.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

// afasta cada lado por d e junta os cantos em ponta; ponta mais longa que limite*d vira chanfro
function deslocarComPonta(poli, d, limite = 4) {
  const n = poli.length;
  const linhas = poli.map((a, i) => {
    const b = poli[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const comp = Math.hypot(ex, ey) || 1e-9;
    const nx = ey / comp, ny = -ex / comp;
    return { p: [a[0] + nx * d, a[1] + ny * d], dir: [ex, ey], n: [nx, ny] };
  });
  const saida = [];
  for (let i = 0; i < n; i++) {
    const A = linhas[(i - 1 + n) % n], B = linhas[i];
    const cruz = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0];
    const canto = poli[i];
    if (Math.abs(cruz) < 1e-9) { saida.push([canto[0] + B.n[0] * d, canto[1] + B.n[1] * d]); continue; }
    const tt = ((B.p[0] - A.p[0]) * B.dir[1] - (B.p[1] - A.p[1]) * B.dir[0]) / cruz;
    const q = [A.p[0] + A.dir[0] * tt, A.p[1] + A.dir[1] * tt];
    if (Math.hypot(q[0] - canto[0], q[1] - canto[1]) > limite * d) {
      saida.push([canto[0] + A.n[0] * d, canto[1] + A.n[1] * d]);
      saida.push([canto[0] + B.n[0] * d, canto[1] + B.n[1] * d]);
    } else saida.push(q);
  }
  return saida;
}

/** Polígonos do contorno (unidades do logo): um por bloco, afastado `raio` com cantos em ponta; a união é a borda. */
export function poligonosDoContorno(t, raio) {
  const g = t.grade;
  const out = [];
  for (let l = 0; l < 10; l++) {
    for (let c = 0; c < g.colunas; c++) {
      if (!g.celulas[l * g.colunas + c]) continue;
      const casco = cascoConvexo(cantosDoBloco(t, l, c));
      let poli = deslocarComPonta(casco, raio);
      if (area(poli) < area(casco)) poli = deslocarComPonta([...casco].reverse(), raio);
      out.push(poli);
    }
  }
  return out;
}

export const DIST_FUGA_VANILLA = DIST_HORIZONTE_PADRAO;
