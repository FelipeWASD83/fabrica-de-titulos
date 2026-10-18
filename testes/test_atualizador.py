"""python -m unittest discover -s testes -p "test_*.py" (na pasta do projeto)"""
import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import atualizador  # noqa: E402


def montar_zip(destino: Path, versao: str, extra=None):
    with zipfile.ZipFile(destino, "w") as z:
        p = f"fabrica-de-titulos-{versao}/"
        z.writestr(p + "versao.json", json.dumps({"versao": versao, "repositorio": "x/y"}))
        z.writestr(p + "servidor.py", f"# servidor {versao}\n")
        z.writestr(p + "site/index.html", f"<p>{versao}</p>")
        for nome, conteudo in (extra or {}).items():
            z.writestr(nome, conteudo)
    return "sha256:" + hashlib.sha256(destino.read_bytes()).hexdigest()


class TesteAtualizador(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.app = base / "app"
        (self.app / "site").mkdir(parents=True)
        (self.app / "dados" / "projetos").mkdir(parents=True)
        (self.app / "versao.json").write_text(json.dumps({"versao": "1.0.0"}))
        (self.app / "servidor.py").write_text("# servidor 1.0.0\n")
        (self.app / "site" / "index.html").write_text("<p>1.0.0</p>")
        (self.app / "dados" / "projetos" / "meu.json").write_text("{}")
        self.pasta_antiga = atualizador.PASTA
        atualizador.PASTA = self.app / "dados" / "atualizacao"
        atualizador.PASTA.mkdir(parents=True)

    def tearDown(self):
        atualizador.PASTA = self.pasta_antiga
        self.tmp.cleanup()

    def test_versoes(self):
        self.assertTrue(atualizador.mais_nova("1.10.0", "1.9.9"))
        self.assertFalse(atualizador.mais_nova("v1.0.0", "1.0.0"))

    def test_troca_e_volta_sem_tocar_nos_projetos(self):
        z = Path(self.tmp.name) / "p.zip"
        digest = montar_zip(z, "1.1.0")
        atualizador.preparar_de_zip(z, "1.1.0", digest)
        self.assertEqual(atualizador.aplicar_pendente(self.app), {"versao": "1.1.0"})
        self.assertIn("1.1.0", (self.app / "servidor.py").read_text())
        self.assertIn("1.1.0", (self.app / "site" / "index.html").read_text())
        self.assertTrue((self.app / "dados" / "projetos" / "meu.json").exists())
        self.assertTrue(atualizador.reverter(self.app))
        self.assertIn("1.0.0", (self.app / "servidor.py").read_text())
        self.assertIn("1.0.0", (self.app / "site" / "index.html").read_text())
        self.assertTrue((self.app / "dados" / "projetos" / "meu.json").exists())

    def test_sha_errado_ou_ausente_recusa(self):
        z = Path(self.tmp.name) / "p.zip"
        montar_zip(z, "1.1.0")
        with self.assertRaises(atualizador.ErroAtualizacao):
            atualizador.preparar_de_zip(z, "1.1.0", "sha256:" + "0" * 64)
        with self.assertRaises(atualizador.ErroAtualizacao):
            atualizador.preparar_de_zip(z, "1.1.0", None)
        self.assertIsNone(atualizador.pendente())

    def test_caminho_para_fora_recusa(self):
        z = Path(self.tmp.name) / "p.zip"
        digest = montar_zip(z, "1.1.0", {"../../fora.txt": "x"})
        with self.assertRaises(atualizador.ErroAtualizacao):
            atualizador.preparar_de_zip(z, "1.1.0", digest)

    def test_versao_do_pacote_diferente_da_release_recusa(self):
        z = Path(self.tmp.name) / "p.zip"
        digest = montar_zip(z, "1.2.0")
        with self.assertRaises(atualizador.ErroAtualizacao):
            atualizador.preparar_de_zip(z, "1.1.0", digest)


if __name__ == "__main__":
    unittest.main()
