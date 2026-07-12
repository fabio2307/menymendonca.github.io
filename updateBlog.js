const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const parser = new Parser();

const YOUTUBE_CHANNEL_ID = "UCM2AMeG9bKNvzAn2eiHzMOQ";
const TIKTOK_RSS = "https://rss.app/feeds/uYUK36o1Mf3brhnv.xml";

const OUTPUT_FILE = path.join(__dirname, "blog.json");

// 👇 NOVO: arquivo opcional vindo do painel
const MANUAL_TIKTOK_FILE = path.join(__dirname, "tiktok-manual.json");

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

// 👇 NOVO: tratar TikTok manual
function parseManualTikTok() {
  try {
    if (!fs.existsSync(MANUAL_TIKTOK_FILE)) return [];

    const data = JSON.parse(fs.readFileSync(MANUAL_TIKTOK_FILE));

    return data.map(url => ({
      platform: "TikTok",
      title: "TikTok",
      url,
      thumbnail: "", // TikTok embed resolve depois
      description: "",
      date: new Date().toISOString()
    }));
  } catch (err) {
    console.error("Erro ao ler TikTok manual:", err.message);
    return [];
  }
}

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
      readFeed(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
        "YouTube"
      ),
      readFeed(TIKTOK_RSS, "TikTok")
    ]);

    // 👇 NOVO: juntar manual + RSS
    const manualTikTok = parseManualTikTok();

    const allPosts = [
      ...youtubePosts,
      ...tiktokPosts,
      ...manualTikTok
    ]
      .filter(post => post.url)

      // 👇 NOVO: remover duplicados
      .filter(
        (post, index, self) =>
          index === self.findIndex(p => p.url === post.url)
      )

      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPosts, null, 2));

    console.log("Blog atualizado com sucesso 🚀");
  } catch (error) {
    console.error("Erro ao atualizar blog:", error.message);
  }
}

updateBlog();