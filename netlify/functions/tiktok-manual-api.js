const { getStore } = require("@netlify/blobs");

// Ver momentos-api.js para a explicação do fallback siteID/token.
function criarStore(nome) {
  const opcoes = { name: nome, consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

const store = criarStore("tiktok-manual");
const CHAVE = "videos";

// Inclui vt.tiktok.com (comum em links compartilhados pelo app), além de
// tiktok.com e vm.tiktok.com — mesma cobertura usada no front-end (blog.js).
const TIKTOK_URL_REGEX = /^(https?:\/\/)?(www\.)?(tiktok\.com|v[mt]\.tiktok\.com)\//i;

function normalizarUrl(url) {
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

exports.handler = async function (event, context) {
  if (event.httpMethod === "GET") {
    const dados = (await store.get(CHAVE, { type: "json" })) || { videos: [] };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
      body: JSON.stringify(dados),
    };
  }

  if (event.httpMethod === "POST") {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ success: false, error: "Não autenticado" }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "JSON inválido" }) };
    }

    if (!Array.isArray(payload.videos)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "'videos' precisa ser um array" }) };
    }

    const urlsInvalidas = payload.videos.filter(
      (v) => !v || typeof v.url !== "string" || !TIKTOK_URL_REGEX.test(v.url)
    );
    if (urlsInvalidas.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: `${urlsInvalidas.length} link(s) não parecem ser URLs válidas do TikTok`,
        }),
      };
    }

    const vistos = new Set();
    const videos = [];
    for (const v of payload.videos) {
      const urlLimpa = normalizarUrl(v.url);
      if (!urlLimpa || vistos.has(urlLimpa)) continue;
      vistos.add(urlLimpa);
      videos.push({ ...v, url: urlLimpa });
    }

    await store.setJSON(CHAVE, { videos });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, videos }),
    };
  }

  return { statusCode: 405, body: "Método não permitido" };
};
