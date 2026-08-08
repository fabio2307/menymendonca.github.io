const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const parser = new Parser({
  // O feed do YouTube (Atom) guarda a descrição do vídeo dentro de
  // <media:group><media:description>, não em <content>/<summary> padrão.
  // Sem mapear isso explicitamente, "item.contentSnippet" nunca existe
  // pra itens do YouTube e a descrição sempre sai vazia — confirmado no
  // blog.json real (todo item de YouTube tinha description: "") e
  // reproduzido em teste com um feed de exemplo no formato real do
  // YouTube.
  customFields: {
    item: [["media:group", "mediaGroup"]],
  },
});

// Extrai a descrição de dentro de <media:group><media:description>. O
// rss-parser não achata esse campo automaticamente por estar aninhado
// dois níveis abaixo do <entry> (dentro do customField "media:group").
function extrairDescricaoYoutube(item) {
  const grupo = item.mediaGroup || {};
  const desc = grupo["media:description"];
  if (Array.isArray(desc)) return desc[0] || "";
  if (typeof desc === "string") return desc;
  if (desc && typeof desc === "object" && "_" in desc) return desc._;
  return "";
}

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_ID;
const TIKTOK_RSS = process.env.TIKTOK_URL_RSS;

const OUTPUT_FILE = path.join(__dirname, "../blog.json");

// Arquivo próprio para o carrossel de TikTok (RSS + manual já mesclados).
// Antes, TikTok e YouTube dividiam o mesmo blog.json porque eram um único
// carrossel; hoje os dois carrosséis são independentes, então TikTok ganhou
// seu próprio arquivo de saída, sem mexer no formato que o YouTube usa.
const TIKTOK_OUTPUT_FILE = path.join(__dirname, "../assets/data/tiktok-feed.json");

// Precisa bater com o caminho real gravado pelo config.yml (coleção
// "tiktok") e pela function "salvar-tiktok.js": public/assets/data/tiktok-manual.json.
// Antes apontava para "../tiktok-manual.json" (ou seja, public/tiktok-manual.json),
// um arquivo diferente — por isso o build nunca via os vídeos manuais,
// mesmo com tudo salvando certo no lugar correto. O carrossel só continuava
// mostrando os vídeos manuais porque o blog.js busca esse JSON direto do
// navegador, em paralelo, mascarando o problema aqui no build.
const MANUAL_TIKTOK_FILE = path.join(__dirname, "../assets/data/tiktok-manual.json");

// Remove query string, do mesmo jeito que o front-end (blog.js) e a function
// de salvar (salvar-tiktok.js) já normalizam as URLs manuais. Sem isso, o
// mesmo vídeo vindo do RSS (URL crua, com tracking) e da lista manual (URL
// já normalizada) não batia na deduplicação e aparecia duas vezes no
// carrossel.
function normalizarUrlTikTok(url) {
  return (url || "").trim().split("?")[0];
}

// Mesma lógica do blog.js: o "title" que o oEmbed do TikTok retorna é a
// legenda completa do vídeo (com #hashtags e @menções). Aqui extraímos um
// título curto e limpo (sem tags) para não duplicar o mesmo texto entre o
// título do card e a descrição/legenda exibida abaixo dele.
function extrairTituloLimpo(legenda, limite = 70) {
  const semTags = (legenda || "")
    .replace(/#[\p{L}0-9_]+/gu, "")
    .replace(/@[\p{L}0-9_.]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!semTags) return "";
  return semTags.length > limite ? `${semTags.substring(0, limite)}...` : semTags;
}

function normalizeThumbnail(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item["media:content"]?.url) return item["media:content"].url;
  if (item["media:thumbnail"]?.url) return item["media:thumbnail"].url;

  // Fallback: tenta extrair a primeira <img> do conteúdo do item, para
  // feeds (como alguns agregadores de TikTok) que só embutem a imagem
  // dentro do HTML do post, sem usar enclosure/media:content.
  if (item.content) {
    const match = item.content.match(/<img.*?src="(.*?)"/);
    if (match?.[1]) return match[1];
  }

  return "";
}

function extractYouTubeId(item) {
  const rawId = String(item.id || "");
  return rawId.includes(":") ? rawId.split(":").pop() : rawId;
}

