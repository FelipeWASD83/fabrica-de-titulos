// Projetos salvos no servidor local (dados/projetos) e o autossalvamento do que está aberto no navegador.

const CHAVE_LOCAL = "fabrica-de-titulos:atual";

export async function listar() {
  const r = await fetch("/api/projetos");
  if (!r.ok) throw new Error("não consegui listar os projetos");
  return r.json();
}

export async function abrir(nome) {
  const r = await fetch(`/api/projetos/${encodeURIComponent(nome)}`);
  if (!r.ok) throw new Error(`não achei o projeto "${nome}"`);
  return r.json();
}

export async function salvar(projeto) {
  const r = await fetch(`/api/projetos/${encodeURIComponent(projeto.nome)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projeto),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(dados.erro || "não salvou");
  return dados.nome;
}

export async function apagar(nome) {
  const r = await fetch(`/api/projetos/${encodeURIComponent(nome)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("não apagou");
}

export function guardarLocal(projeto) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(projeto));
  } catch {
    // navegador sem espaço ou em modo privado: o projeto salvo no servidor continua valendo
  }
}

export function lerLocal() {
  try {
    const s = localStorage.getItem(CHAVE_LOCAL);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
