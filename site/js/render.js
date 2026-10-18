// Renderizador WebGL2 dos textos 3D. Três passes por texto:
//   geometria  lança um raio por pixel (superamostrado) e grava qual face acertou e onde (só quando a forma muda)
//   cor        pinta com as cores, rachaduras, estrelas e a fase da animação (a cada quadro; é barato)
//   redução    tira a média dos subpixels para a resolução final, com alfa pré-multiplicado
// Mesma conta da ferramenta titulo-infinito/ferramentas/render_infinito.py.

import { ALTURA, UNID, DZ, montarTexto, janela, poligonosDoContorno } from "./camera.js";
import { FONTE } from "./fonte.js";
import { criarAleatorio, hexParaRgb } from "./util.js";

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const GEO = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D grade;
uniform int ncol;
uniform float xEsq, zPerto, k, esp;
uniform float cx, cy, foco, sen, cs;
uniform vec2 origem;      // canto da janela, em unidades do logo
uniform float escala;     // pixels por unidade do logo (já superamostrado)
uniform float altura;     // altura da janela em pixels
uniform bool baixo;
uniform float linha;
out vec4 saida;
const float H = ${ALTURA.toFixed(4)};
const float U = ${UNID.toFixed(6)};
const float DZ = ${DZ.toFixed(6)};
const int PASSOS = 160;

bool dentro(float X, float Z) {
  float c = floor((X - xEsq) / (k * U));
  float l = 9.0 - floor((Z - zPerto) / (k * DZ));
  if (c < 0.0 || c >= float(ncol) || l < 0.0 || l > 9.0) return false;
  return texelFetch(grade, ivec2(int(c), int(l)), 0).r > 0u;
}

void main() {
  // pixel da imagem final (y para baixo) -> coordenadas do logo -> imagem sem virar
  vec2 px = vec2(gl_FragCoord.x, altura - gl_FragCoord.y);
  float x = origem.x + px.x / escala;
  float y = origem.y + px.y / escala;
  if (baixo) y = 2.0 * linha - y;
  float A = (x - cx) / foco, B = (y - cy) / foco;
  vec3 d = vec3(A, -sen - B * cs, cs - B * sen);
  saida = vec4(0.0);
  if (d.y >= 0.0) return;
  float tTopo = -H / d.y, tBase = (-H - esp) / d.y;
  float Za = 0.0;
  for (int j = 0; j <= PASSOS; j++) {
    float t = tTopo + (tBase - tTopo) * float(j) / float(PASSOS);
    float X = t * d.x, Z = t * d.z;
    if (dentro(X, Z)) {
      float fx = (X - xEsq) / (k * U);
      float fy = 10.0 - (Z - zPerto) / (k * DZ);
      if (j == 0) {
        float borda = dentro(X, Z - 0.22 * k) ? 0.0 : 4.0;
        saida = vec4(fx, fy, 0.0, 1.0 + borda);
      } else {
        float v = (-H - t * d.y) / esp;
        float tipo = dentro(X, Za) ? 3.0 : 2.0;
        saida = vec4(fx, fy, v, tipo);
      }
      return;
    }
    Za = Z;
  }
}`;

const COR = `#version 300 es
precision highp float;
uniform sampler2D geo;
uniform sampler2D contorno;
uniform sampler2D racha;
uniform vec2 tamRacha;    // colunas e linhas da grade da fonte
uniform float ncol;
uniform float fase, faseEstrelas;
uniform int modoFace, modoLado;  // face: 0 sólida, 1 degradê, 2 arco-íris; lado: 0 sólida, 1 degradê, 2 cósmica
uniform vec3 face1, face2, lado1, lado2, paredes, corContorno;
uniform float luz, quina, saturacao;
uniform bool estrelas, rachar;
uniform float densidade;
uniform float ss;          // superamostragem
in vec2 uv;
out vec4 saida;

vec3 hsv(float h, float s, float v) {
  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
  return v - v * s * clamp(min(k, 4.0 - k), 0.0, 1.0);
}

