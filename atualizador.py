"""Atualização da fábrica de títulos pelas releases do repositório no GitHub (modelo: clave/servidor/atualizador.py).

1. `checar` pergunta ao GitHub qual é a release mais nova e compara com versao.json.
2. `baixar_e_preparar` baixa o .zip, confere o SHA-256 que o GitHub informa e deixa pronto em dados/atualizacao.
3. O servidor sai com o código 3; o `iniciar.py` chama `aplicar_pendente` (guarda a versão atual, troca os arquivos)
   e sobe de novo. Se a versão nova cair logo ao abrir, `reverter` põe a anterior de volta.
Os projetos (dados/) nunca são tocados.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
DADOS = RAIZ / "dados"
PASTA = DADOS / "atualizacao"
GERENCIADOS = ["site", "servidor.py", "atualizador.py", "iniciar.py", "versao.json", "README.md", "CHANGELOG.md",
               "LICENSE"]
CODIGO_ATUALIZAR = 3


class ErroAtualizacao(Exception):
    pass


def info_versao(raiz: Path = RAIZ) -> dict:
    try:
        return json.loads((raiz / "versao.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"versao": "0.0.0", "repositorio": ""}


def _tupla(v: str) -> tuple:
    partes = []
    for p in (v or "0").lstrip("vV").split("."):
        partes.append(int("".join(ch for ch in p if ch.isdigit()) or 0))
    return tuple((partes + [0, 0, 0])[:3])


def mais_nova(a: str, b: str) -> bool:
    return _tupla(a) > _tupla(b)


def copia_de_desenvolvimento(raiz: Path = RAIZ) -> bool:
    return (raiz / ".git").exists()


def _get_json(url: str, versao: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": f"fabrica-de-titulos/{versao}",
                                               "X-GitHub-Api-Version": "2022-11-28"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def checar() -> dict:
    info = info_versao()
    atual, repo = info.get("versao", "0.0.0"), info.get("repositorio", "")
    base = {"atual": atual, "repositorio": repo, "dev": copia_de_desenvolvimento()}
    if not repo:
        return {**base, "erro": "Sem repositório em versao.json."}
    try:
        rel = _get_json(f"https://api.github.com/repos/{repo}/releases/latest", atual)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {**base, "erro": "O repositório ainda não tem nenhuma versão publicada."}
        return {**base, "erro": f"O GitHub respondeu {e.code}."}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {**base, "erro": f"Sem conexão com o GitHub ({e})."}
    versao = (rel.get("tag_name") or "").lstrip("vV")
    pacote = None
    for a in rel.get("assets") or []:
        if a.get("name", "").endswith(".zip"):
            pacote = {"url": a["browser_download_url"], "digest": a.get("digest")}
            break
    return {**base, "ultima": versao, "nova": mais_nova(versao, atual), "notas": rel.get("body") or "",
            "pagina": rel.get("html_url"), "pacote": pacote, "checado_em": time.time()}


def _baixar(url: str, destino: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "fabrica-de-titulos", "Accept": "application/octet-stream"})
    with urllib.request.urlopen(req, timeout=120) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)


def preparar_de_zip(zip_path: Path, versao_esperada: str, digest: str | None) -> dict:
    """Confere e abre um pacote já baixado; deixa a versão pronta para o iniciar.py trocar."""
    if not digest or not digest.startswith("sha256:"):
        raise ErroAtualizacao("O GitHub não informou o SHA-256 do pacote; sem ele a atualização não é aplicada.")
    if hashlib.sha256(zip_path.read_bytes()).hexdigest() != digest.split(":", 1)[1]:
        raise ErroAtualizacao("O pacote baixado não confere com o SHA-256 do GitHub. Tente de novo.")
    novo = PASTA / "novo"
    shutil.rmtree(novo, ignore_errors=True)
    with zipfile.ZipFile(zip_path) as z:
        for nome in z.namelist():
            if not (novo / nome).resolve().is_relative_to(novo.resolve()):
                raise ErroAtualizacao("Pacote com caminho inválido.")
        z.extractall(novo)
    raiz = novo if (novo / "versao.json").is_file() else next(
        (d for d in novo.iterdir() if d.is_dir() and (d / "versao.json").is_file()), None)
    if raiz is None or not (raiz / "servidor.py").is_file() or not (raiz / "site" / "index.html").is_file():
        raise ErroAtualizacao("O pacote baixado não é da fábrica de títulos ou está incompleto.")
    v = info_versao(raiz).get("versao", "")
    if _tupla(v) != _tupla(versao_esperada):
        raise ErroAtualizacao(f"O pacote diz versão {v}, mas a release é {versao_esperada}.")
    (PASTA / "pronta.json").write_text(json.dumps({"versao": v, "pasta": str(raiz)}, ensure_ascii=False),
                                       encoding="utf-8")
    return {"versao": v}


def baixar_e_preparar() -> dict:
    if copia_de_desenvolvimento():
        raise ErroAtualizacao("Esta é a pasta do projeto (tem .git): atualize com git pull.")
    info = checar()
    if info.get("erro"):
        raise ErroAtualizacao(info["erro"])
    if not info.get("nova"):
        raise ErroAtualizacao("Você já está na versão mais nova.")
    if not info.get("pacote"):
        raise ErroAtualizacao("A release não tem o pacote .zip.")
    PASTA.mkdir(parents=True, exist_ok=True)
    zip_path = PASTA / "pacote.zip"
    _baixar(info["pacote"]["url"], zip_path)
    try:
        return preparar_de_zip(zip_path, info["ultima"], info["pacote"].get("digest"))
    finally:
        zip_path.unlink(missing_ok=True)


def pendente() -> dict | None:
    try:
        return json.loads((PASTA / "pronta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def aplicar_pendente(raiz_app: Path = RAIZ) -> dict | None:
    """Troca os arquivos pela versão baixada; guarda os atuais em dados/atualizacao/anterior. None se não havia nada."""
    p = pendente()
    if not p:
        return None
    novo = Path(p["pasta"])
    anterior = PASTA / "anterior"
    shutil.rmtree(anterior, ignore_errors=True)
    anterior.mkdir(parents=True)
    try:
        for nome in GERENCIADOS:
            if (raiz_app / nome).exists():
                shutil.move(str(raiz_app / nome), str(anterior / nome))
        for nome in GERENCIADOS:
            origem = novo / nome
            if origem.is_dir():
                shutil.copytree(origem, raiz_app / nome)
            elif origem.exists():
                shutil.copy2(origem, raiz_app / nome)
    except Exception as e:
        reverter(raiz_app)
        (PASTA / "pronta.json").unlink(missing_ok=True)
        raise ErroAtualizacao(f"Não deu para trocar os arquivos ({e}); a versão anterior voltou.") from e
    (PASTA / "pronta.json").unlink(missing_ok=True)
    shutil.rmtree(PASTA / "novo", ignore_errors=True)
    return {"versao": p["versao"]}


def reverter(raiz_app: Path = RAIZ) -> bool:
    anterior = PASTA / "anterior"
    if not anterior.is_dir() or not any(anterior.iterdir()):
        return False
    for nome in GERENCIADOS:
        if (anterior / nome).exists():
            alvo = raiz_app / nome
            if alvo.is_dir():
                shutil.rmtree(alvo, ignore_errors=True)
            elif alvo.exists():
                alvo.unlink()
            shutil.move(str(anterior / nome), str(alvo))
    return True
