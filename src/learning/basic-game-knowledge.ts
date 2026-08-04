import { createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";

export interface BasicKnowledgeSource {
  readonly key: string;
  readonly name: string;
  readonly uri: string | null;
  readonly status: "pending" | "ready";
  readonly role: "primary" | "reference";
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly notes: string;
}

const playlistOneId = "PLQ5_MIYOgaManqqg9HzzpIibf1vQLErJk";
const playlistTwoId = "PLQ5_MIYOgaMbcJ6H5d0zsB2WMWyDoQ37B";
const tibiaHuntChannelUrl = "https://www.youtube.com/@TibiaHunt/videos";

const playlistOneVideos = [
  ["CYC2su2hYhk", "Guia completo para iniciantes — primeiros passos"],
  ["cwoZz0rCSAw", "Cliente do jogo"],
  ["x-QEcUpAOWk", "Primeira Premium Account — primeiro dia (2026)"],
  ["1NsyeTViDB0", "Farmando a primeira Premium — primeiro dia"],
  ["xZjVykIw6vs", "Farmando a primeira Premium — segundo dia"],
  ["zsbD6IojXtw", "Farmando a primeira Premium — terceiro dia"],
  ["sQB0AIs0MZc", "Quests e hunts para chegar à Premium"],
  ["cmuECdPzghU", "Hunts free em Carlin e os primeiros 100k"],
  ["nd1Axy65KT8", "Profit nos elfos de Venore"],
  ["p8EaWkFPijI", "Hunt free de profit — Gloom Wolf"],
  ["9oCUVVFM0LY", "Gloom Wolf — profit em mundo free"],
  ["Ng8o3w_--p4", "Treino de skill com White Deer e equipamento de Knight"],
  ["MEw5WQUAhfk", "Swamp Troll — profit, bestiário e task em Venore"],
  ["O-s31gNhW-4", "Hunts de XP para Elite Knight solo"],
  ["GhB3lSvK2lQ", "Profit para Elite Knight solo e free em Venore"],
  ["zsKRWzTT6y8", "Hunt free de profit e upgrade de espada"],
  ["pD8YjW4n0L8", "Venore boostada — bestiário e profit"],
  ["vLmjPiICOsQ", "Farm de Tibia Coins e upgrade de espada"],
  ["rYkL4yf-m8s", "Bestiário com Fire Bomb"],
  ["MpPrSVw2c-Y", "Gloom Wolf sem World Change — profit e bestiário"],
  ["ke31RZ2wFLU", "Bazaar e aproveitamento de itens sem valor"],
  ["mzYCDL4QBjw", "Primeiro dia farmando com personagem sem equipamento"],
  ["WzV8DUfScN0", "Conclusão do farm para a Premium Account"],
  ["k94i5_O8pW0", "Primeiro dia Premium — tasks, hunts e cidades"],
  ["sk-VeCkmpU4", "Gloom Wolf sem World Change — rotação, task e bestiário"],
  ["7b0BweI6jHQ", "Evento A Piece of Cake e profit"],
  ["8txG_WhuEtk", "Hunt e avaliação de drop raro"],
  ["50A4D2yFv4Y", "Zaoan Chess Box e The Colours of Magic"],
  ["FmZvZwW_wrc", "Bounty Tasks, Eleonore Quest e acesso a Peg Leg"],
  ["nDC0bF9Nfxk", "Forgotten Knowledge, imbuements e set — quinto dia Premium"],
  ["QtijleufuUo", "Yalahar e Bounty Task — sexto dia Premium"]
] as const;

// Os 9 vídeos da segunda playlist também estão presentes na primeira. Eles são
// cadastrados uma única vez e continuam acessíveis pelos dois registros de playlist.
const playlistTwoVideos: readonly (readonly [string, string])[] = [];

function playlistSource(id: string, name: string, videoCount: number): BasicKnowledgeSource {
  return {
    key: `youtube-playlist:${id}`,
    name,
    uri: `https://www.youtube.com/playlist?list=${id}`,
    status: "pending",
    role: "primary",
    metadata: { provider: "youtube", kind: "playlist", playlistId: id, videoCount },
    notes: "Fonte fornecida pelo usuário. Requer extração e revisão antes de orientar decisões."
  };
}

function videoSources(
  playlistId: string,
  videos: readonly (readonly [string, string])[]
): readonly BasicKnowledgeSource[] {
  return videos.map(([videoId, name], index) => ({
    key: `youtube-video:${videoId}`,
    name,
    uri: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}&index=${index + 1}`,
    status: "pending",
    role: "reference",
    metadata: { provider: "youtube", kind: "video", playlistId, videoId, playlistIndex: index + 1 },
    notes: "Item catalogado da playlist. O conteúdo ainda precisa ser processado e revisado."
  }));
}

export const BASIC_GAME_KNOWLEDGE: readonly BasicKnowledgeSource[] = [
  {
    key: "botzin-basic-game-principles:v1",
    name: "Princípios básicos e seguros de jogo",
    uri: null,
    status: "ready",
    role: "primary",
    metadata: { kind: "curated-baseline", version: 1, topics: ["survival", "hunt", "progression", "economy"] },
    notes: [
      "Antes de agir, observar vida, mana, posição, criaturas, inventário, equipamentos e recursos disponíveis.",
      "Priorizar sobrevivência e saída segura sobre experiência ou lucro quando o estado estiver incerto.",
      "Escolher hunt e rota considerando vocação, nível, skills, equipamentos, suprimentos e acessos liberados.",
      "Medir experiência, lucro, gasto de suprimentos, dano recebido e risco para comparar uma hunt.",
      "Confirmar quest, task, bestiário, evento e condição de mundo antes de depender deles.",
      "Multi-Action do cliente possui três slots: executa o primeiro disponível fora de cooldown, ignora magia não aprendida ou item zerado e exige soltar e pressionar novamente a hotkey a cada ação.",
      "Tratar preços, eventos, balanceamentos e recomendações por nível como informações mutáveis que exigem validação."
    ].join("\n")
  },
  playlistSource(playlistOneId, "Guia para iniciantes — tutorial completo", playlistOneVideos.length),
  // A segunda playlist contém 9 itens já catalogados na primeira.
  playlistSource(playlistTwoId, "Tibia Premium — guia completo para iniciantes (2026)", 9),
  {
    key: "youtube-channel:tibiahunt",
    name: "TibiaHunt — catálogo Global de hunts por level e vocação",
    uri: tibiaHuntChannelUrl,
    status: "pending",
    role: "primary",
    metadata: {
      provider: "youtube",
      kind: "channel",
      handle: "TibiaHunt",
      globalOnly: true,
      historicalAllowed: true,
      versionAware: true,
      range: { minimumLevel: 0, maximumLevel: null }
    },
    notes: "Fonte Global fornecida pelo usuário, sem teto de level. Vídeos antigos servem como referência histórica; métricas precisam de validação pós-update."
  },
  ...videoSources(playlistOneId, playlistOneVideos),
  ...videoSources(playlistTwoId, playlistTwoVideos)
];

function sourceHash(key: string): string {
  return createHash("sha256").update(`botzin-basic-knowledge:${key}`).digest("hex");
}

export async function seedBasicGameKnowledge(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO bot_learning_methods
       (name, method_type, scope, weight, mode, config_json, notes, enabled)
     VALUES (?, 'external-knowledge', 'global', 1.0000, 'observe', ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE
       method_type = VALUES(method_type), scope = VALUES(scope), mode = VALUES(mode),
       config_json = VALUES(config_json), notes = VALUES(notes), enabled = TRUE`,
    [
      "Conhecimento básico do Tibia",
      JSON.stringify({ ingestion: "review-required", executionAllowed: false, language: "pt-BR" }),
      "Base inicial fornecida pelo usuário. Fontes pendentes não devem orientar execução até serem processadas e revisadas."
    ]
  );

  for (const source of BASIC_GAME_KNOWLEDGE) {
    const hash = sourceHash(source.key);
    await pool.query(
      `INSERT INTO bot_learning_sources
         (name, source_type, uri, content_hash, language, status, trust_level, processed_at, metadata_json, notes, enabled)
       VALUES (?, ?, ?, ?, 'pt-BR', ?, 'medium', IF(? = 'ready', CURRENT_TIMESTAMP, NULL), ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), uri = VALUES(uri), language = VALUES(language),
         metadata_json = VALUES(metadata_json), notes = VALUES(notes), enabled = TRUE`,
      [
        source.name,
        source.uri === null ? "manual-note" : "web-page",
        source.uri,
        hash,
        source.status,
        source.status,
        JSON.stringify({ ...source.metadata, seedKey: source.key }),
        source.notes
      ]
    );
    await pool.query(
      `INSERT INTO bot_learning_method_sources (method_id, source_id, role, weight)
       SELECT method.id, source.id, ?, ?
         FROM bot_learning_methods method
         JOIN bot_learning_sources source ON source.content_hash = ?
        WHERE method.name = 'Conhecimento básico do Tibia'
       ON DUPLICATE KEY UPDATE role = VALUES(role), weight = VALUES(weight)`,
      [source.role, source.role === "primary" ? 1 : 0.75, hash]
    );
  }
}
