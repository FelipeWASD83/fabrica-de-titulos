// Exportação: imagem PNG do logo, pacote de recursos para o mod MC:INFINITO (camadas, posição e animação livres) e
// pacote sem mod (uma imagem parada no lugar do logo do jogo). O .zip é montado pelo servidor local.
// Resolução: 1,5 pixel por unidade do logo com superamostragem 3, a mesma da ferramenta do mod
// (6 pixels de tela por pixel de interface na escala 6).

import { respirar } from "./util.js";
import { retanguloDaCamada } from "./previa.js";

const ESCALA = 1.5;
const SS = 3;
const FORMATO_PACOTE = 34; // Minecraft 1.21.1

async function paraBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function texto64(txt) {
  return btoa(unescape(encodeURIComponent(txt)));
}

async function png(canvas) {
  return canvas.convertToBlob ? canvas.convertToBlob({ type: "image/png" }) : new Promise((ok) => canvas.toBlob(ok, "image/png"));
}

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function nomeDeArquivo(nome) {
  return (nome || "titulo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "titulo";
}

function animada(c) {
  return (c.animacao.cores && c.face.modo === "arco-iris") || (c.animacao.estrelas && c.lado.estrelas);
}

/** Uma camada de texto renderizada na resolução de exportação, numa fase da animação. */
function renderizarTexto(r, c, fase) {
  const p = r.preparar(c, ESCALA, SS);
  if (!p) return null;
  r.pintar(p, fase);
  const img = r.ler(p);
  const out = { img, janela: p.janela, W: p.W, H: p.H };
  r.liberar(p);
  return out;
}

function telaDe(img) {
  const t = new OffscreenCanvas(img.width, img.height);
  t.getContext("2d").putImageData(img, 0, 0);
  return t;
}

/**
 * Junta as camadas visíveis numa imagem só (fase 0). `ajuste(ret)` devolve onde desenhar cada retângulo do logo
 * na tela de saída. Devolve o canvas.
 */
async function compor(projeto, r, texturas, largura, altura, ajuste, progresso) {
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const visiveis = projeto.camadas.filter((c) => c.visivel);
  for (let i = 0; i < visiveis.length; i++) {
    const c = visiveis[i];
    progresso?.(`Desenhando ${c.nome}`, i / visiveis.length);
    await respirar();
    if (c.tipo === "vanilla") {
      const tx = texturas[c.qual === "minecraft" ? "minecraft" : "edition"];
      if (!tx) continue;
      const [sw, sh] = c.qual === "minecraft" ? [tx.img.width, tx.img.width * 44 / 256] : [tx.img.width, tx.img.width * 14 / 128];
      const d = ajuste({ x: c.x, y: c.y, largura: c.largura, altura: c.altura });
      ctx.drawImage(tx.img, 0, 0, sw, sh, d.x, d.y, d.w, d.h);
    } else {
      const res = renderizarTexto(r, c, 0);
      if (!res) continue;
      const d = ajuste(res.janela);
      ctx.drawImage(telaDe(res.img), d.x, d.y, d.w, d.h);
    }
  }
  return tela;
}

function uniao(projeto) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of projeto.camadas) {
    if (!c.visivel) continue;
    const r = retanguloDaCamada(c);
    if (!r) continue;
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.largura); y1 = Math.max(y1, r.y + r.altura);
  }
  return x0 < Infinity ? { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 } : null;
}

async function zipar(nome, arquivos) {
  const resp = await fetch("/api/exportar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arquivos }),
  });
  if (!resp.ok) throw new Error((await resp.json()).erro || "o servidor não montou o pacote");
  baixar(await resp.blob(), nome);
}

export async function exportarPng(projeto, r, texturas, progresso) {
  const u = uniao(projeto);
  if (!u) throw new Error("Nenhuma camada visível.");
  const tela = await compor(projeto, r, texturas, Math.ceil(u.largura * ESCALA), Math.ceil(u.altura * ESCALA),
    (q) => ({ x: (q.x - u.x) * ESCALA, y: (q.y - u.y) * ESCALA, w: q.largura * ESCALA, h: q.altura * ESCALA }), progresso);
  baixar(await png(tela), `${nomeDeArquivo(projeto.nome)}.png`);
  return "PNG salvo na pasta de downloads.";
}

