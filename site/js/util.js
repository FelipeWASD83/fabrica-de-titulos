// Pequenas ferramentas sem relação com a tela.

/** Gerador de números aleatórios com semente (mulberry32): a mesma semente dá as mesmas rachaduras. */
export function criarAleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexParaRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function limitar(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

/** Espera o navegador desenhar (para a interface não travar num laço longo). */
export function respirar() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
