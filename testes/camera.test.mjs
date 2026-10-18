// node --test testes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarTexto, janela, poligonosDoContorno } from "../site/js/camera.js";
import { PRESET_INFINITO, PRESET_JAVA, camadaJavaEdition } from "../site/js/estado.js";

test("o INFINITO de baixo dá a mesma geometria da ferramenta Python (titulo-infinito 1.2.0)", () => {
  const t = montarTexto(PRESET_INFINITO);
  // render_infinito.py: "INFINITO: escala 1.080, espessura 7.88, janela do logo x=200 y=155 624x130"
  assert.ok(Math.abs(t.k - 1.080) < 0.0006, `k=${t.k}`);
  assert.ok(Math.abs(t.espessura - 7.88) < 0.006, `espessura=${t.espessura}`);
  assert.ok(Math.abs(t.faceObtida - 68) < 0.01, `face=${t.faceObtida}`);
  const j = janela(t, 8);
  assert.ok(Math.abs(j.x - 200) <= 1 && Math.abs(j.y - 155) <= 1, JSON.stringify(j));
  assert.ok(Math.abs(j.largura - 624) <= 1 && Math.abs(j.altura - 130) <= 1, JSON.stringify(j));
});

test("vista de cima põe a face acima da linha e a espessura abaixo", () => {
  const t = montarTexto({ ...PRESET_INFINITO, vista: "cima", linha: 130 });
  const j = janela(t, 0);
  assert.ok(j.y < 130 - 60 && j.y + j.altura > 130 + 30, JSON.stringify(j));
});

test("contorno: um polígono por bloco, maior que o bloco", () => {
  const t = montarTexto({ ...PRESET_INFINITO, texto: "I" });
  const polis = poligonosDoContorno(t, 8);
  assert.equal(polis.length, 30);
  for (const p of polis) assert.ok(p.length >= 4);
});

test("escalar tudo junto (com a força) dá a mesma forma, só menor", () => {
  const f = 0.55;
  const a = montarTexto({ ...PRESET_INFINITO, vista: "cima", linha: 0 });
  const b = montarTexto({ ...PRESET_INFINITO, vista: "cima", linha: 0, coluna: PRESET_INFINITO.coluna * f,
    alturaFace: 68 * f, espessura: 40 * f, distFuga: 850 * f });
  assert.deepEqual(b.avisos, []);
  const ja = janela(a, 0), jb = janela(b, 0);
  assert.ok(Math.abs(jb.largura / ja.largura - f) < 0.02, `${jb.largura} / ${ja.largura}`);
  assert.ok(Math.abs(jb.altura / ja.altura - f) < 0.03, `${jb.altura} / ${ja.altura}`);
});

test("medida que não cabe vira aviso, sem a espessura virar funil", () => {
  const t = montarTexto({ ...PRESET_INFINITO, vista: "cima", coluna: 4, alturaFace: 130 });
  assert.ok(t.avisos.length >= 1);
  assert.ok(t.espessura < 500);
  assert.deepEqual(montarTexto(PRESET_INFINITO).avisos, []);
});

test("JAVA EDITION em 3D: cabe na fonte, sem aviso, com a largura da imagem do jogo (512)", () => {
  const t = montarTexto(PRESET_JAVA);
  assert.equal(t.grade.letras, "JAVA EDITION");
  assert.deepEqual(t.avisos, []);
  const j = janela(t, PRESET_JAVA.contorno);
  assert.ok(Math.abs(j.largura - 512) < 40, JSON.stringify(j));
  assert.ok(j.altura < 100, JSON.stringify(j));
  const c = camadaJavaEdition();
  assert.equal(c.tipo, "texto");
  assert.equal(c.nome, "JAVA EDITION");
  assert.equal(c.rachaduras.quantidade, 1);
  assert.ok(Math.abs(c.contorno - 4.25) < 0.01);
});

test("texto vazio ou só com caractere fora da fonte não monta nada", () => {
  assert.equal(montarTexto({ ...PRESET_INFINITO, texto: "" }), null);
  assert.equal(montarTexto({ ...PRESET_INFINITO, texto: "@#" }), null);
});
