const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

// Compatível com Node < 18
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const parser = new Parser();

const YOUTUBE_CHANNEL_ID = "UCM2AMeG9bKNvzAn2eiHzMOQ";
const TIKTOK_RSS = "https://rss.app/feeds/uYUK36o1Mf3brhnv.xml";

const OUTPUT_FILE = path.join(__dirname, "blog.json");
const MANUAL_TIKTOK_FILE = path.join(__dirname, "tiktok-manual.json");


// ==========================
// HELPERS
// ==========================

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
  const videoId = extractYouTubeId(item);
  return videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : "";
}


// ==========================
// LEITURA DE ARQUIVOS
// ==========================

function lerBlogAnterior() {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) return [];

    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Erro ao ler blog.json anterior:", err.message);
    return [];
  }
}

function lerLinksManuais() {
  try {
    if (!fs.existsSync(MANUAL_TIKTOK_FILE)) return [];

    const data = JSON.parse(fs.readFileSync(MANUAL_TIKTOK_FILE, "utf8"));

    // Suporte aos DOIS formatos
    if (Array.isArray(data)) {
      return data.map(item =>
        typeof item === "string" ? { url: item } : item
      );
    }

    if (Array.isArray(data.videos)) {
      return data.videos;
    }

    return [];
  } catch (err) {
    console.error("Erro ao ler TikTok manual:", err.message);
    return [];
  }
}


// ==========================
// TIKTOK METADATA
// ==========================

async function buscarMetaTikTok(url) {
  try {
    const response = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      title: data.title || "TikTok",
      thumbnail: data.thumbnail_url || "",
      author: data.author_name || "",
    };
  } catch (err) {
    console.error("Erro ao buscar meta TikTok:", err.message);
    return null;
  }
}


// ==========================
// TIKTOK MANUAL
// ==========================

async function parseManualTikTok() {
  const links = lerLinksManuais().filter(item =>
    item?.url?.includes("tiktok.com")
  );

  const anteriores = lerBlogAnterior();

  const posts = await Promise.all(
    links.map(async item => {
      const url = item.url.trim();

      const anterior = anteriores.find(p => p.url === url);

      const meta = await buscarMetaTikTok(url);

      return {
        platform: "TikTok",

        title:
          item.titulo ||
          meta?.title ||
          anterior?.title ||
          "TikTok",

        url,

        thumbnail:
          meta?.thumbnail ||
          anterior?.thumbnail ||
          "",

        description:
          meta?.author
            ? `@${meta.author}`
            : anterior?.description || "",

        date:
          item.date ||
          anterior?.date ||
          new Date().toISOString(),
      };
    })
  );

  return posts;
}


// ==========================
// RSS (YouTube + TikTok)
// ==========================

async function readFeed(source, platform) {
  try {
    const feed = await parser.parseURL(source);

    return (feed.items || []).slice(0, 6).map(item => ({
      platform,
      title: item.title || platform,
      url: item.link || "",
      thumbnail:
        platform === "YouTube"
          ? buildYouTubeThumbnail(item)
          : normalizeThumbnail(item),
      description: item.contentSnippet || item.content || "",
      date: new Date(item.pubDate || Date.now()).toISOString(),
    }));
  } catch (error) {
    console.error(`Falha ao ler o feed de ${platform}:`, error.message);
    return [];
  }
}


// ==========================
// MAIN
// ==========================

async function updateBlog() {
  try {
    const [youtubePosts, tiktokPosts, manualTikTok] = await Promise.all([
      readFeed(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
        "YouTube"
      ),
      readFeed(TIKTOK_RSS, "TikTok"),
      parseManualTikTok(),
    ]);

    const allPosts = [...youtubePosts, ...tiktokPosts, ...manualTikTok]
      .filter(post => post.url)

      // Remove duplicados por URL
      .filter(
        (post, index, self) =>
          index === self.findIndex(p => p.url === post.url)
      )

      // Ordena por data
      .sort((a, b) => new Date(b.date) - new Date(a.date))

      // Limita quantidade
      .slice(0, 12);

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(allPosts, null, 2)
    );

    console.log("Blog atualizado com sucesso 🚀");
    console.log(
      `YouTube: ${youtubePosts.length} | TikTok RSS: ${tiktokPosts.length} | TikTok manual: ${manualTikTok.length}`
    );

  } catch (error) {
    console.error("Erro ao atualizar blog:", error.message);
  }
}


// EXECUTA
updateBlog();