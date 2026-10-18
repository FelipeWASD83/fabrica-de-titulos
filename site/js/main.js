// Liga a página: projeto aberto, prévia, painel, arrasto, salvar, abrir e exportar.

import { Previa, retanguloDaCamada } from "./previa.js";
import { Painel } from "./painel.js";
import { projetoPadrao, completarProjeto, camadaDeTexto, camadaVanilla, PRESET_INFINITO, PRESET_CIMA } from "./estado.js";
import * as projetos from "./projetos.js";
import { exportarPng, exportarParaMod, exportarSemMod } from "./exportar.js";

const $ = (id) => document.getElementById(id);

let projeto = completarProjeto(projetos.lerLocal() || projetoPadrao());
let selecionada = projeto.camadas[0]?.id || null;
let pendente = { forma: false, cor: false, lista: false, tela: false };
let alteradoDesdeSalvar = false;

const previa = new Previa({
  moldura: $("moldura"), canvas: $("previa"), sobre: $("sobre"), aviso: $("aviso"),
  aoSelecionar: (id) => selecionar(id),
  aoArrastar: (id, mov) => arrastar(id, mov),
  aoSoltar: () => mudou("forma"),
});
const painel = new Painel({
  lista: $("listaCamadas"), propriedades: $("propriedades"), globais: $("propsGlobais"),
  mudou: (tipo, id) => (tipo === "selecao" ? selecionar(id) : mudou(tipo, id)),
});

function selecionar(id) {
  if (id === selecionada) return;
  selecionada = id;
  previa.selecionada = id;
  painel.definir(projeto, id);
  pendente.tela = true;
}

/** Junta as mudanças e aplica no próximo quadro (o arrasto manda dezenas por segundo). */
function mudou(tipo, id) {
  if (tipo === "lista" && id !== undefined) selecionada = id;
  if (tipo !== "nada") pendente[tipo] = true;
  alteradoDesdeSalvar = true;
  agendarAutossalvar();
}

let relogio = null;
function agendarAutossalvar() {
  clearTimeout(relogio);
  relogio = setTimeout(() => projetos.guardarLocal(projeto), 400);
  $("estadoSalvo").textContent = "alterado";
}

function aplicarPendentes() {
  if (pendente.lista) {
    painel.definir(projeto, selecionada);
    previa.selecionada = selecionada;
  }
  if (pendente.forma || pendente.lista || pendente.tela) {
    previa.sujo = true;
    previa.montarSobre();
  }
  if (pendente.cor || pendente.forma) previa.repintar();
  pendente = { forma: false, cor: false, lista: false, tela: false };
}

function arrastar(id, mov) {
  const c = projeto.camadas.find((x) => x.id === id);
  if (!c) return;
  if (mov.modo === "mover") {
    if (c.tipo === "texto") { c.centroX += mov.du; c.linha += mov.dv; }
    else { c.x += mov.du; c.y += mov.dv; }
  } else {
    const f = mov.fator;
    if (c.tipo === "texto") {
      // cresce a partir do topo da caixa: a borda de perto se afasta do topo na mesma proporção
      const r = retanguloDaCamada(c);
      const topo = r ? r.y : c.linha;
      c.coluna *= f; c.alturaFace *= f; c.espessura *= f; c.contorno *= f; c.distFuga *= f;
      c.linha = topo + (c.linha - topo) * f;
    } else {
      c.largura *= f; c.altura *= f;
    }
  }
  pendente.forma = true;
  alteradoDesdeSalvar = true;
}

function laco(agora) {
  aplicarPendentes();
  previa.quadro(agora);
  $("qps").textContent = previa.qps ? `${previa.qps} qps` : "";
  requestAnimationFrame(laco);
}

function abrirProjeto(p) {
  projeto = completarProjeto(p);
  selecionada = projeto.camadas[0]?.id || null;
  previa.selecionada = selecionada;
  previa.definirProjeto(projeto);
  painel.definir(projeto, selecionada);
  $("nomeProjeto").value = projeto.nome;
  projetos.guardarLocal(projeto);
  alteradoDesdeSalvar = false;
  $("estadoSalvo").textContent = "";
  previa.repintar();
}

// --- barra de cima ---

$("nomeProjeto").addEventListener("input", (e) => { projeto.nome = e.target.value; agendarAutossalvar(); });

$("btNovo").addEventListener("click", () => {
  if (alteradoDesdeSalvar && !confirm("Começar um título novo? O que não foi salvo como projeto fica só no autossalvamento.")) return;
  abrirProjeto(projetoPadrao());
});

$("btSalvar").addEventListener("click", async () => {
  try {
    const nome = await projetos.salvar(projeto);
    alteradoDesdeSalvar = false;
    $("estadoSalvo").textContent = `salvo como "${nome}"`;
  } catch (e) {
    alert(`Não salvou: ${e.message}`);
  }
});

$("btProjetos").addEventListener("click", async () => {
  const ul = $("listaProjetos");
  ul.innerHTML = "";
  let lista = [];
  try { lista = await projetos.listar(); } catch (e) { alert(e.message); return; }
  if (!lista.length) ul.innerHTML = '<li class="vazio">Nenhum projeto salvo ainda. Use "Salvar".</li>';
  for (const item of lista) {
    const li = document.createElement("li");
    const nome = document.createElement("span");
    nome.className = "nome";
    nome.textContent = item.nome;
    const data = document.createElement("span");
    data.className = "rotulo-mono";
    data.textContent = new Date(item.alterado).toLocaleString("pt-BR");
    const apagar = document.createElement("button");
    apagar.className = "bt bt-pequeno";
    apagar.type = "button";
    apagar.textContent = "Apagar";
    nome.addEventListener("click", async () => {
      try { abrirProjeto(await projetos.abrir(item.nome)); $("dlgProjetos").close(); } catch (e) { alert(e.message); }
    });
    apagar.addEventListener("click", async () => {
      if (!confirm(`Apagar o projeto "${item.nome}"? Não dá para desfazer.`)) return;
      try { await projetos.apagar(item.nome); li.remove(); } catch (e) { alert(e.message); }
    });
    li.append(nome, data, apagar);
    ul.appendChild(li);
  }
  $("dlgProjetos").showModal();
});

