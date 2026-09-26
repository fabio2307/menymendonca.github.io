// netlify/lib/feeds.js
//
// Lógica compartilhada da atualização automática dos vídeos (YouTube e
// TikTok). Usada por:
//   - functions/feeds-update.js  (agendada: a cada hora)
//   - functions/fontes-api.js    (botão "Atualizar vídeos agora" do painel)
//
// De onde vêm as fontes (nesta ordem):
//   1) Painel admin > aba "Redes sociais" > "Origem dos vídeos automáticos"
//      (Netlify Blobs, store "config", chave "fontes")
//   2) Variáveis de ambiente YOUTUBE_ID e TIKTOK_URL_RSS (forma antiga, reserva)

const Parser = require("rss-parser");
const { getStore } = require("@netlify/blobs");

// Node 18+ (padrão no Netlify) já tem fetch; node-fetch fica de reserva.
const fetch = (...args) =>
  typeof globalThis.fetch === "function"
    ? globalThis.fetch(...args)
    : import("node-fetch").then(({ default: fetch }) => fetch(...args));

const parser = new Parser({
  customFields: {
    item: [["media:group", "mediaGroup"]],
  },
});

// Ver momentos-api.js para a explicação do fallback siteID/token.
function criarStore(nome) {
  const opcoes = { name: nome, consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

function extrairDescricaoYoutube(item) {
  const grupo = item.mediaGroup || {};
  const desc = grupo["media:description"];
  if (Array.isArray(desc)) return desc[0] || "";
  if (typeof desc === "string") return desc;
  if (desc && typeof desc === "object" && "_" in desc) return desc._;
  return "";
}

function normalizarUrlTikTok(url) {
  return (url || "").trim().split("?")[0];
}

function isFotoTikTok(url) {
  return /\/photo\//i.test(url || "");
}

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

async function buscarMetaTikTok(url) {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function parseManualTikTok(manualStore, feedsStore) {
  const dados = (await manualStore.get("videos", { type: "json" })) || { videos: [] };
  const listaBruta = Array.isArray(dados) ? dados : dados.videos || [];

  const manual = listaBruta
    .map((item) => (typeof item === "string" ? { url: item } : item))
    .filter((item) => item && typeof item.url === "string")
    .map((item) => ({ ...item, url: normalizarUrlTikTok(item.url) }));

  const anteriores = (await feedsStore.get("tiktok", { type: "json" })) || [];

  return Promise.all(
    manual.map(async (item) => {
      const anterior = anteriores.find((p) => p.url === item.url);
      const meta = isFotoTikTok(item.url) ? null : await buscarMetaTikTok(item.url);

      const legenda = meta?.title || anterior?.description || "";
      const tituloLimpo = item.titulo || extrairTituloLimpo(legenda) || anterior?.title || "TikTok";

      return {
        platform: "TikTok",
        title: tituloLimpo,
        url: item.url,
        thumbnail: meta?.thumbnail_url || anterior?.thumbnail || "",
        description: legenda,
        author: meta?.author_name ? `@${meta.author_name}` : anterior?.author || "",
        date: item.date || anterior?.date || new Date().toISOString(),
      };
    })
  );
}

async function readFeed(source, platform) {
  if (!source) return null; // sem fonte configurada: não mexe na lista já publicada

  try {
    const feed = await parser.parseURL(source);
    return (feed.items || []).slice(0, 20).map((item) => ({
      platform,
      title: item.title || platform,
      url: platform === "TikTok" ? normalizarUrlTikTok(item.link || "") : item.link || "",
      thumbnail: platform === "YouTube" ? buildYouTubeThumbnail(item) : normalizeThumbnail(item),
      description: platform === "YouTube" ? extrairDescricaoYoutube(item) : item.contentSnippet || "",
      date: new Date(item.pubDate || Date.now()).toISOString(),
    }));
  } catch (error) {
    console.warn(`Falha ao ler o feed de ${platform}:`, error.message);
    return null; // null = falhou (diferente de "feed vazio"): mantém a lista anterior
  }
}


async function lerFontes() {
  let salvo = null;
  try {
    salvo = await criarStore("config").get("fontes", { type: "json" });
  } catch {
    salvo = null;
  }
  const youtubeId = (salvo && salvo.youtubeId) || process.env.YOUTUBE_ID || "";
  const tiktokRss = (salvo && salvo.tiktokRss) || process.env.TIKTOK_URL_RSS || "";
  return {
    youtubeId,
    tiktokRss,
    origem: {
      youtube: salvo && salvo.youtubeId ? "painel" : process.env.YOUTUBE_ID ? "variavel" : "nenhuma",
      tiktok: salvo && salvo.tiktokRss ? "painel" : process.env.TIKTOK_URL_RSS ? "variavel" : "nenhuma",
    },
    ultimaAtualizacao: (salvo && salvo.ultimaAtualizacao) || null,
  };
}

async function atualizarFeeds(fontes) {
  const f = fontes || (await lerFontes());
  const feedsStore = criarStore("feeds");
  const manualStore = criarStore("tiktok-manual");

  const [yt, tk, manual, ytAnterior, tkAnterior] = await Promise.all([
    readFeed(f.youtubeId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(f.youtubeId)}` : null, "YouTube"),
    readFeed(f.tiktokRss || null, "TikTok"),
    parseManualTikTok(manualStore, feedsStore),
    feedsStore.get("youtube", { type: "json" }).catch(() => null),
    feedsStore.get("tiktok", { type: "json" }).catch(() => null),
  ]);

  const unicos = (lista) => lista
    .filter((p) => p.url)
    .filter((p, i, arr) => i === arr.findIndex((x) => x.url === p.url))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 12);

  // Se a fonte falhou (null), mantém o que já estava publicado em vez de apagar.
  const youtubeFinal = yt === null ? (ytAnterior || []) : unicos(yt);
  const tiktokRssItens = tk === null ? (tkAnterior || []).filter((p) => !manual.some((m) => m.url === p.url)) : tk;
  const tiktokFinal = unicos([...tiktokRssItens, ...manual]);

  await feedsStore.setJSON("youtube", youtubeFinal);
  await feedsStore.setJSON("tiktok", tiktokFinal);

  // registra a última atualização (aparece no painel)
  try {
    const config = criarStore("config");
    const atual = (await config.get("fontes", { type: "json" })) || {};
    atual.ultimaAtualizacao = {
      em: new Date().toISOString(),
      youtube: youtubeFinal.length,
      tiktok: tiktokFinal.length,
      falhas: [yt === null && f.youtubeId ? "YouTube" : null, tk === null && f.tiktokRss ? "TikTok" : null].filter(Boolean),
    };
    await config.setJSON("fontes", atual);
  } catch { /* não impede a atualização */ }

  console.log(`Feeds atualizados — YouTube: ${youtubeFinal.length} | TikTok: ${tiktokFinal.length}`);
  return { youtube: youtubeFinal.length, tiktok: tiktokFinal.length, falhouYoutube: yt === null && !!f.youtubeId, falhouTiktok: tk === null && !!f.tiktokRss };
}

module.exports = { criarStore, readFeed, lerFontes, atualizarFeeds, parser, fetch };
