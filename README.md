# Liquid Glass Studio — Mobile / PWA

Editor de animação Liquid Glass otimizado para iPhone (Safari) e navegadores modernos. O projeto é estático e pode ser publicado no GitHub Pages; não requer Electron, instalador Windows, servidor backend ou dependência de FFmpeg.

## Publicar no GitHub Pages

1. Envie o conteúdo desta pasta para a raiz de um repositório GitHub.
2. Abra **Settings → Pages**.
3. Em **Build and deployment**, selecione **GitHub Actions**.
4. O workflow incluído em `.github/workflows/deploy.yml` compila e publica automaticamente a cada push na branch `main`.
5. Abra o endereço do Pages no Safari do iPhone. Toque em **Compartilhar → Adicionar à Tela de Início**.

> Para a primeira abertura, use internet para carregar o aplicativo e instalar o cache offline. Depois disso, a interface e os arquivos do app ficam disponíveis offline. Arquivos de imagem importados pelo usuário permanecem na memória da sessão e devem ser carregados novamente se a página for encerrada.

## Recursos

- Prévia de vídeo 16:9 responsiva; controles ficam abaixo da prévia e nunca cobrem o ícone.
- Animação WebGL ativa também no iOS quando o ajuste do sistema “Reduzir Movimento” está ligado. A pausa é controlada dentro do app.
- Linha do tempo com seleção precisa de frame e reprodução/pausa.
- Exportação PNG do frame selecionado, com transparência e resolução até 4K.
- Exportação MP4 H.264 pelo MediaRecorder do Safari quando o navegador oferecer suporte a `video/mp4`. A disponibilidade de gravação 4K depende do iPhone e da versão do iOS/Safari; o seletor 4K define a resolução do canvas, mas o próprio iOS pode limitar a codificação.
- Ícone fornecido integrado como favicon, ícone PWA e Apple Touch Icon.
- Cache PWA para abrir o app offline após a primeira visita.

## Desenvolvimento

Requer Node.js 20+.

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Instalação no iPhone

1. Publique o repositório com GitHub Pages e acesse o endereço usando Safari.
2. Toque no botão Compartilhar do Safari.
3. Selecione **Adicionar à Tela de Início** e confirme.
4. Abra o ícone criado na tela inicial.

## Observações sobre exportação

O PNG é renderizado no canvas e baixado pelo navegador. No iPhone, o Safari pode mostrar o arquivo no visualizador/Downloads dependendo da versão do iOS.

O MP4 é codificado pelo MediaRecorder do navegador em H.264/MP4 quando disponível. Se `video/mp4` não for listado pelo Safari, o app informa a limitação em vez de entregar um arquivo WebM renomeado como MP4. A codificação em 3840×2160 pode exigir memória e capacidade térmica consideráveis; vídeos curtos são recomendados no iPhone.
