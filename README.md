# Botzin

Projeto TypeScript para estruturar uma IA local responsável por identificar informações visuais da tela do Tibia usando o preview do OBS Studio como fonte de imagem.

## Objetivo

- Ler frames do preview do OBS Studio.
- Verificar se OBS e Tibia estao abertos no PC configurado.
- Verificar se o Tibia esta compartilhado/capturado pelo OBS antes da leitura visual.
- Identificar entidades visuais do jogo, como players, criaturas, NPCs e summons.
- Receber informações de múltiplos computadores simultaneamente.
- Trabalhar com conexões locais por cabo e Wi-Fi.
- Opcionalmente enviar comandos para um Raspberry Pi, que pode atuar como dispositivo USB HID para teclado/mouse.

## Limites da estrutura

O projeto separa claramente:

- `perception`: captura e interpretação visual.
- `coordination`: recebimento de dados de vários computadores.
- `decision`: decisão sobre o que fazer com as informações identificadas.
- `execution`: envio de comandos para um executor externo, como Raspberry Pi.

A integração com OBS, modelo local de visão e Raspberry Pi começa como interface/adaptador. Isso permite plugar implementações reais depois sem misturar captura, IA e execução física no mesmo código.

## Estrutura

```txt
src/
  config/              Configuração do runtime
  core/                Tipos e contratos compartilhados
  environment/         Verificações do PC, OBS e Tibia
  networking/          Perfis de rede local, cabo, Wi-Fi e endereços anunciados
  database/            MySQL, migracao e repositorio de configuracoes
  web/                 API e tela local de configuracoes
  learning/            Modos e metodos de aprendizado
  perception/          Captura OBS e detecção visual
  coordination/        Entrada de múltiplos computadores
  decision/            Planejamento baseado no estado identificado
  execution/           Comandos para Raspberry Pi HID
  index.ts             Ponto de entrada
database/
  schema.sql           Tabelas MySQL de contas, chars, maquinas, hunts e atribuicoes
public/
  index.html           Tela de configuracoes
```

## Banco de dados MySQL

O banco guarda:

- `bot_accounts`: contas que o bot pode acessar.
- `bot_characters`: chares vinculados as contas.
- `bot_machines`: PCs locais e Raspberry/executores.
- `bot_hunts`: hunts configuradas.
- `bot_skills`: skills/magias com custo de mana, level minimo, vocacoes e hotkey.
- `bot_hunt_assignments`: qual maquina usa qual char em qual hunt.
- `bot_hunt_skill_rules`: quais skills entram em cada hunt e em quais condicoes basicas.
- `bot_hunt_telemetry`: sessoes por char/hunt com profit, XP/h, raw XP/h, loot, supplies e criaturas.
- `bot_learning_methods`: metodos de aprendizado ativos.
- `bot_learning_sources`: videos, imagens, textos, paginas, market snapshots, replays e notas.
- `bot_learning_method_sources`: vinculo entre metodo de aprendizado e fonte.
- `bot_learning_sessions`: sessoes de ensino gravadas/revisadas.
- `bot_learning_events`: eventos observados durante o ensino.
- `bot_decision_feedback`: feedback humano sobre uma decisao.

Configuração:

```env
BOTZIN_MYSQL_HOST=127.0.0.1
BOTZIN_MYSQL_PORT=3306
BOTZIN_MYSQL_USER=botzin
BOTZIN_MYSQL_PASSWORD=use-uma-senha-longa-e-aleatoria
BOTZIN_MYSQL_DATABASE=botzin
DATABASE_URL=mysql://botzin:SENHA_URL_ENCODED@127.0.0.1:3306/botzin
BOTZIN_WEB_HOST=127.0.0.1
BOTZIN_WEB_PORT=4580
```

Para usar Docker, copie `.env.example` para `.env`, substitua todos os valores `change-me` e ajuste `DATABASE_URL` para apontar ao host `mysql`. O Compose recusa iniciar quando os segredos obrigatorios nao foram configurados e publica somente o painel em `127.0.0.1:4580`; o MySQL permanece acessivel apenas entre os containers.

Comandos:

```bash
npm install
npm run migrate
npm run user:create-admin
npm run config:dev
```

