"""Sobe o servidor da fábrica de títulos e cuida da atualização (é este que o atalho e o launch.json rodam).

O servidor sai com o código 3 quando a pessoa pede para atualizar: aqui os arquivos são trocados pela versão
baixada e o servidor sobe de novo. Se a versão nova cair nos primeiros 20 segundos, a anterior volta sozinha.
"""
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
import atualizador  # noqa: E402


def rodar_servidor() -> tuple[int, float]:
    inicio = time.time()
    codigo = subprocess.call([sys.executable, str(RAIZ / "servidor.py")], cwd=RAIZ)
    return codigo, time.time() - inicio


def main() -> int:
    acabou_de_atualizar = False
    while True:
        codigo, durou = rodar_servidor()
        if codigo == atualizador.CODIGO_ATUALIZAR:
            try:
                feito = atualizador.aplicar_pendente()
                acabou_de_atualizar = bool(feito)
                if feito:
                    print(f"atualizado para a versão {feito['versao']}", flush=True)
            except atualizador.ErroAtualizacao as e:
                print(f"atualização não aplicada: {e}", flush=True)
            continue
        if acabou_de_atualizar and codigo != 0 and durou < 20:
            print("a versão nova não abriu; voltando para a anterior", flush=True)
            atualizador.reverter()
            acabou_de_atualizar = False
            continue
        return codigo


if __name__ == "__main__":
    sys.exit(main())
