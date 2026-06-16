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
BOTZIN_MYSQL_PASSWORD=botzin
BOTZIN_MYSQL_DATABASE=botzin
DATABASE_URL=mysql://botzin:botzin@127.0.0.1:3306/botzin
BOTZIN_WEB_HOST=127.0.0.1
BOTZIN_WEB_PORT=4580
```

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

Cada metodo tem:

- `weight`: peso na decisao.
- `scope`: global, hunt, char ou party.
- `mode`: `observe`, `suggest` ou `execute`.

Uso recomendado:

- Comecar em `observe` para gravar dados sem agir.
- Passar para `suggest` para comparar as sugestoes com o que voce faria.
- Usar `execute` apenas para comportamentos confiaveis e revisados.

## Captura e IA local

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
