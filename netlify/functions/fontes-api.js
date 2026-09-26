// netlify/functions/fontes-api.js
//
// Painel admin > aba "Redes sociais" > "Origem dos vídeos automáticos".
// Tudo aqui exige login no painel (Netlify Identity).
//
//   GET                  -> { youtubeId, tiktokRss, origem, ultimaAtualizacao }
//   POST                 -> body { youtube, tiktokRss }  (salva; valida antes)
//                           "youtube" aceita: ID do canal (UC...), link do canal
//                           (/channel/UC..., /@usuario) ou só o @usuario.
//   POST ?acao=atualizar -> busca os vídeos agora (mesma rotina da função agendada)
//
// Vazio = volta a usar as variáveis YOUTUBE_ID / TIKTOK_URL_RSS do Netlify.

const { criarStore, lerFontes, atualizarFeeds, parser, fetch } = require("../lib/feeds");
const { adminLogado } = require("../lib/auth");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const resposta = (statusCode, corpo) => ({ statusCode, headers: HEADERS, body: JSON.stringify(corpo) });
const ID_CANAL = /^UC[\w-]{22}$/;

// Descobre o ID do canal (UC...) a partir do que foi colado no painel
async function resolverCanal(entrada) {
    const txt = String(entrada || "").trim();
    if (!txt) return { id: "" };
    if (ID_CANAL.test(txt)) return { id: txt };

    let url;
    const doLink = txt.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (doLink) return { id: doLink[1] };
    if (/^@[\w.-]+$/.test(txt)) url = `https://www.youtube.com/${txt}`;
    else {
        try {
            const u = new URL(txt);
            if (!/(^|\.)youtube\.com$/.test(u.hostname)) return { erro: "Isso não parece um link do YouTube." };
            url = `https://www.youtube.com${u.pathname}`;
        } catch {
            return { erro: "Informe o ID do canal (começa com UC), o link do canal ou o @ do canal." };
        }
    }

    try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (meny-site painel)", "Accept-Language": "pt-BR,pt;q=0.9" } });
        const html = await res.text();
        const m = html.match(/"externalId":"(UC[\w-]{22})"/) ||
                  html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
                  html.match(/"channelId":"(UC[\w-]{22})"/);
        if (m) return { id: m[1] };
    } catch { /* cai no erro abaixo */ }
    return { erro: "Não consegui descobrir o ID do canal por esse link. Cole o ID (UC...) — ele aparece em youtube.com/account_advanced." };
}

// Testa se o feed responde e quantos itens tem
async function testarFeed(url) {
    try {
        const feed = await parser.parseURL(url);
        return { ok: true, itens: (feed.items || []).length, titulo: feed.title || "" };
    } catch (err) {
        return { ok: false, erro: err.message };
    }
}

exports.handler = async function (event, context) {
    const user = adminLogado(context);
    if (!user) return resposta(401, { error: "Não autenticado" });

    const acao = event.queryStringParameters && event.queryStringParameters.acao;

    if (event.httpMethod === "GET") {
        return resposta(200, await lerFontes());
    }

    if (event.httpMethod !== "POST") return resposta(405, { error: "Método não permitido" });

    if (acao === "atualizar") {
        try {
            const r = await atualizarFeeds();
            return resposta(200, { success: true, ...r, ...(await lerFontes()) });
        } catch (err) {
            return resposta(500, { error: "Falha ao atualizar: " + err.message });
        }
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return resposta(400, { error: "JSON inválido" }); }

    // YouTube
    const canal = await resolverCanal(body.youtube);
    if (canal.erro) return resposta(400, { error: canal.erro, campo: "youtube" });
    let testeYoutube = null;
    if (canal.id) {
        testeYoutube = await testarFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${canal.id}`);
        if (!testeYoutube.ok) return resposta(400, { error: `O canal ${canal.id} não respondeu com vídeos. Confira o ID.`, campo: "youtube" });
    }

    // TikTok (RSS)
    const rss = String(body.tiktokRss || "").trim();
    let testeTiktok = null;
    if (rss) {
        try {
            if (new URL(rss).protocol !== "https:") throw new Error();
        } catch {
            return resposta(400, { error: "O link do RSS do TikTok precisa começar com https://", campo: "tiktokRss" });
        }
        testeTiktok = await testarFeed(rss);
        if (!testeTiktok.ok) return resposta(400, { error: "Esse link de RSS não respondeu como um feed. Confira o endereço.", campo: "tiktokRss" });
    }

    const config = criarStore("config");
    const atual = (await config.get("fontes", { type: "json" })) || {};
    atual.youtubeId = canal.id;
    atual.tiktokRss = rss;
    await config.setJSON("fontes", atual);

    return resposta(200, {
        success: true,
        youtubeId: canal.id,
        tiktokRss: rss,
        testes: { youtube: testeYoutube, tiktok: testeTiktok },
        ...(await lerFontes()),
    });
};