function buildYouTubeThumbnail(item) {
  const id = extractYouTubeId(item);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

function lerJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Erro ao ler ${file}:`, err.message);
    return [];
  }
}

// Desembrulha os dois formatos possíveis do tiktok-manual.json:
// um array puro, OU um objeto { "videos": [...] } (que é o formato que a
// Netlify Function "salvar-tiktok" grava). Sem isso, "manual.map(...)"
// quebrava com "manual.map is not a function" sempre que o arquivo
// estivesse no formato { videos: [...] }, e o build inteiro falhava.
function normalizarListaManual(dados) {
  if (Array.isArray(dados)) return dados;
  if (dados && Array.isArray(dados.videos)) return dados.videos;
  return [];
}

async function buscarMetaTikTok(url) {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function parseManualTikTok() {
  const manual = normalizarListaManual(lerJSON(MANUAL_TIKTOK_FILE))
    .map(item => (typeof item === "string" ? { url: item } : item))
    .filter(item => item && typeof item.url === "string")
    .map(item => ({ ...item, url: normalizarUrlTikTok(item.url) }));

  // Antes lia do blog.json (quando ele ainda continha TikTok). Agora que
  // TikTok tem seu próprio arquivo de saída, o cache de título/thumbnail
  // de builds anteriores vem de lá.
  const anteriores = normalizarListaManual(lerJSON(TIKTOK_OUTPUT_FILE));

  return Promise.all(
    manual.map(async (item) => {
      const anterior = anteriores.find((p) => p.url === item.url);
      const meta = await buscarMetaTikTok(item.url);

      // "meta.title" (oEmbed) é a legenda completa, com # e @ — vira a
      // descrição. O título do card só usa isso quando o admin não
      // definiu um "titulo" próprio no CMS.
      const legenda = meta?.title || anterior?.description || "";
      const tituloLimpo = item.titulo || extrairTituloLimpo(legenda) || anterior?.title || "TikTok";

      return {
        platform: "TikTok",
        title: tituloLimpo,
        url: item.url,
        thumbnail: meta?.thumbnail_url || anterior?.thumbnail || "",
        description: legenda,
        author: meta?.author_name ? `@${meta.author_name}` : (anterior?.author || ""),
        date: item.date || anterior?.date || new Date().toISOString(),
      };
    })
  );
}

async function readFeed(source, platform) {
  if (!source) {
    if (platform === "TikTok") {
      return [];
    }
    console.warn(`Fonte RSS de ${platform} não configurada (variável de ambiente ausente).`);
    return [];
  }

  try {
    const feed = await parser.parseURL(source);

    return (feed.items || []).slice(0, 20).map((item) => ({
      platform,
      title: item.title || platform,
      url: platform === "TikTok" ? normalizarUrlTikTok(item.link || "") : (item.link || ""),
      thumbnail:
        platform === "YouTube"
          ? buildYouTubeThumbnail(item)
          : normalizeThumbnail(item),
      description: platform === "YouTube" ? extrairDescricaoYoutube(item) : (item.contentSnippet || ""),
      date: new Date(item.pubDate || Date.now()).toISOString(),
    }));
  } catch (error) {
    if (platform === "TikTok") {
      console.warn("TikTok RSS indisponível no momento; usando apenas posts manuais.");
      return [];
    }

    console.warn(`Falha ao ler o feed de ${platform}:`, error.message);
    return [];
  }
}

async function updateBlog() {
  try {
    const [yt, tk, manual] = await Promise.all([
      readFeed(
        YOUTUBE_CHANNEL_ID
          ? `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`
          : null,
        "YouTube"
      ),
      readFeed(TIKTOK_RSS, "TikTok"),
      parseManualTikTok(),
    ]);

    // YouTube: único conteúdo do blog.json agora — o carrossel de TikTok
    // passou a ter seu próprio arquivo (ver TIKTOK_OUTPUT_FILE abaixo).
    const youtubeFinal = yt
      .filter((p) => p.url)
      .filter((p, i, arr) => i === arr.findIndex((x) => x.url === p.url))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(youtubeFinal, null, 2));

    // TikTok: RSS + manual mesclados aqui, já deduplicados por URL e com
    // metadados enriquecidos (oEmbed) sempre que possível. O front-end
    // ainda faz uma segunda mesclagem com o tiktok-manual.json ao vivo,
    // então um vídeo manual novo aparece na hora, sem esperar este build.
    const tiktokFinal = [...tk, ...manual]
      .filter((p) => p.url)
      .filter((p, i, arr) => i === arr.findIndex((x) => x.url === p.url))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

    fs.mkdirSync(path.dirname(TIKTOK_OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(TIKTOK_OUTPUT_FILE, JSON.stringify(tiktokFinal, null, 2));

    console.log("Blog atualizado com sucesso 🚀");
    console.log(`  YouTube: ${youtubeFinal.length} | TikTok RSS: ${tk.length} | TikTok manual: ${manual.length} | TikTok total: ${tiktokFinal.length}`);
  } catch (error) {
    // Sem isso, um erro em qualquer parte (ex: manual.map quebrando,
    // feed RSS malformado) derrubava o processo inteiro sem deixar o
    // blog.json ser escrito -- e o carrossel do site ficava sem dados
    // até o próximo build funcionar.
    console.error("Erro ao atualizar blog:", error.message);
    process.exitCode = 1;
  }
}

updateBlog();