vec3 arcoIris(float t, float prof) {
  float m = mod(0.98 - t * 1.13 - fase, 1.0);
  vec3 c = hsv(m, clamp((0.52 + 0.24 * prof) * saturacao, 0.0, 1.0), 1.0 - 0.10 * prof);
  return c;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// estrelas em cruz, numa grade de células de 16 pixels da imagem final; cada uma pisca no próprio ritmo
float brilhoEstrelas(vec2 p) {
  float b = 0.0;
  vec2 cel = floor(p / 16.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 c = cel + vec2(float(i), float(j));
      float h = hash(c);
      if (h > 0.55 * densidade) continue;
      vec2 centro = floor(c * 16.0 + vec2(hash(c + 1.7), hash(c + 3.1)) * 16.0) + 0.5;
      float tam = floor(1.0 + hash(c + 5.3) * 3.0);
      float freq = floor(1.0 + hash(c + 7.9) * 3.0);
      float f = 0.55 + 0.45 * sin(6.2831853 * (freq * faseEstrelas + hash(c + 9.1)));
      vec2 d = abs(floor(p) + 0.5 - centro);
      float braco = 0.0;
      if (d.y < 0.5 && d.x <= tam) braco = pow(1.0 - d.x / (tam + 1.0), 0.7);
      if (d.x < 0.5 && d.y <= tam) braco = max(braco, pow(1.0 - d.y / (tam + 1.0), 0.7));
      b = max(b, f * braco);
    }
  }
  return b;
}

void main() {
  vec4 g = texture(geo, uv);
  float tipoBorda = g.a;
  float borda = tipoBorda >= 4.5 ? 1.0 : 0.0;
  float tipo = tipoBorda - borda * 4.0;
  float aC = texture(contorno, uv).r;
  if (tipo < 0.5) { saida = vec4(corContorno * aC, aC); return; }
  float t = clamp(g.r / ncol, 0.0, 1.0);
  float prof = clamp(g.g / 10.0, 0.0, 1.0);
  vec3 c;
  if (tipo < 1.5) {
    if (modoFace == 2) c = arcoIris(t, prof);
    else if (modoFace == 1) c = mix(face1, face2, prof);
    else c = face1;
    c += (1.0 - c) * pow(1.0 - prof, 2.0) * luz;
    if (borda > 0.5) c += (1.0 - c) * quina;
    if (rachar) {
      vec2 r = texture(racha, vec2(g.r / tamRacha.x, g.g / tamRacha.y)).rg;
      c = c * (1.0 - 0.38 * r.r) + (1.0 - c) * 0.4 * r.g;
    }
  } else if (tipo < 2.5) {
    float v = clamp(g.b, 0.0, 1.0);
    if (modoLado == 2) {
      vec3 tinta = modoFace == 2 ? arcoIris(t, 0.5) : mix(face1, face2, 0.5);
      c = mix(lado1, lado2, v) + 0.12 * tinta;
    } else if (modoLado == 1) c = mix(lado1, lado2, v);
    else c = lado1;
    if (estrelas) {
      float b = brilhoEstrelas(gl_FragCoord.xy / ss);
      c += (1.0 - c) * b;
    }
  } else {
    c = paredes;
  }
  saida = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// média dos subpixels, com alfa pré-multiplicado (a cor é multiplicada pelo alfa antes de somar)
const REDUZ = `#version 300 es
precision highp float;
uniform sampler2D cor;
uniform int ss;
out vec4 saida;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * ss;
  vec4 s = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= ss) break;
    for (int j = 0; j < 8; j++) {
      if (j >= ss) break;
      vec4 c = texelFetch(cor, base + ivec2(i, j), 0);
      s += vec4(c.rgb * c.a, c.a);
    }
  }
  saida = s / float(ss * ss);
}`;

function compilar(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [tipo, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nome = gl.getActiveUniform(prog, i).name;
    u[nome] = gl.getUniformLocation(prog, nome);
  }
  return { prog, u };
}

function textura(gl, w, h, interno, formato, tipo, dados = null, filtro = gl.NEAREST) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, interno, w, h, 0, formato, tipo, dados);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function alvo(gl, tex) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fb;
}

