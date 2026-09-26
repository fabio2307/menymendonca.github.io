// netlify/functions/musicas-api.js
//
// Lista de músicas da seção "Músicas" do site (mesmo padrão de momentos-api.js).
//   GET  -> público: { items: [...], playlist: { url, titulo } }
//   POST -> exige login no painel (Netlify Identity): salva a lista inteira
//
// Cada música: { id, titulo, artista, capa, links: { spotify, youtube, ... }, pagina }

const { getStore } = require("@netlify/blobs");
const { adminLogado } = require("../lib/auth");

function criarStore(nome) {
    const opcoes = { name: nome, consistency: "strong" };
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
        opcoes.siteID = process.env.NETLIFY_SITE_ID;
        opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
    }
    return getStore(opcoes);
}

const store = criarStore("musicas");
const CHAVE = "lista";

// Plataformas aceitas (a ordem aqui é a ordem dos botões no site)
const PLATAFORMAS = ["spotify", "youtube", "youtubeMusic", "deezer", "appleMusic", "amazonMusic", "soundcloud", "tidal", "audiomack"];

function urlSegura(url) {
    try {
        const u = new URL(String(url || "").trim());
        return u.protocol === "https:" ? u.toString() : "";
    } catch {
        return "";
    }
}

// Aceita capa externa https ou imagem enviada pelo painel (/.netlify/functions/imagem-momento?...)
function capaSegura(url) {
    const txt = String(url || "").trim();
    if (txt.startsWith("/.netlify/functions/imagem-momento?")) return txt;
    return urlSegura(txt);
}

const texto = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

function normalizarMusica(m, i) {
    const links = {};
    PLATAFORMAS.forEach((p) => {
        const u = urlSegura(m && m.links && m.links[p]);
        if (u) links[p] = u;
    });
    return {
        id: texto(m && m.id, 40) || `m${Date.now().toString(36)}${i}`,
        titulo: texto(m && m.titulo, 120),
        artista: texto(m && m.artista, 120),
        capa: capaSegura(m && m.capa),
        links,
        pagina: urlSegura(m && m.pagina),
    };
}

const HEADERS = { "Content-Type": "application/json" };

exports.handler = async function (event, context) {
    if (event.httpMethod === "GET") {
        const dados = (await store.get(CHAVE, { type: "json" })) || { items: [], playlist: null };
        return {
            statusCode: 200,
            headers: { ...HEADERS, "Cache-Control": "public, max-age=30" },
            body: JSON.stringify(dados),
        };
    }

    if (event.httpMethod === "POST") {
        const user = adminLogado(context);
        if (!user) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Não autenticado" }) };

        let payload;
        try {
            payload = JSON.parse(event.body || "{}");
        } catch {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "JSON inválido" }) };
        }
        if (!Array.isArray(payload.items)) {
            return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "'items' precisa ser um array" }) };
        }

        const items = payload.items.map(normalizarMusica);
        const semTitulo = items.filter((m) => !m.titulo).length;
        const semLink = items.filter((m) => !Object.keys(m.links).length).length;
        if (semTitulo || semLink) {
            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: "Cada música precisa de título e de pelo menos um link." }),
            };
        }

        const playlistUrl = urlSegura(payload.playlist && payload.playlist.url);
        const playlist = playlistUrl ? { url: playlistUrl, titulo: texto(payload.playlist.titulo, 80) || "Minha playlist" } : null;

        const dados = { items, playlist };
        await store.setJSON(CHAVE, dados);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, ...dados }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Método não permitido" }) };
};
