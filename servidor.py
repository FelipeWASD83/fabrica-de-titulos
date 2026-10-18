"""Servidor local da fábrica de títulos (só biblioteca padrão).

    python iniciar.py             # http://127.0.0.1:8124 (o iniciar.py sobe este arquivo e cuida da atualização)

- entrega o site (pasta site/);
- /api/vanilla/<nome>.png: texturas do próprio Minecraft 1.21.1, lidas do jar que o Prism baixou (o logo, o
  "JAVA EDITION" e o panorama da tela de título). Nada do jogo fica guardado neste projeto;
- /api/projetos: lista, abre, salva e apaga projetos em dados/projetos (fora do git);
- /api/exportar: recebe os arquivos do pacote em base64 e devolve o .zip pronto;
- /api/atualizacao: procura versão nova nas releases do GitHub, baixa e manda o iniciar.py trocar os arquivos.
"""
import base64
import glob
import io
import json
import os
import re
import sys
import threading
import zipfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
import atualizador  # noqa: E402

SITE = RAIZ / "site"
PROJETOS = RAIZ / "dados" / "projetos"
PORTA = int(os.environ.get("FABRICA_PORTA", "8124"))

VANILLA = {
    "minecraft.png": "assets/minecraft/textures/gui/title/minecraft.png",
    "minceraft.png": "assets/minecraft/textures/gui/title/minceraft.png",
    "edition.png": "assets/minecraft/textures/gui/title/edition.png",
    **{f"panorama_{i}.png": f"assets/minecraft/textures/gui/title/background/panorama_{i}.png" for i in range(6)},
}


def achar_jar():
    """O client.jar do 1.21.1 que o Prism baixou (ou o caminho em FABRICA_JAR)."""
    if os.environ.get("FABRICA_JAR"):
        return Path(os.environ["FABRICA_JAR"])
    base = Path(os.environ.get("APPDATA", "")) / "PrismLauncher" / "libraries" / "com" / "mojang" / "minecraft"
    achados = sorted(glob.glob(str(base / "1.21.1" / "minecraft-1.21.1-client.jar")))
    return Path(achados[0]) if achados else None


_cache_vanilla = {}


def ler_dos_assets(caminho):
    """O panorama não fica no jar (lá é um pixel só): vem dos assets que o launcher baixa à parte, achados pelo
    índice do 1.21.1 (o 17; a meta do Prism diz qual é)."""
    prism = Path(os.environ.get("APPDATA", "")) / "PrismLauncher"
    indice = "17"
    meta = prism / "meta" / "net.minecraft" / "1.21.1.json"
    try:
        indice = json.loads(meta.read_text(encoding="utf-8"))["assetIndex"]["id"]
    except (OSError, ValueError, KeyError):
        pass
    try:
        objetos = json.loads((prism / "assets" / "indexes" / f"{indice}.json").read_text(encoding="utf-8"))["objects"]
        h = objetos[caminho.replace("assets/", "", 1)]["hash"]
        return (prism / "assets" / "objects" / h[:2] / h).read_bytes()
    except (OSError, ValueError, KeyError):
        return None


def ler_vanilla(nome):
    if nome not in VANILLA:
        return None
    if nome not in _cache_vanilla:
        dados = None
        jar = achar_jar()
        if jar and jar.exists():
            with zipfile.ZipFile(jar) as z:
                try:
                    dados = z.read(VANILLA[nome])
                except KeyError:
                    dados = None
        # textura de 1 x 1 no jar é só o lugar reservado; a de verdade está nos assets
        if dados is None or len(dados) < 200:
            dados = ler_dos_assets(VANILLA[nome]) or dados
        if dados is None:
            return None
        _cache_vanilla[nome] = dados
    return _cache_vanilla[nome]


def nome_seguro(nome):
    """Nome de projeto vira nome de arquivo sem nada que saia da pasta."""
    nome = re.sub(r"[^\w\- .:]", "", nome, flags=re.UNICODE).strip().replace(":", "-")
    return nome[:80] or None


