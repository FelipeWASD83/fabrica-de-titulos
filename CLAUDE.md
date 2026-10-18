# CLAUDE.md: fabrica-de-titulos

Editor local de logos de tela de título no estilo do logo do Minecraft (letras de bloco em 3D, vista de cima ou de
baixo), com prévia da tela de título e exportação para o mod `titulo-infinito`. Pedido pelo Felipe em 17/10/2026,
depois do logo do MC:INFINITO. **Repositório público** (escolha dele). O `CLAUDE.md` da raiz vale aqui; o `README.md`
explica o uso para ele.

## Decisões dele

- Funções pedidas: texto de cima e de baixo, tamanho, posição, ordem das camadas, cor, perspectiva, e o "JAVA
  EDITION" do jogo no meio dos dois textos. Extras aprovados: **arrastar na prévia** e **projetos salvos**. O botão
  de instalar direto na instância ficou de fora (não aprovado).
- O "JAVA EDITION" da imagem do jogo usa **outra fonte**, bem mais pixelada: letras de 5 pixels de altura, traço de
  1 pixel, cantos cortados (D, O, A), J com gancho embaixo. Ele pediu em 18/10/2026 "faz o texto em 3d" (depois de
  pedir controles para ele) e, em seguida, "tenta fazer uma [fonte] parecida": desde a 1.1.0 o botão cria um
  **texto 3D** com todos os controles de texto, e desde a 1.2.0 ele usa a **fonte pixelada de 5 linhas** (campo
  `fonte` da camada: `logo` ou `pixel`, escolhido em "Texto"). O `PRESET_JAVA` (`estado.js`) mede ~512 x 64
  unidades como a imagem do jogo, estilo pedra, uma rachadura por letra; a inclinação das letras das pontas é bem
  menor que a do MINECRAFT (face 40, ponto de fuga a 1100), porque a imagem original é quase reta. A camada de
  imagem `edicao` continua existindo só para ler projeto antigo e no formato do mod; não há botão para criá-la.
- O 3D é renderizado e a animação vira quadros prontos: o jogo só troca imagem (mesma decisão do mod).
- Direção visual "mesa de luz" (escolhida por mim, plano aprovado): grafite neutro (#141518, não preto) para julgar
  a cor do logo, prévia ocupando ~70% da largura, painel de seções que abrem e fecham, amarelo do splash (#ffe14a)
  como única cor de ação. Referências: `produto-linear-hero.png` (3 níveis de cinza, números em mono pequeno) e
  `produto-apple-macbook-pro-scroll.png` (seções com "+").

## Como funciona

- `servidor.py` (só biblioteca padrão, porta 8124): entrega `site/`; `/api/vanilla/<nome>.png` lê o logo e o
  "JAVA EDITION" do jar do 1.21.1 que o Prism baixou, e o **panorama dos assets do launcher** (no jar ele é um
  pixel 1 x 1; o índice é o 17, lido da meta do Prism); `/api/projetos` guarda em `dados/projetos` (fora do git);
  `/api/exportar` monta o .zip; `/api/atualizacao` é o atualizador.
- `iniciar.py` sobe o servidor e aplica a atualização (o servidor sai com código 3); se a versão nova cair nos
  primeiros 20 s, volta a anterior. É ele que o atalho e o `launch.json` rodam. `atualizador.py`: modelo do
  `clave`, sem token (repositório público); exige o SHA-256 que o GitHub informa; nunca toca em `dados/`.
- `site/js/camera.js`: a mesma matemática de `titulo-infinito/ferramentas/render_infinito.py`. Cada texto é medido
  na imagem (linha da borda de perto, largura de uma coluna, altura da face, espessura, distância do ponto de fuga) e
  a câmera é achada por essas medidas. Vista de baixo = cena espelhada em torno da borda de perto, com a grade da
  fonte de cabeça para baixo. O nadir fica a no mínimo 2 alturas de face (senão a espessura vira funil); medida que
  não cabe vira aviso. O contorno é geométrico, de cantos vivos (polígono por bloco, cantos em ponta).
- `site/js/fonte.js`: M, I, N, E, C, R, A, F e T medidos no logo do jogo (o A sem a cara do creeper); o resto
  desenhado na mesma grade (traço de 3, 10 meias-linhas). A **fonte pixelada** (`FONTE_PIXEL`, A a Z, 0 a 9 e
  `: . ! - ?`) é desenhada em 5 linhas e expandida (cada pixel vira 2 colunas x 2 meias-linhas, e o espaço entre
  letras é 1 coluna, meio pixel), então a câmera e o renderizador não mudam; `gradeDaPalavra(texto, fonte)` devolve
  também `larguras` (colunas de cada letra, que as rachaduras usam). Os glifos de 5 linhas foram desenhados a olho
  contra a imagem do jogo (não há como extrair letra por letra); conferidos lado a lado com ela.
- `site/js/render.js` (WebGL2): passe de geometria (raio por pixel, superamostrado, só quando a forma muda), passe de
  cor (a cada quadro: arco-íris, degradês, rachaduras, estrelas procedurais em células de 16 px) e redução com alfa
  pré-multiplicado. Exporta a 1,5 px por unidade do logo com superamostragem 3, como a ferramenta do mod.
- `site/js/previa.js`: tela de título no layout do NeoForge (primeiro botão em altura/4 + 32 + deslocamento dos
  botões), splash, guias e caixas de arrastar. `painel.js`: controles; `exportar.js`: os três formatos;
  `estado.js`: projeto, estilos e presets (o `PRESET_INFINITO` é o INFINITO do mod).
- Formato do pacote para o mod: o `titulo.json` do `titulo-infinito` 1.2.0 (camadas, `deslocamentoY`, `splash`),
  com as texturas em `assets/titulo_infinito/textures/gui/pacote/`.

## Conferido em 17/10/2026

- `node --test "testes/*.test.mjs"` (9) e `python -m unittest discover -s testes -p "test_*.py"` (5).
- O preset do INFINITO no JS dá a mesma geometria do Python (escala 1,080, espessura 7,88, janela 200,155 624x130),
  e o pacote exportado bate com os quadros do jar: silhueta 99,97% igual, cor média com 2/255 de diferença (o resto
  são estrelas e rachaduras, sorteadas de outro jeito).
- Prévia a 250 qps em 3440 x 1353 (o limite do monitor dele). A janela pelo atalho sobe o servidor e o derruba ao
  fechar. **Não testei o pacote dentro do jogo** (ele não quer o jogo aberto por agente).

## Como rodar

```powershell
python iniciar.py                                   # http://127.0.0.1:8124
node --test "testes/*.test.mjs"
python -m unittest discover -s testes -p "test_*.py"
```

Atalho: `Fábrica de títulos` no Menu Iniciar, pela casca `_organizacao\atalhos\janela-app` (`apps.json` e
`atalhos.json` da raiz; ícone em `desenhar_icones.py`). Publicar versão: `ferramentas\publicar-versao.ps1` (decisão
dele, como o push).

## Armadilhas

- No painel de navegador do Claude Code o viewport grande vira miniatura: para ver em tamanho real, usar o MCP
  `chrome-devtools` (screenshot em resolução de verdade).
- `OffscreenCanvas` sem contexto não vira PNG (`convertToBlob` falha): chamar `getContext("2d")` antes.
- Textura com 1 byte por texel (a grade da fonte) precisa de `UNPACK_ALIGNMENT` 1.
- Script de edição com barra invertida não vai por heredoc no Bash.