/** Rachaduras finas no topo, desenhadas na grade da fonte (a perspectiva vem de graça). Canal R escuro, G claro. */
function texturaDeRachaduras(texto, grade, quantidade, semente) {
  const R = 24;
  const w = grade.colunas * R, h = 10 * R;
  const tela = new OffscreenCanvas(w, h);
  const ctx = tela.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const rnd = criarAleatorio(semente);
  const linhas = (cor, pts, larg, dy) => {
    ctx.strokeStyle = cor;
    ctx.lineWidth = larg;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
    ctx.stroke();
  };
  const cel = (l, c) => grade.celulas[l * grade.colunas + c];
  let col = 0;
  for (const ch of grade.letras) {
    const larg = FONTE[ch][0].length;
    if (ch !== " ") {
      const n = larg > 3 ? quantidade : Math.max(0, quantidade - 1);
      for (let i = 0; i < n; i++) {
        const r = [2, 4, 6, 8][Math.floor(rnd() * 4)];
        const c0 = col + Math.floor(rnd() * Math.max(1, larg - 1));
        const c1 = Math.min(col + larg, c0 + 1 + Math.floor(rnd() * 3));
        if (!cel(r - 1, c0) || !cel(Math.min(r, 9), c0)) continue;
        const y = r * R;
        const pts = [[c0 * R + 4, y], [c1 * R - 4, y], [c1 * R - 4, y + (rnd() < 0.5 ? R / 2 : R)]];
        // a clara primeiro: onde as duas se cruzam, a escura por cima apaga a clara
        linhas("#0f0", pts, 2, 3);
        linhas("#f00", pts, 3, 0);
      }
    }
    col += larg + 1;
  }
  // só dentro dos blocos, longe da beirada
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = true;
      for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        const cx = Math.floor((x + dx) / R), cy = Math.floor((y + dy) / R);
        if (cx < 0 || cy < 0 || cx >= grade.colunas || cy >= 10 || !cel(cy, cx)) { ok = false; break; }
      }
      const i = (y * w + x) * 4;
      if (!ok) { d[i] = 0; d[i + 1] = 0; }
      if (d[i] > 0) d[i + 1] = Math.round(d[i + 1] * (1 - d[i] / 255));
      d[i + 2] = 0; d[i + 3] = 255;
    }
  }
  return { dados: d, w, h };
}

