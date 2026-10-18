# Fábrica de títulos

Editor de logos para a tela de título do Minecraft no estilo do logo do jogo: letras de bloco em 3D, com perspectiva
de verdade, uma linha vista de cima e outra vista de baixo, como o MINECRAFT com o INFINITO embaixo do modpack
MC:INFINITO. Você mexe e a prévia mostra a tela de título do jogo (panorama, botões e texto amarelo) na hora.

## Abrir

Pelo atalho **Fábrica de títulos** no Menu Iniciar (abre numa janela própria). Ou, na pasta do projeto:

```powershell
python iniciar.py
```

e abra `http://127.0.0.1:8124`. Precisa do Minecraft 1.21.1 baixado pelo Prism: o logo original, o "JAVA EDITION" e o
panorama vêm de lá.

## Usar

- **Camadas** (à direita): cada texto é uma camada, e o MINECRAFT e o JAVA EDITION do próprio jogo também podem
  entrar. A de cima da lista fica na frente; as setas trocam a ordem, o olho esconde.
- **Na prévia:** clique numa camada para escolher, arraste para mover, puxe o quadradinho amarelo do canto para
  aumentar ou diminuir.
- **Texto:** letras A a Z, números e `: . ! - ?`. Os três estilos prontos: Avaritia (arco-íris e espessura
  cósmica), Pedra (como o MINECRAFT) e Azul (como o Mini Series).
- **Tamanho e posição:** "Tamanho geral" muda tudo junto sem deformar; os outros mexem em uma medida só.
- **Perspectiva:** vista de cima (como o MINECRAFT) ou de baixo (como o INFINITO), e a força: quanto menor, mais as
  letras das pontas inclinam.
- **Cores:** face (arco-íris, degradê ou uma cor), espessura (cósmica, degradê ou uma cor, com estrelas), contorno,
  paredes, rachaduras e brilho da quina.
- **JAVA EDITION:** "+ JAVA EDITION (3D)" cria o texto em 3D no meio dos dois textos, no estilo de pedra do
  MINECRAFT, e ele é um texto como os outros: tamanho, posição, perspectiva, cores, contorno e camada. Mexeu em
  alguma coisa e quer ele de volta no meio? Em "Tamanho e posição", o botão "Pôr entre as outras camadas" refaz isso
  (vale para qualquer camada de texto). A imagem original do JAVA EDITION usa outra fonte, mais simples; ela só
  aparece em projeto antigo que já tinha.
- **Título inteiro:** subir ou descer tudo, onde fica o texto amarelo, a velocidade e quantos quadros a animação tem.
- **Guias:** a linha branca é o fim da faixa que o jogo desenha sem o mod; a amarela é o primeiro botão. Se o logo
  passar dela, aparece um aviso embaixo.
- **Tela:** veja como fica na janela do ultrawide, em tela cheia ou no monitor em pé.

O que você está fazendo fica salvo sozinho no navegador. **Salvar** guarda como projeto (com o nome lá em cima), e
**Projetos** lista, abre e apaga.

## Exportar

- **Pacote para o mod MC:INFINITO:** um `.zip` de pacote de recursos com o logo inteiro: camadas, ordem, posição,
  animação das cores e estrelas. Ponha na pasta `resourcepacks` da instância e ative em Opções > Pacotes de recursos.
  Precisa do mod `titulo-infinito` 1.2.0 ou mais novo.
- **Pacote sem mod:** o logo vira uma imagem parada no lugar do logo do jogo. Sem o mod o jogo só desenha uma faixa
  baixa, então o logo é reduzido se não couber (o aviso diz quanto).
- **Imagem PNG:** só o logo, com fundo transparente.

## Atualizar

O botão com a versão (no alto, ao lado de "Novo") procura versão nova no GitHub e instala; os projetos salvos não são
tocados. Na pasta do projeto (que tem git) ele só avisa: aí é `git pull`.
