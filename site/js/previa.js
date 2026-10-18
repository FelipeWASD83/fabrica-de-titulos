// A prévia: a tela de título do jogo (panorama, logo, botões no layout do NeoForge, splash) desenhada na proporção
// da tela escolhida. O WebGL desenha o panorama e as camadas; por cima, em HTML, vão os botões, as guias e as caixas
// que dá para arrastar.

import { Renderizador } from "./render.js";
import { montarTexto, janela } from "./camera.js";

// tamanho de cada tela e a escala de interface que o jogo escolhe nela
export const TELAS = {
  janela: { w: 3440, h: 1353, gui: 5 },   // a janela do print dele (barra de título e de tarefas ocupando o resto)
  cheia: { w: 3440, h: 1440, gui: 6 },
  vertical: { w: 1080, h: 1920, gui: 3 },
};

const QUAD_VERT = `#version 300 es
in vec2 p;
uniform vec4 ret;    // x0, y0, x1, y1 em clip
uniform vec4 uvr;    // u0, vTopo, u1, vBase
out vec2 uv;
void main() {
  vec2 q = p * 0.5 + 0.5;            // 0..1, y para cima
  gl_Position = vec4(mix(ret.x, ret.z, q.x), mix(ret.w, ret.y, q.y), 0.0, 1.0);
  uv = vec2(mix(uvr.x, uvr.z, q.x), mix(uvr.w, uvr.y, q.y));
}`;
const QUAD_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform float alfa;
in vec2 uv;
out vec4 saida;
void main() { saida = texture(tex, uv) * alfa; }`;

function carregarImagem(url) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error(`não carregou ${url}`));
    img.src = url;
  });
}

/** Retângulo de uma camada em unidades do logo (o que a caixa de seleção mostra). */
export function retanguloDaCamada(c) {
  if (c.tipo === "vanilla") return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
  const t = montarTexto(c);
  return t ? janela(t, c.contorno) : null;
}

export function chaveDeGeometria(c) {
  return JSON.stringify([c.texto, c.fonte, c.vista, c.linha, c.centroX, c.coluna, c.alturaFace, c.espessura, c.distFuga,
    c.contorno, c.rachaduras.quantidade, c.rachaduras.semente]);
}

export class Previa {
  constructor({ moldura, canvas, sobre, aviso, aoSelecionar, aoArrastar, aoSoltar }) {
    Object.assign(this, { moldura, canvas, sobre, aviso, aoSelecionar, aoArrastar, aoSoltar });
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: false, antialias: false });
    if (!gl) throw new Error("Este navegador não tem WebGL2.");
    this.gl = gl;
    this.r = new Renderizador(gl);
    this.quad = this._programaQuad();
    this.preparados = new Map();     // id da camada -> {chave, escala, p}
    this.tela = "janela";
    this.vista = "tela";
    this.guias = true;
    this.animar = true;
    this.projeto = null;
    this.selecionada = null;
    this.texturas = {};
    this.sujo = true;
    this.quadrosMedidos = [];
    new ResizeObserver(() => { this.sujo = true; this.montarSobre(); }).observe(moldura);
  }

  async carregarTexturasDoJogo() {
    const gl = this.gl;
    for (const nome of ["minecraft", "edition", "panorama_0"]) {
      try {
        const img = await carregarImagem(`/api/vanilla/${nome}.png`);
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.texturas[nome] = { t, img };
      } catch (e) {
        console.warn(e.message);
      }
    }
    this.sujo = true;
    return Boolean(this.texturas.minecraft);
  }

  _programaQuad() {
    const gl = this.gl;
    const prog = gl.createProgram();
    for (const [tipo, src] of [[gl.VERTEX_SHADER, QUAD_VERT], [gl.FRAGMENT_SHADER, QUAD_FRAG]]) {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    const u = (n) => gl.getUniformLocation(prog, n);
    // um quadrado de -1 a 1 em dois triângulos
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { prog, vao, ret: u("ret"), uvr: u("uvr"), tex: u("tex"), alfa: u("alfa") };
  }

  // --- tela e enquadramento ---

  get gui() {
    const t = TELAS[this.tela];
    return { w: Math.floor(t.w / t.gui), h: Math.floor(t.h / t.gui), escala: t.gui };
  }

  /** Canto do logo na interface (pixels de interface). */
  origemDoLogo() {
    const g = this.gui;
    return { x: g.w / 2 - 128, y: 30 + (this.projeto?.global.deslocamentoY || 0) };
  }

  primeiroBotao() {
    return Math.floor(this.gui.h / 4) + 32 + (this.projeto?.global.botoes || 0);
  }

  /** Retângulo de uma camada em pixels de interface. */
  retanguloGui(c) {
    const r = retanguloDaCamada(c);
    if (!r) return null;
    const o = this.origemDoLogo();
    return { x: o.x + r.x / 4, y: o.y + r.y / 4, w: r.largura / 4, h: r.altura / 4 };
  }

  /** Quanto da interface aparece e em que escala (pixels da página por pixel de interface). */
  enquadramento() {
    const mw = this.moldura.clientWidth, mh = this.moldura.clientHeight;
    const g = this.gui;
    if (this.vista === "logo" && this.projeto) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of this.projeto.camadas) {
        if (!c.visivel) continue;
        const r = this.retanguloGui(c);
        if (!r) continue;
        x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
      }
      if (x0 < Infinity) {
        const m = 14;
        const s = Math.min(mw / (x1 - x0 + 2 * m), mh / (y1 - y0 + 2 * m));
        return { s, ox: (x0 + x1) / 2 - mw / (2 * s), oy: (y0 + y1) / 2 - mh / (2 * s), cw: mw, ch: mh, left: 0, top: 0 };
      }
    }
    const s = Math.min(mw / g.w, mh / g.h);
    const cw = g.w * s, ch = g.h * s;
    return { s, ox: 0, oy: 0, cw, ch, left: (mw - cw) / 2, top: (mh - ch) / 2 };
  }

  // --- estado ---

  definirProjeto(projeto) {
    this.projeto = projeto;
    this.sujo = true;
    this.montarSobre();
  }

  /** Prepara (ou reaproveita) o texto 3D de cada camada; refaz só o que mudou de forma ou de resolução. */
  _prepararCamadas(escala) {
    const vivos = new Set();
    for (const c of this.projeto.camadas) {
      if (c.tipo !== "texto") continue;
      vivos.add(c.id);
      const chave = chaveDeGeometria(c);
      const atual = this.preparados.get(c.id);
      if (atual && atual.chave === chave && Math.abs(atual.escala / escala - 1) < 0.3) {
        atual.p && (atual.p.camada = c);
        continue;
      }
      if (atual) this.r.liberar(atual.p);
      let p = null;
      try {
        p = this.r.preparar(c, escala, 2);
        this._erro = null;
      } catch (e) {
        this._erro = `${c.nome}: ${e.message}`;
      }
      this.preparados.set(c.id, { chave, escala, p, pintadoEm: -1 });
    }
    for (const [id, item] of this.preparados) {
      if (!vivos.has(id)) { this.r.liberar(item.p); this.preparados.delete(id); }
    }
  }

  animado(c) {
    return c.tipo === "texto" && c.visivel &&
      ((c.animacao.cores && c.face.modo === "arco-iris") || (c.animacao.estrelas && c.lado.estrelas));
  }

  /** Um quadro. Chamado pelo laço da página; só redesenha se mudou algo ou se tem animação. */
  quadro(agora) {
    if (!this.projeto) return;
    const temAnimacao = this.animar && this.projeto.camadas.some((c) => this.animado(c));
    if (!this.sujo && !temAnimacao) return;
    const gl = this.gl;
    const e = this.enquadramento();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(e.cw * dpr)), H = Math.max(1, Math.round(e.ch * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W; this.canvas.height = H;
    }
    Object.assign(this.canvas.style, { width: `${e.cw}px`, height: `${e.ch}px`, left: `${e.left}px`, top: `${e.top}px` });
    // resolução do texto: o que a tela mostra, com folga, entre 0,75 e 3 pixels por unidade do logo
    const escala = Math.min(3, Math.max(0.75, (e.s * dpr / 4) * 1.25));
    this._prepararCamadas(escala);
    const fase = this.animar ? ((agora / 1000) / this.projeto.global.segundosPorVolta) % 1 : 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.05, 0.055, 0.063, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const g = this.gui;
    const paraClip = (x, y) => [((x - e.ox) * e.s / e.cw) * 2 - 1, 1 - ((y - e.oy) * e.s / e.ch) * 2];
    // retângulo em pixels de interface; uv = [u0, vTopo, u1, vBase]
    const quadro = (tex, x, y, w, h, uv, alfa) => {
      const [x0, y0] = paraClip(x, y), [x1, y1] = paraClip(x + w, y + h);
      gl.useProgram(this.quad.prog);
      gl.bindVertexArray(this.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.quad.tex, 0);
      gl.uniform1f(this.quad.alfa, alfa);
      gl.uniform4f(this.quad.ret, x0, y0, x1, y1);
      gl.uniform4f(this.quad.uvr, ...uv);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    // panorama cobrindo a tela inteira
    const pano = this.texturas.panorama_0;
    if (pano) {
      const asp = g.w / g.h;
      const uv = asp >= 1 ? [0, 0.5 - 0.5 / asp, 1, 0.5 + 0.5 / asp] : [0.5 - 0.5 * asp, 0, 0.5 + 0.5 * asp, 1];
      quadro(pano.t, 0, 0, g.w, g.h, uv, 1);
    }
    const o = this.origemDoLogo();
    for (const c of this.projeto.camadas) {
      if (!c.visivel) continue;
      if (c.tipo === "vanilla") {
        const tx = this.texturas[c.qual === "minecraft" ? "minecraft" : "edition"];
        if (!tx) continue;
        const uv = c.qual === "minecraft" ? [0, 0, 1, 44 / 64] : [0, 0, 1, 14 / 16];
        quadro(tx.t, o.x + c.x / 4, o.y + c.y / 4, c.largura / 4, c.altura / 4, uv, 1);
        continue;
      }
      const item = this.preparados.get(c.id);
      if (!item || !item.p) continue;
      if (this.animado(c) || item.pintadoEm !== this._versao) {
        this.r.pintar(item.p, fase);
        item.pintadoEm = this._versao;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const j = item.p.janela;
      quadro(item.p.tFinal, o.x + j.x / 4, o.y + j.y / 4, j.largura / 4, j.altura / 4, [0, 1, 1, 0], 1);
    }
    gl.disable(gl.BLEND);
    this.sujo = false;
    this._medir(agora, temAnimacao);
    this._mostrarErro();
  }

  /** Marca que as cores mudaram (repinta sem refazer a forma). */
  repintar() {
    this._versao = (this._versao || 0) + 1;
    this.sujo = true;
  }

  _medir(agora, animando) {
    if (!animando) { this.qps = null; return; }
    const q = this.quadrosMedidos;
    q.push(agora);
    while (q.length && agora - q[0] > 2000) q.shift();
    if (q.length > 5) {
      const intervalos = q.slice(1).map((t, i) => t - q[i]).sort((a, b) => a - b);
      this.qps = Math.round(1000 / intervalos[Math.floor(intervalos.length / 2)]);
    }
  }

  _mostrarErro() {
    const msgs = [];
    if (this._erro) msgs.push(this._erro);
    for (const c of this.projeto.camadas) {
      if (c.tipo !== "texto" || !c.visivel) continue;
      const t = montarTexto(c);
      if (t?.avisos.length) msgs.push(`${c.nome}: ${t.avisos.join("; ")}. Aumente a largura da letra ou a força, ou use o Tamanho geral.`);
    }
    if (!this.texturas.minecraft) msgs.push("Não achei as texturas do jogo (o Prism baixou o Minecraft 1.21.1?). As camadas do jogo e o panorama não aparecem.");
    const limite = this.primeiroBotao();
    let fundo = -Infinity;
    for (const c of this.projeto.camadas) {
      if (!c.visivel) continue;
      const r = this.retanguloGui(c);
      if (r) fundo = Math.max(fundo, r.y + r.h);
    }
    // o contorno tem 3 unidades de folga na janela; não conta como encostar
    if (fundo - 1 > limite) msgs.push(`O logo passa ${Math.round(fundo - limite)} px da linha do primeiro botão nesta tela. Suba o título ou desça os botões (Título inteiro).`);
    this.aviso.hidden = !msgs.length;
    this.aviso.textContent = msgs.join(" ");
  }

  // --- o que vai por cima: botões, splash, guias e caixas ---

  montarSobre() {
    if (!this.projeto) return;
    const e = this.enquadramento();
    const g = this.gui;
    const s = e.s;
    const sobre = this.sobre;
    sobre.innerHTML = "";
    const px = (x, y) => [e.left + (x - e.ox) * s, e.top + (y - e.oy) * s];
    const el = (cls, x, y, w, h, texto = "") => {
      const d = document.createElement("div");
      d.className = cls;
      const [l, t] = px(x, y);
      Object.assign(d.style, { left: `${l}px`, top: `${t}px`, width: `${w * s}px`, height: `${h * s}px` });
      d.textContent = texto;
      sobre.appendChild(d);
      return d;
    };
    // botões no layout do NeoForge 1.21.1 (TitleScreen.init): o bloco começa em altura/4 + 32
    const l = this.primeiroBotao();
    const fonte = `${Math.max(7, 8 * s)}px`;
    const botoes = [
      ["Um jogador", g.w / 2 - 100, l, 200], ["Multijogador", g.w / 2 - 100, l + 24, 200],
      ["Minecraft Realms", g.w / 2 - 100, l + 48, 200], ["Mods", g.w / 2 - 100, l + 72, 200],
      ["Opções...", g.w / 2 - 100, l + 22 + 84, 98], ["Sair do jogo", g.w / 2 + 2, l + 22 + 84, 98],
      ["", g.w / 2 - 124, l + 22 + 84, 20], ["", g.w / 2 + 104, l + 22 + 84, 20],
    ];
    for (const [texto, x, y, w] of botoes) el("mc-botao", x, y, w, 20, texto).style.fontSize = fonte;
    const fonteCanto = `${Math.max(6, 7 * s)}px`;
    el("mc-texto", 2, g.h - 10, 120, 10, "Minecraft 1.21.1").style.fontSize = fonteCanto;
    const cr = el("mc-texto", g.w - 302, g.h - 10, 300, 10, "Direitos autorais da Mojang AB. Não distribua!");
    Object.assign(cr.style, { fontSize: fonteCanto, textAlign: "right" });
    // splash no lugar que o mod usa (âncora em unidades do logo)
    const o = this.origemDoLogo();
    const sp = document.createElement("div");
    sp.className = "splash";
    sp.textContent = "Mais quente que o sol!";
    const [sx, sy] = px(o.x + this.projeto.global.splashX / 4, o.y + this.projeto.global.splashY / 4);
    Object.assign(sp.style, { left: `${sx}px`, top: `${sy}px`, fontSize: `${10 * s}px`, transform: "translate(-50%, -50%) rotate(-20deg)" });
    sobre.appendChild(sp);
    if (this.guias) {
      const guia = (cls, y, texto) => {
        const d = document.createElement("div");
        d.className = `guia ${cls}`;
        d.style.top = `${px(0, y)[1]}px`;
        const sp2 = document.createElement("span");
        sp2.textContent = texto;
        d.appendChild(sp2);
        sobre.appendChild(d);
      };
      guia("guia-vanilla", 30 + 44, "fim da faixa do logo sem mod (y 74)");
      guia("guia-botao", l, `primeiro botão (y ${l})`);
    }
    // caixas das camadas, para selecionar e arrastar (a de cima no fim, para ficar por cima)
    for (const c of this.projeto.camadas) {
      if (!c.visivel) continue;
      const r = this.retanguloGui(c);
      if (!r) continue;
      const cx = el("caixa", r.x, r.y, r.w, r.h);
      cx.dataset.id = c.id;
      if (c.id === this.selecionada) cx.classList.add("selecionada");
      const et = document.createElement("span");
      et.className = "etiqueta";
      et.textContent = c.nome;
      const alca = document.createElement("span");
      alca.className = "alca";
      cx.append(et, alca);
      cx.addEventListener("pointerdown", (ev) => this._comecarArrasto(ev, c, ev.target === alca ? "escala" : "mover", r));
    }
  }

  _comecarArrasto(ev, camada, modo, ret) {
    ev.preventDefault();
    ev.stopPropagation();
    this.aoSelecionar(camada.id);
    const s = this.enquadramento().s;
    const x0 = ev.clientX, y0 = ev.clientY;
    let ultimo = { du: 0, dv: 0, fator: 1 };
    const mover = (e2) => {
      const dx = (e2.clientX - x0) / s, dy = (e2.clientY - y0) / s;     // pixels de interface
      if (modo === "mover") {
        const du = Math.round(dx * 4), dv = Math.round(dy * 4);         // unidades do logo
        if (du !== ultimo.du || dv !== ultimo.dv) {
          this.aoArrastar(camada.id, { modo, du: du - ultimo.du, dv: dv - ultimo.dv });
          ultimo = { ...ultimo, du, dv };
        }
      } else {
        const fator = Math.max(0.1, (ret.w + dx) / ret.w);
        if (Math.abs(fator - ultimo.fator) > 0.004) {
          this.aoArrastar(camada.id, { modo, fator: fator / ultimo.fator, topoGui: ret.y });
          ultimo = { ...ultimo, fator };
        }
      }
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      this.aoSoltar();
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /** Para exportar: o mesmo renderizador, numa resolução própria. */
  get renderizador() {
    return this.r;
  }
}