export class Renderizador {
  constructor(gl) {
    this.gl = gl;
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("WebGL2 sem EXT_color_buffer_float");
    this.pGeo = compilar(gl, VERT, GEO);
    this.pCor = compilar(gl, VERT, COR);
    this.pReduz = compilar(gl, VERT, REDUZ);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /**
   * Prepara um texto: monta a geometria, lança os raios e desenha o contorno. Devolve um objeto que `pintar`
   * usa a cada quadro. `escala` = pixels finais por unidade do logo; `ss` = superamostragem.
   */
  preparar(camada, escala, ss) {
    const gl = this.gl;
    const t = montarTexto(camada);
    if (!t) return null;
    const j = janela(t, camada.contorno);
    const W = Math.max(1, Math.round(j.largura * escala)), H = Math.max(1, Math.round(j.altura * escala));
    const Ws = W * ss, Hs = H * ss;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (Ws > max || Hs > max) throw new Error(`texto grande demais para a placa (${Ws}x${Hs})`);

    // grade da fonte como textura inteira (1 byte por célula: sem o alinhamento 1, linha de largura ímpar quebra)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tGrade = textura(gl, t.grade.colunas, 10, gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE, t.grade.celulas);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    // passe de geometria
    const tGeo = textura(gl, Ws, Hs, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.LINEAR);
    // LINEAR em RGBA32F exige OES_texture_float_linear; sem ela, a busca no passe de cor cai no texel mais perto
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbGeo = alvo(gl, tGeo);
    gl.viewport(0, 0, Ws, Hs);
    const { prog, u } = this.pGeo;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tGrade);
    gl.uniform1i(u.grade, 0);
    gl.uniform1i(u.ncol, t.grade.colunas);
    gl.uniform1f(u.xEsq, t.xEsq);
    gl.uniform1f(u.zPerto, t.zPerto);
    gl.uniform1f(u.k, t.k);
    gl.uniform1f(u.esp, t.espessura);
    gl.uniform1f(u.cx, t.cam.cx);
    gl.uniform1f(u.cy, t.cam.cy);
    gl.uniform1f(u.foco, t.cam.foco);
    gl.uniform1f(u.sen, t.cam.sen);
    gl.uniform1f(u.cs, t.cam.cos);
    gl.uniform2f(u.origem, j.x, j.y);
    gl.uniform1f(u.escala, escala * ss);
    gl.uniform1f(u.altura, Hs);
    gl.uniform1i(u.baixo, t.baixo ? 1 : 0);
    gl.uniform1f(u.linha, t.linha);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // contorno: polígonos de cantos vivos desenhados num canvas 2D na resolução superamostrada
    const tela = new OffscreenCanvas(Ws, Hs);
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#fff";
    for (const poli of poligonosDoContorno(t, camada.contorno)) {
      ctx.beginPath();
      poli.forEach(([x, y], i) => {
        const px = (x - j.x) * escala * ss, py = (y - j.y) * escala * ss;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
    const tContorno = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tContorno);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tela);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);

    // rachaduras
    const r = texturaDeRachaduras(camada.texto, t.grade, camada.rachaduras.quantidade, camada.rachaduras.semente);
    const tRacha = textura(gl, r.w, r.h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(r.dados.buffer), gl.LINEAR);

    const tCor = textura(gl, Ws, Hs, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const fbCor = alvo(gl, tCor);
    const tFinal = textura(gl, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    const fbFinal = alvo(gl, tFinal);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tGrade);
    gl.deleteFramebuffer(fbGeo);
    return {
      camada, t, janela: j, W, H, ss, ncol: t.grade.colunas,
      tGeo, tContorno, tRacha, tCor, fbCor, tFinal, fbFinal,
    };
  }

  /** Pinta o texto preparado na fase da animação (0 a 1) e deixa o resultado em `p.tFinal`. */
  pintar(p, fase) {
    const gl = this.gl;
    const c = p.camada;
    const { prog, u } = this.pCor;
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.fbCor);
    gl.viewport(0, 0, p.W * p.ss, p.H * p.ss);
    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);
    const tex = [[p.tGeo, "geo"], [p.tContorno, "contorno"], [p.tRacha, "racha"]];
    tex.forEach(([t, nome], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u[nome], i);
    });
    const modo = { solida: 0, degrade: 1, "arco-iris": 2, cosmica: 2 };
    gl.uniform2f(u.tamRacha, p.ncol, 10);
    gl.uniform1f(u.ncol, p.ncol);
    gl.uniform1f(u.fase, c.animacao.cores ? fase : 0);
    gl.uniform1f(u.faseEstrelas, c.animacao.estrelas ? fase : 0);
    gl.uniform1i(u.modoFace, modo[c.face.modo] ?? 0);
    gl.uniform1i(u.modoLado, modo[c.lado.modo] ?? 0);
    gl.uniform3fv(u.face1, hexParaRgb(c.face.cor1));
    gl.uniform3fv(u.face2, hexParaRgb(c.face.cor2));
    gl.uniform3fv(u.lado1, hexParaRgb(c.lado.cor1));
    gl.uniform3fv(u.lado2, hexParaRgb(c.lado.cor2));
    gl.uniform3fv(u.paredes, hexParaRgb(c.paredes));
    gl.uniform3fv(u.corContorno, hexParaRgb(c.contornoCor));
    gl.uniform1f(u.luz, c.face.luz);
    gl.uniform1f(u.quina, c.face.quina);
    gl.uniform1f(u.saturacao, c.face.saturacao);
    gl.uniform1i(u.estrelas, c.lado.estrelas ? 1 : 0);
    gl.uniform1i(u.rachar, c.rachaduras.ligadas ? 1 : 0);
    gl.uniform1f(u.densidade, c.lado.densidade);
    gl.uniform1f(u.ss, p.ss);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const r = this.pReduz;
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.fbFinal);
    gl.viewport(0, 0, p.W, p.H);
    gl.useProgram(r.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.tCor);
    gl.uniform1i(r.u.cor, 0);
    gl.uniform1i(r.u.ss, p.ss);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, p.tFinal);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Lê o resultado final como ImageData sem pré-multiplicar (para salvar PNG). */
  ler(p) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.fbFinal);
    const px = new Uint8Array(p.W * p.H * 4);
    gl.readPixels(0, 0, p.W, p.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const out = new ImageData(p.W, p.H);
    for (let y = 0; y < p.H; y++) {
      const src = (p.H - 1 - y) * p.W * 4, dst = y * p.W * 4;
      for (let x = 0; x < p.W * 4; x += 4) {
        const a = px[src + x + 3];
        out.data[dst + x + 3] = a;
        for (let k = 0; k < 3; k++) out.data[dst + x + k] = a ? Math.min(255, Math.round((px[src + x + k] * 255) / a)) : 0;
      }
    }
    return out;
  }

  liberar(p) {
    if (!p) return;
    const gl = this.gl;
    for (const t of [p.tGeo, p.tContorno, p.tRacha, p.tCor, p.tFinal]) gl.deleteTexture(t);
    gl.deleteFramebuffer(p.fbCor);
    gl.deleteFramebuffer(p.fbFinal);
  }
}