Com Prisma:

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:studio
```

O `DATABASE_URL` e as variaveis `BOTZIN_MYSQL_*` devem apontar para o mesmo banco. O Prisma fica como camada de acesso tipada para o backend de configuracao; o loop rapido da IA deve continuar usando cache/memoria, sem consultar o banco a cada frame.

Depois acesse:

```txt
http://127.0.0.1:4580
```

A tela permite cadastrar contas, chares, maquinas, hunts, skills e as regras:

- `maquina -> char -> hunt`
- `hunt -> skill`
- metodos de aprendizado e sessoes de ensino
- fontes de ensino e vinculo fonte -> metodo
- eventos de estado/acao/recompensa e feedback humano pela API

Por seguranca, a estrutura inicial grava `secretReference` em vez de gravar a senha pura da conta. Essa referencia pode apontar depois para um cofre local, arquivo criptografado ou variavel de ambiente controlada.

## Segurança do painel

O painel de configuracoes usa login com usuario/senha, JWT assinado e validacao de role no backend.

Configure antes de subir:

```env
BOTZIN_JWT_SECRET=use-um-segredo-longo-e-aleatorio
BOTZIN_JWT_EXPIRES_IN_SECONDS=28800
BOTZIN_ADMIN_USERNAME=admin
BOTZIN_ADMIN_PASSWORD=uma-senha-forte
BOTZIN_ADMIN_DISPLAY_NAME=Administrador
```

Fluxo inicial:

```bash
npm run migrate
npm run user:create-admin
npm run config:dev
```

Roles:

- `viewer`: pode ler configuracoes.
- `operator`: pode ler e alterar configuracoes.
- `admin`: reservado para administracao completa.

Todas as rotas `/api/*`, exceto `/api/auth/login`, exigem `Authorization: Bearer <token>`. O frontend salva o token no navegador e envia o Bearer automaticamente nas chamadas.

Importante: se `BOTZIN_JWT_SECRET` ficar com o valor padrao, o backend recusa gerar/validar token.

## Decisao de skill

### Catálogo oficial de magias por vocação

O `npm run migrate` cadastra de forma idempotente as 193 magias publicadas na
[biblioteca oficial do Tibia](https://www.tibia.com/library/?subtopic=spells), incluindo palavras, categoria,
nível, custo de mana e as vocações Druid, Knight, Paladin, Sorcerer e Monk (com suas promoções). As magias entram
desabilitadas para que o catálogo não autorize ações automaticamente; hotkeys e regras configuradas pelo usuário
são preservadas nas atualizações.

Custos publicados como `var.` são armazenados como `NULL` e aparecem no painel como `mana variável`, nunca como
custo zero. Para buscar uma fotografia atualizada do site oficial e regenerar o catálogo versionado:

```powershell
npm run skills:sync
npm run migrate
```

Depois abra `Configuração atual -> Skills` para consultar magia, palavras, mana, nível e vocações.

### Catálogo de criaturas e itens

O sistema também mantém dois catálogos locais pesquisáveis:

- 718 criaturas da [biblioteca oficial do Tibia via TibiaData](https://api.tibiadata.com/v4/creatures), com HP,
  XP, descrição, comportamento, imunidades, resistências, fraquezas, condições especiais e loot;
- 6.465 itens básicos da [API aberta ByteWizards/TibiaWiki](https://tibiadata.bytewizards.de/), com nome,
  categoria, tipo, classe, link de origem e data da fonte. O Tibia não oferece uma biblioteca oficial equivalente
  para todos os itens, por isso a procedência comunitária é exibida explicitamente.

Para atualizar e aplicar os catálogos:

```powershell
npm run catalog:sync
npm run migrate
```

Também é possível atualizar separadamente com `npm run creatures:sync` ou `npm run items:sync`. No painel, abra
`Catálogo` para pesquisar sem carregar milhares de registros na configuração principal. A API oferece
`GET /api/catalog/creatures` e `GET /api/catalog/items`, com os parâmetros `q`, `limit` e `offset`.

### Conhecimento amplo do jogo

O `npm run migrate` também carrega 4.564 registros pesquisáveis de conhecimento: achievements, bosses,
prédios, charms, cidades, eventos, hunting places, mecânicas de Market, montarias, NPCs, outfits, quests,
runas e Soul Cores. Quests, NPCs, achievements e hunts preservam conteúdo e metadados estruturados da
[API aberta ByteWizards/TibiaWiki](https://tibiadata.bytewizards.de/); as 33 runas e os guias de mecânicas
mantêm a fonte oficial identificada.

Para regenerar essa fotografia versionada e aplicá-la:

```powershell
npm run knowledge:sync:tibia
npm run migrate
```

No painel, abra `Catálogo -> Conhecimento` para ver a cobertura por domínio, pesquisar o conteúdo e abrir a
fonte de cada resposta. Os endpoints são `GET /api/catalog/knowledge`,
`GET /api/catalog/knowledge/coverage` e `GET /api/catalog/live-status`.

Informações estáticas e dinâmicas não são misturadas: criatura/boss boostado são consultados na fonte oficial
com cache curto; calendário e Market são marcados como voláteis. Preços do Market não fazem parte do catálogo,
pois variam por mundo e horário — devem entrar como `market-snapshot` com mundo, item e data da captura.

Regras de party ensinadas pelo usuário também ficam com procedência própria: para upar são permitidos 2 a 5
personagens; EK e ED formam o núcleo normalmente recomendado; party para upar não aceita vocação repetida.
Boss e quest aceitam vocações repetidas e podem ultrapassar 5 participantes quando o conteúdo exigir.
Para upar, o validador também aplica a regra oficial do Shared Experience: todos os levels são obrigatórios e
o menor deve ser pelo menos dois terços do maior (`menor * 3 >= maior * 2`). Essa faixa não bloqueia boss/quest.
Essas regras validam a composição, mas não classificam uma hunt como solo/party quando a fonte não informa isso.

Os campos principais para decidir se uma skill pode ser usada sao:

- `manaCost`: quanto de mana a skill consome.
- `requiredLevel`: level minimo para usar.
- `allowedVocations`: vocacoes que podem usar a skill.
- `hotkey`: tecla que o Raspberry deve acionar.
- `cooldownMs`: intervalo minimo antes de repetir.
- regra por hunt: prioridade, HP/mana minima ou maxima e quantidade de criaturas.

A estrategia de combate deve primeiro filtrar regras impossiveis:

- char nao tem level suficiente.
- vocacao do char nao esta em `allowedVocations`.
- mana atual nao cobre `manaCost`.
- cooldown ainda nao passou.
- regra da hunt nao bate com HP/mana/criaturas detectadas.

Depois ela escolhe a regra valida com maior prioridade.

## Modos de aprendizado

O sistema aceita varios metodos ao mesmo tempo:

- `manual-rules`: regras cadastradas manualmente.
- `human-demonstration`: voce joga e o sistema registra estado + acao.
- `replay`: reprocessa sessoes antigas para testar decisoes.
- `human-feedback`: voce marca uma decisao como boa, ruim ou insegura.
- `hunt-telemetry`: aprende por resultado de hunt, como lucro, XP/h, gasto e risco.
- `external-knowledge`: usa dados externos, como wiki/market, com validade e confianca.

As fontes de ensino podem vir de varios formatos:

- `video`: video local de uma hunt.
- `obs-recording`: gravacao do OBS.
- `image`: print/frame marcado.
- `text`: texto explicando uma estrategia.
- `web-page`: pagina externa de referencia.
- `market-snapshot`: dados coletados do market.
- `replay`: sessao antiga reprocessavel.
- `telemetry`: logs de XP/h, lucro, dano, risco e gasto.
- `manual-note`: anotacao curta feita por voce.

Para adicionar videos de hunts/quests pela tela:

1. Rode `npm run config:dev`.
2. Acesse `http://127.0.0.1:4580`.
3. Use o formulario `Adicionar video de hunt/quest`.
4. O arquivo sera salvo em `storage/learning-sources/videos/`.
5. A fonte sera cadastrada no MySQL com status `pending`.

Formatos aceitos no upload:

- `.mp4`
- `.mkv`
- `.mov`
- `.avi`
- `.webm`

Esses videos nao entram no git; a pasta `storage/` fica local.

### Conhecimento inicial do jogo

Ao executar `npm run migrate` (e também em cada inicialização pelo Docker), o sistema cadastra de forma idempotente:

- o método global `Conhecimento básico do Tibia`, sempre em modo seguro `observe`;
- uma nota revisada com princípios básicos de sobrevivência, progressão, hunts e economia;
- as duas playlists de guia para iniciantes e seus vídeos individuais.

Os vídeos do YouTube ficam com status `pending` e confiança `medium`: eles estão catalogados, mas não são tratados como conhecimento processado. Isso evita que títulos ou conteúdo ainda não revisado sejam usados como autorização para executar ações. O catálogo atual inclui:

- [Guia para iniciantes — tutorial completo](https://www.youtube.com/playlist?list=PLQ5_MIYOgaManqqg9HzzpIibf1vQLErJk)
- [Tibia Premium — guia completo para iniciantes (2026)](https://www.youtube.com/playlist?list=PLQ5_MIYOgaMbcJ6H5d0zsB2WMWyDoQ37B)

O seed fica em `src/learning/basic-game-knowledge.ts`. Para atualizar uma playlist, ajuste o catálogo nesse arquivo e rode novamente `npm run migrate`.

#### Converter as playlists em conhecimento pesquisável

Pré-requisitos no Windows:

```powershell
winget install Gyan.FFmpeg
python -m pip install --upgrade yt-dlp openai-whisper
```

Para baixar as legendas disponíveis, gerar Markdown com timestamps e criar o índice local:

```powershell
npm run knowledge:ingest
```

Se algum vídeo não tiver legenda, use o fallback de áudio + Whisper (mais lento e pode exigir bastante memória):

```powershell
npm run knowledge:ingest:whisper
```

Por padrão o Whisper usa o modelo `small`. Para escolher outro modelo:

```powershell
npm run knowledge:ingest:whisper -- --whisper-model turbo
```

Para recriar somente o índice a partir dos arquivos já baixados:

```powershell
npm run knowledge:reindex
```

Os artefatos são gravados em `storage/knowledge/`:

- `raw/`: metadados e legendas originais;
- `audio/` e `whisper/`: fallback para vídeos sem legenda;
- `transcripts/`: transcrição normalizada em JSON;
- `reviewed/`: um Markdown editável por vídeo;
- `knowledge-index.json`: trechos utilizados pela busca.

Depois, abra a tela `Aprendizado` e use o painel `O que a IA sabe?`. A busca retorna o texto encontrado, o estado de revisão e um link para o timestamp original. Se não existir evidência no índice, a tela informa que a IA ainda não possui uma fonte para responder.

Para revisar um vídeo, corrija o Markdown correspondente em `storage/knowledge/reviewed/`, altere `revisado: false` para `revisado: true` e execute `npm run knowledge:reindex`. O Markdown revisado é a fonte do novo índice, portanto as correções passam a ser exatamente o texto consultado pela IA.

Variáveis opcionais:

- `BOTZIN_KNOWLEDGE_DIR`: troca a pasta de saída;
- `BOTZIN_PYTHON_COMMAND`: troca o comando Python;
- `BOTZIN_WHISPER_MODEL`: define o modelo padrão do Whisper.

Cada metodo tem:

- `weight`: peso na decisao.
- `scope`: global, hunt, char ou party.
- `mode`: `observe`, `suggest` ou `execute`.

Uso recomendado:

- Comecar em `observe` para gravar dados sem agir.
- Passar para `suggest` para comparar as sugestoes com o que voce faria.
- Usar `execute` apenas para comportamentos confiaveis e revisados.

## Captura e IA local

### Monitor de decisões ao vivo

O agente agora executa um ciclo contínuo e grava cada observação em `storage/live-decisions.jsonl`. Para iniciar:

```powershell
npm run dev
```

Abra a tela `Operações` no painel web. O cartão `Decisões ao vivo` atualiza a cada dois segundos e mostra:

- se o agente está online;
- decisão e modo (`observe` ou `suggest`);
- entidades detectadas e confiança visual média;
- motivos apresentados pela estratégia;
- comandos candidatos e erros recentes;
- histórico dos últimos ciclos.

Com a estratégia atual, o resultado correto é `Nenhuma ação` em modo `observe`. Mesmo que uma estratégia futura produza comandos, o monitor os identifica como sugestões até que um executor seja explicitamente conectado.

Quando o painel roda pelo Docker e o agente roda no host, `docker-compose.yml` monta `./storage` como somente leitura no container. Assim, os dois processos compartilham o mesmo histórico sem dar ao painel permissão para alterá-lo.

Configuração opcional:

- `BOTZIN_DECISION_INTERVAL_MS`: intervalo entre ciclos, padrão `2000`;
- `BOTZIN_DECISION_LOG_PATH`: arquivo JSONL compartilhado pelo agente e pelo painel.

### Telemetria de hunt por personagem

Na tela `Operações`, abra `Telemetria de hunt por char`, selecione o personagem e a hunt e cole o conteúdo do Hunting Session Analyser do Tibia. O importador reconhece:

- duração da sessão;
- XP gain e raw XP gain;
- XP/h exibido e raw XP/h;
- percentual aplicado ao XP exibido, com `150%` como padrão;
- loot, supplies e profit/balance;
- quantidade de cada criatura morta.

Cada amostra é vinculada à atribuição ativa do personagem quando houver correspondência para a hunt. O painel permite filtrar por char e comparar XP/h com bônus, raw XP/h e profit. O texto original também é preservado para auditoria.

Endpoints disponíveis:

- `POST /api/hunt-telemetry/import-analyser`: interpreta texto copiado do cliente;
- `POST /api/hunt-telemetry`: recebe telemetria estruturada de um coletor OCR ou externo;
- `GET /api/hunt-telemetry?characterId=...`: consulta o histórico do personagem.

O projeto possui dois modos:

- `mock`: modo seguro para desenvolvimento sem OBS/modelo.
- `obs` + `onnx`: modo real para capturar o OBS e rodar um modelo local.

Para usar captura real do OBS:

```env
BOTZIN_FRAME_SOURCE=obs
BOTZIN_OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
BOTZIN_OBS_WEBSOCKET_PASSWORD=
BOTZIN_OBS_SOURCE_NAME=Tibia Preview
```

No OBS Studio, ative o WebSocket em `Ferramentas -> Configuracoes do Servidor WebSocket`.

Para usar IA local:

```env
BOTZIN_DETECTOR=onnx
BOTZIN_ONNX_MODEL_PATH=models/tibia-entities.onnx
BOTZIN_ONNX_LABELS_PATH=models/tibia-entities.example.json
BOTZIN_ONNX_INPUT_WIDTH=640
BOTZIN_ONNX_INPUT_HEIGHT=640
BOTZIN_DETECTION_CONFIDENCE=0.35
BOTZIN_DETECTION_IOU=0.45
```

O arquivo de labels deve mapear as classes do modelo:

```json
[
  { "id": 0, "kind": "player", "label": "player" },
  { "id": 1, "kind": "creature", "label": "creature" },
  { "id": 2, "kind": "npc", "label": "npc" },
  { "id": 3, "kind": "player-summon", "label": "player-summon" }
]
```

O detector ONNX espera uma saida estilo YOLO:

- `[1, N, 4 + classes]`, comum em YOLOv8.
- `[1, N, 5 + classes]`, comum em YOLOv5 com objectness.
- `[1, C, N]`, tambem suportado.

Sem um modelo treinado em `models/tibia-entities.onnx`, o sistema nao consegue diferenciar player, criatura, NPC e summon. Nesse caso ele retorna erro claro informando que o modelo ainda nao foi conectado.

## Próximos passos técnicos

1. Treinar/exportar o modelo local:
   - YOLO/ONNX treinado com prints do Tibia via OBS.
   - Classes iniciais: `player`, `creature`, `npc`, `player-summon`.
   - Opcional depois: OCR local para nomes, battle list e textos.
2. Ligar a confirmação de sources do OBS:
   - Confirmar cena/source ativa via OBS WebSocket.
   - Validar se `BOTZIN_OBS_SOURCE_NAME` e `BOTZIN_TIBIA_SOURCE_NAME` existem.
3. Definir o protocolo final com o Raspberry:
   - HTTP local.
   - WebSocket.
   - MQTT/local broker.
   - Serial USB.

## Verificação do PC

A primeira estrutura de verificação ja diferencia:

- OBS aberto: checado pelo processo configurado em `BOTZIN_OBS_PROCESS_NAME`.
- Tibia aberto: checado pelo processo configurado em `BOTZIN_TIBIA_PROCESS_NAME`.
- OBS compartilhado: ponto de integração para confirmar se o preview/source existe.
- Tibia compartilhado: ponto de integração para confirmar se a source do Tibia esta ativa no OBS.

No Windows, o checker usa `tasklist`. A confirmação de compartilhamento deve ser ligada depois em um adaptador real do OBS, preferencialmente via OBS WebSocket.

## Rede local

Cada maquina pode ter mais de uma conexão ativa. A estrutura considera:

- `ethernet`: rede cabeada, preferida para baixa latencia e estabilidade.
- `wifi`: rede sem fio, util como fallback ou maquina secundaria.
- `unknown`: interface local que nao foi classificada pelo nome.

Configurações principais:

```env
BOTZIN_COORDINATOR_HOST=192.168.0.10
BOTZIN_COORDINATOR_PORT=4573
BOTZIN_NETWORK_BIND_HOST=0.0.0.0
BOTZIN_NETWORK_PREFERRED=ethernet,wifi
BOTZIN_NETWORK_ADVERTISE_HOSTS=192.168.0.10,192.168.1.20
```

Uso recomendado:

- No PC coordenador, use `BOTZIN_NETWORK_BIND_HOST=0.0.0.0` para escutar cabo e Wi-Fi.
- Nos PCs de percepção, use `BOTZIN_COORDINATOR_HOST` apontando para o IP mais estavel do coordenador, preferencialmente cabo.
- Se a maquina tiver dois IPs uteis, liste ambos em `BOTZIN_NETWORK_ADVERTISE_HOSTS`.
- O Raspberry deve ficar na mesma rede local ou receber o IP fixo do coordenador/executor.