class Atendente(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def log_message(self, formato, *args):
        sys.stderr.write("%s\n" % (formato % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, dados, status=HTTPStatus.OK):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _corpo(self):
        n = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        caminho = unquote(self.path.split("?")[0])
        if caminho.startswith("/api/vanilla/"):
            dados = ler_vanilla(caminho.rsplit("/", 1)[1])
            if dados is None:
                return self._json({"erro": "textura do jogo não encontrada (o Prism baixou o Minecraft 1.21.1?)"},
                                  HTTPStatus.NOT_FOUND)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)
            return
        if caminho == "/api/projetos":
            PROJETOS.mkdir(parents=True, exist_ok=True)
            lista = []
            for p in sorted(PROJETOS.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                lista.append({"nome": p.stem, "alterado": int(p.stat().st_mtime * 1000)})
            return self._json(lista)
        if caminho.startswith("/api/projetos/"):
            nome = nome_seguro(caminho.rsplit("/", 1)[1])
            arq = PROJETOS / f"{nome}.json" if nome else None
            if not arq or not arq.exists():
                return self._json({"erro": "projeto não encontrado"}, HTTPStatus.NOT_FOUND)
            return self._json(json.loads(arq.read_text(encoding="utf-8")))
        if caminho == "/api/estado":
            jar = achar_jar()
            return self._json({"jar": str(jar) if jar else None, "jarExiste": bool(jar and jar.exists()),
                               "versao": atualizador.info_versao().get("versao")})
        if caminho == "/api/atualizacao":
            return self._json(atualizador.checar())
        return super().do_GET()

    def do_PUT(self):
        caminho = unquote(self.path.split("?")[0])
        if not caminho.startswith("/api/projetos/"):
            return self._json({"erro": "rota desconhecida"}, HTTPStatus.NOT_FOUND)
        nome = nome_seguro(caminho.rsplit("/", 1)[1])
        if not nome:
            return self._json({"erro": "nome inválido"}, HTTPStatus.BAD_REQUEST)
        try:
            dados = json.loads(self._corpo().decode("utf-8"))
        except ValueError:
            return self._json({"erro": "projeto não é JSON"}, HTTPStatus.BAD_REQUEST)
        PROJETOS.mkdir(parents=True, exist_ok=True)
        temp = PROJETOS / f"{nome}.json.tmp"
        temp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(PROJETOS / f"{nome}.json")
        return self._json({"ok": True, "nome": nome})

    def do_DELETE(self):
        caminho = unquote(self.path.split("?")[0])
        nome = nome_seguro(caminho.rsplit("/", 1)[1]) if caminho.startswith("/api/projetos/") else None
        arq = PROJETOS / f"{nome}.json" if nome else None
        if not arq or not arq.exists():
            return self._json({"erro": "projeto não encontrado"}, HTTPStatus.NOT_FOUND)
        arq.unlink()
        return self._json({"ok": True})

    def do_POST(self):
        caminho = self.path.split("?")[0]
        if caminho == "/api/atualizacao/baixar":
            try:
                return self._json(atualizador.baixar_e_preparar())
            except (atualizador.ErroAtualizacao, OSError) as e:
                return self._json({"erro": str(e)}, HTTPStatus.CONFLICT)
        if caminho == "/api/atualizacao/aplicar":
            if not atualizador.pendente():
                return self._json({"erro": "nenhuma versão baixada"}, HTTPStatus.CONFLICT)
            self._json({"ok": True})
            # o iniciar.py vê o código 3, troca os arquivos e sobe o servidor de novo
            threading.Timer(0.4, lambda: os._exit(atualizador.CODIGO_ATUALIZAR)).start()
            return None
        if caminho != "/api/exportar":
            return self._json({"erro": "rota desconhecida"}, HTTPStatus.NOT_FOUND)
        try:
            pedido = json.loads(self._corpo().decode("utf-8"))
            arquivos = pedido["arquivos"]
        except (ValueError, KeyError):
            return self._json({"erro": "pedido de exportação inválido"}, HTTPStatus.BAD_REQUEST)
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as z:
            for caminho, conteudo in arquivos.items():
                if caminho.startswith("/") or ".." in caminho.split("/"):
                    return self._json({"erro": f"caminho inválido: {caminho}"}, HTTPStatus.BAD_REQUEST)
                z.writestr(caminho, base64.b64decode(conteudo))
        dados = mem.getvalue()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)


def main():
    servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), Atendente)
    print(f"fábrica de títulos em http://127.0.0.1:{PORTA}  (jar do jogo: {achar_jar()})")
    servidor.serve_forever()


if __name__ == "__main__":
    main()