/** Pacote de recursos que troca o titulo.json do mod MC:INFINITO (1.2.0 ou mais novo). */
export async function exportarParaMod(projeto, r, texturas, progresso) {
  const arquivos = {};
  const camadas = [];
  const quadros = Number(projeto.global.quadros) || 48;
  const textos = projeto.camadas.filter((c) => c.visivel && c.tipo === "texto");
  let feitos = 0;
  const total = textos.reduce((s, c) => s + (animada(c) ? quadros : 1), 0) || 1;
  for (const [i, c] of projeto.camadas.entries()) {
    if (!c.visivel) continue;
    if (c.tipo === "vanilla") {
      camadas.push({ vanilla: c.qual, x: Math.round(c.x), y: Math.round(c.y), largura: Math.round(c.largura), altura: Math.round(c.altura) });
      continue;
    }
    const base = `camada${i + 1}`;
    const n = animada(c) ? quadros : 1;
    let janela = null, W = 0, H = 0;
    const p = r.preparar(c, ESCALA, SS);
    if (!p) continue;
    try {
      for (let q = 0; q < n; q++) {
        progresso?.(`${c.nome}: quadro ${q + 1} de ${n}`, feitos / total);
        if (q % 4 === 0) await respirar();
        r.pintar(p, q / n);
        const img = r.ler(p);
        const caminho = `assets/titulo_infinito/textures/gui/pacote/${base}${n > 1 ? `_${String(q).padStart(2, "0")}` : ""}.png`;
        arquivos[caminho] = await paraBase64(await png(telaDe(img)));
        arquivos[`${caminho}.mcmeta`] = texto64('{"texture": {"blur": true}}\n');
        feitos += 1;
      }
      ({ janela } = p);
      ({ W, H } = p);
    } finally {
      r.liberar(p);
    }
    camadas.push({
      textura: `titulo_infinito:textures/gui/pacote/${base}`, quadros: n,
      x: janela.x, y: janela.y, largura: janela.largura, altura: janela.altura, pixels: [W, H],
    });
  }
  if (!camadas.length) throw new Error("Nenhuma camada visível.");
  const titulo = {
    formato: 1,
    deslocamentoY: Math.round(projeto.global.deslocamentoY),
    splash: [Math.round(projeto.global.splashX), Math.round(projeto.global.splashY)],
    camadas,
  };
  arquivos["assets/titulo_infinito/titulo.json"] = texto64(JSON.stringify(titulo, null, 2) + "\n");
  arquivos["pack.mcmeta"] = texto64(JSON.stringify({
    pack: { pack_format: FORMATO_PACOTE, description: `§d${projeto.nome} §7(título do MC:INFINITO)` },
  }, null, 2) + "\n");
  progresso?.("Montando a capa do pacote", 0.98);
  arquivos["pack.png"] = await paraBase64(await png(await capa(projeto, r, texturas)));
  progresso?.("Montando o .zip", 1);
  await zipar(`${nomeDeArquivo(projeto.nome)}-mod.zip`, arquivos);
  return "Pacote salvo. Ponha o .zip na pasta resourcepacks da instância e ative em Opções > Pacotes de recursos (precisa do mod MC:INFINITO 1.2.0 ou mais novo).";
}

async function capa(projeto, r, texturas) {
  const u = uniao(projeto);
  const s = 256 / Math.max(u.largura, u.altura);
  return compor(projeto, r, texturas, 256, 256,
    (q) => ({ x: (q.x - u.x) * s + (256 - u.largura * s) / 2, y: (q.y - u.y) * s + (256 - u.altura * s) / 2, w: q.largura * s, h: q.altura * s }));
}

/**
 * Pacote sem mod: o jogo só desenha a faixa de cima do minecraft.png (256 x 44 de interface), então tudo vai
 * espremido nela. Devolve o aviso de quanto encolheu, se encolheu.
 */
export async function exportarSemMod(projeto, r, texturas, progresso) {
  const u = uniao(projeto);
  if (!u) throw new Error("Nenhuma camada visível.");
  const PX = 2;                                      // 2048 x 512: o dobro do minecraft.png do jogo
  const cabe = u.x >= 0 && u.y >= 0 && u.x + u.largura <= 1024 && u.y + u.altura <= 176;
  const s = cabe ? 1 : Math.min(1024 / u.largura, 176 / u.altura);
  const dx = cabe ? 0 : (1024 - u.largura * s) / 2 - u.x * s;
  const dy = cabe ? 0 : (176 - u.altura * s) / 2 - u.y * s;
  const tela = await compor(projeto, r, texturas, 1024 * PX, 256 * PX,
    (q) => ({ x: (q.x * s + dx) * PX, y: (q.y * s + dy) * PX, w: q.largura * s * PX, h: q.altura * s * PX }), progresso);
  const logo = await paraBase64(await png(tela));
  const telaVazia = new OffscreenCanvas(512, 64);
  telaVazia.getContext("2d");                        // sem contexto o navegador não converte em PNG
  const vazia = await paraBase64(await png(telaVazia));
  const meta = texto64('{"texture": {"blur": true}}\n');
  const pasta = "assets/minecraft/textures/gui/title";
  const arquivos = {
    [`${pasta}/minecraft.png`]: logo, [`${pasta}/minecraft.png.mcmeta`]: meta,
    [`${pasta}/minceraft.png`]: logo, [`${pasta}/minceraft.png.mcmeta`]: meta,
    // o "JAVA EDITION" do jogo cairia em cima do logo novo; se ele estiver no projeto, já veio dentro da imagem
    [`${pasta}/edition.png`]: vazia, [`${pasta}/edition.png.mcmeta`]: meta,
    "pack.mcmeta": texto64(JSON.stringify({ pack: { pack_format: FORMATO_PACOTE, description: `§d${projeto.nome} §7(título, sem mod)` } }, null, 2) + "\n"),
    "pack.png": await paraBase64(await png(await capa(projeto, r, texturas))),
  };
  progresso?.("Montando o .zip", 1);
  await zipar(`${nomeDeArquivo(projeto.nome)}-sem-mod.zip`, arquivos);
  const partes = ["Pacote salvo. Ponha o .zip na pasta resourcepacks e ative em Opções > Pacotes de recursos. Sem o mod ele não anima e fica no lugar do logo do jogo."];
  if (!cabe) partes.push(`O logo não cabia na faixa do jogo e foi reduzido a ${Math.round(s * 100)}%.`);
  if (projeto.camadas.some((c) => c.visivel && c.tipo === "vanilla")) {
    partes.push("As camadas do jogo entraram dentro da imagem.");
  }
  return partes.join(" ");
}
