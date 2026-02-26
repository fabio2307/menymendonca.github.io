const Parser = require("rss-parser");
const fs = require("fs");

const parser = new Parser();

const YOUTUBE_CHANNEL_ID = "UCM2AMeG9bKNvzAn2eiHzMOQ";
const TIKTOK_RSS = "https://rss.app/feeds/uYUK36o1Mf3brhnv.xml";

async function updateBlog() {
  try {
    // 🔴 1. YouTube
    const ytFeed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`
    );

    const youtubePosts = ytFeed.items.slice(0, 6).map(item => {
      const videoId = item.id.split(":").pop();

      return {
        platform: "YouTube",
        title: item.title,
        url: item.link,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        description: item.contentSnippet || item.content || "",
        date: new Date(item.pubDate).toISOString()
      };
    });

    // 🔵 2. TikTok (RSS.app XML)
    const tkFeed = await parser.parseURL(TIKTOK_RSS);

    const tiktokPosts = tkFeed.items.slice(0, 6).map(item => {

      let thumbnail = "";

      if (item.enclosure && item.enclosure.url) {
        thumbnail = item.enclosure.url;
      } else if (item["media:content"] && item["media:content"].url) {
        thumbnail = item["media:content"].url;
      } else if (item["media:thumbnail"] && item["media:thumbnail"].url) {
        thumbnail = item["media:thumbnail"].url;
      } else if (item.content) {
        const match = item.content.match(/<img.*?src="(.*?)"/);
        if (match && match[1]) {
          thumbnail = match[1];
        }
      }

      return {
        platform: "TikTok",
        title: item.title,
        url: item.link,
        thumbnail: thumbnail,
        description: item.contentSnippet || item.content || "",
        date: new Date(item.pubDate).toISOString()
      };
    });

    // 🟣 3. Juntar
    let allPosts = [...youtubePosts, ...tiktokPosts];

    // 🟢 4. Remover duplicados
    const uniquePosts = [];
    const urls = new Set();

    for (const post of allPosts) {
      if (!urls.has(post.url)) {
        urls.add(post.url);
        uniquePosts.push(post);
      }
    }

    // 🟡 5. Ordenar por data
    uniquePosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 🟠 6. Limitar total do carrossel
    const finalPosts = uniquePosts.slice(0, 6);

    // 🔵 7. Gerar blog.json
    fs.writeFileSync("blog.json", JSON.stringify(finalPosts, null, 2));

    console.log("Blog atualizado com sucesso!");
  } catch (error) {
    console.error("Erro:", error.message);
  }
}

updateBlog();