const menu = $("menuExportar");
$("btExportar").addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
document.addEventListener("click", () => { menu.hidden = true; });
menu.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
  menu.hidden = true;
  const fn = { png: exportarPng, mod: exportarParaMod, vanilla: exportarSemMod }[b.dataset.exportar];
  const caixa = $("progresso");
  caixa.hidden = false;
  const progresso = (texto, fracao) => {
    $("progressoTexto").textContent = texto;
    $("progressoBarra").style.width = `${Math.round(fracao * 100)}%`;
  };
  try {
    const msg = await fn(projeto, previa.renderizador, previa.texturas, progresso);
    caixa.hidden = true;
    alert(msg);
  } catch (e) {
    caixa.hidden = true;
    alert(`A exportação falhou: ${e.message}`);
  } finally {
    previa.sujo = true;
    previa.repintar();
  }
}));

// --- atualização pelo GitHub ---

fetch("/api/estado").then((r) => r.json()).then((e) => { $("btVersao").textContent = `v${e.versao}`; }).catch(() => {});

$("btVersao").addEventListener("click", async () => {
  const texto = $("atualizarTexto"), notas = $("atualizarNotas"), bt = $("btAtualizar");
  texto.textContent = "Procurando versão nova no GitHub…";
  notas.hidden = true;
  bt.hidden = true;
  $("dlgAtualizar").showModal();
  let info;
  try { info = await (await fetch("/api/atualizacao")).json(); } catch (e) { texto.textContent = `Não consegui procurar: ${e.message}`; return; }
  if (info.erro) { texto.textContent = `Você está na versão ${info.atual}. ${info.erro}`; return; }
  if (!info.nova) { texto.textContent = `Você está na versão mais nova (${info.atual}).`; return; }
  texto.textContent = `Versão ${info.ultima} disponível (você está na ${info.atual}).`;
  if (info.notas) { notas.textContent = info.notas; notas.hidden = false; }
  if (info.dev) {
    texto.textContent += " Esta é a pasta do projeto (tem git): atualize com git pull.";
    return;
  }
  bt.hidden = false;
  bt.onclick = async () => {
    bt.disabled = true;
    projetos.guardarLocal(projeto);
    texto.textContent = "Baixando e conferindo o pacote…";
    const r = await fetch("/api/atualizacao/baixar", { method: "POST" });
    const d = await r.json();
    if (!r.ok) { texto.textContent = `Não atualizou: ${d.erro}`; bt.disabled = false; return; }
    texto.textContent = `Instalando a ${d.versao}. A página volta sozinha em alguns segundos.`;
    await fetch("/api/atualizacao/aplicar", { method: "POST" });
    // espera o servidor voltar com a versão nova
    for (let i = 0; i < 60; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      try {
        const e = await (await fetch("/api/estado")).json();
        if (e.versao === d.versao) { location.reload(); return; }
      } catch { /* ainda subindo */ }
    }
    texto.textContent = "O servidor não voltou. Feche e abra o app de novo; se a versão nova não abrir, a anterior volta sozinha.";
  };
});

// --- camadas novas ---

function adicionar(c) {
  projeto.camadas.push(c);
  selecionada = c.id;
  mudou("lista", c.id);
}
$("btAddTexto").addEventListener("click", () => {
  const temCima = projeto.camadas.some((c) => c.tipo === "texto" && c.vista === "cima");
  adicionar(camadaDeTexto(temCima ? { ...PRESET_INFINITO, texto: "TEXTO" } : { ...PRESET_CIMA, texto: "TEXTO" }, temCima ? "avaritia" : "pedra"));
});
$("btAddMinecraft").addEventListener("click", () => adicionar(camadaVanilla("minecraft")));
$("btAddJava").addEventListener("click", () => {
  const c = camadaVanilla("edicao");
  projeto.camadas.push(c);
  painel.projeto = projeto;
  painel.centralizarEdicao(c);
  selecionada = c.id;
  mudou("lista", c.id);
});

// --- ferramentas da prévia ---

$("selTela").addEventListener("change", (e) => { previa.tela = e.target.value; previa.sujo = true; previa.montarSobre(); });
$("selVista").addEventListener("change", (e) => { previa.vista = e.target.value; previa.sujo = true; previa.montarSobre(); });
$("chkGuias").addEventListener("change", (e) => { previa.guias = e.target.checked; previa.montarSobre(); });
$("chkAnimar").addEventListener("change", (e) => { previa.animar = e.target.checked; previa.repintar(); });

window.addEventListener("beforeunload", () => projetos.guardarLocal(projeto));

// --- começo ---

previa.selecionada = selecionada;
previa.definirProjeto(projeto);
painel.definir(projeto, selecionada);
$("nomeProjeto").value = projeto.nome;
previa.carregarTexturasDoJogo().then(() => { previa.sujo = true; });
requestAnimationFrame(laco);
// para conferir pela automação do navegador
window.fabrica = { get projeto() { return projeto; }, previa, abrirProjeto };
