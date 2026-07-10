const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

// customFields é necessário para o rss-parser entender tags com namespace
// (media:content, media:thumbnail) — sem isso elas ficam undefined.
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

const YOUTUBE_CHANNEL_ID = "UCM2AMeG9bKNvzAn2eiHzMOQ";
const TIKTOK_RSS = "https://tiktok-rss-api.onrender.com/rss/meny.menycita";
const OUTPUT_FILE = path.join(__dirname, "blog.json");

function normalizeThumbnail(item) {
  if (item.enclosure?.url) return item.enclosure.url;

  // Atributos XML (como "url") vêm dentro de "$" quando parseados.
  // mediaContent é array por causa do keepArray configurado acima.
  const mediaContent = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
  if (mediaContent?.$?.url) return mediaContent.$.url;

  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;

  if (item.content) {
    const match = item.content.match(/<img.*?src="(.*?)"/);
    if (match?.[1]) return match[1];
  }

  return "";
}

function extractYouTubeId(item) {
  const rawId = String(item.id || "");
  const idFromFeed = rawId.includes(":") ? rawId.split(":").pop() : rawId;
  return idFromFeed || "";
}

function buildYouTubeThumbnail(item) {
  const videoId = extractYouTubeId(item);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

async function readFeed(source, platform) {
  try {
    const feed = await parser.parseURL(source);
    return (feed.items || []).slice(0, 6).map(item => ({
      platform,
      title: item.title || platform,
      url: item.link || "",
      thumbnail: platform === "YouTube"
        ? buildYouTubeThumbnail(item)
        : normalizeThumbnail(item),
      description: item.contentSnippet || item.content || "",
      date: new Date(item.pubDate || Date.now()).toISOString()
    }));
  } catch (error) {
    console.error(`Falha ao ler o feed de ${platform}:`, error.message);
    return [];
  }
}

async function updateBlog() {
  try {
    const [youtubePosts, tiktokPosts] = await Promise.all([
      readFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`, "YouTube"),
      readFeed(TIKTOK_RSS, "TikTok")
    ]);

    const allPosts = [...youtubePosts, ...tiktokPosts]
      .filter(post => post.url)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPosts, null, 2));
    console.log(`Blog atualizado com sucesso em ${OUTPUT_FILE} (${allPosts.length} posts)`);
  } catch (error) {
    console.error("Erro ao atualizar blog:", error.message);
    process.exitCode = 1; // importante: faz o GitHub Action marcar como falho se der erro
  }
}

updateBlog();