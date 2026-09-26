// netlify/functions/musica-buscar.js
//
// Preenchimento automático do painel (aba "Músicas"): recebe UM link de
// música e devolve título, artista, capa e links das outras plataformas.
// Só o painel logado usa (exige Netlify Identity). O site em si nunca
// chama estes serviços: os links ficam salvos no musicas-api.
//
//   GET /.netlify/functions/musica-buscar?url=<link>
//
// Como busca (nesta ordem):
//  1) Odesli (song.link) — SÓ se existir a variável ODESLI_API_KEY.
//     Em set/2026 o Odesli encerrou o acesso sem chave (responde 401
//     "PUBLIC_API_ACCESS_DEPRECATED"), então sem chave ele é pulado.
//  2) Busca própria, gratuita e sem chave:
//     - descobre título/artista pelo link colado (Deezer, Apple Music,
//       YouTube e Spotify via oEmbed);
//     - acha o link EXATO no Deezer (API pública) e na Apple Music
//       (iTunes Search API);
//     - para Spotify, YouTube, YouTube Music e Amazon Music, que não têm
//       busca pública sem chave, gera o link da PÁGINA DE BUSCA da música
//       (o painel avisa quais são, para trocar pelo link exato se quiser).

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const resposta = (statusCode, corpo) => ({ statusCode, headers: HEADERS, body: JSON.stringify(corpo) });
const UA = { "User-Agent": "meny-site/1.0 (painel admin)" };

async function getJson(url, opcoes = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(url, { headers: UA, signal: ctrl.signal, ...opcoes });
        const texto = await res.text();
        let json = null;
        try { json = JSON.parse(texto); } catch { /* não é JSON */ }
        return { ok: res.ok, status: res.status, json, urlFinal: res.url };
    } catch {
        return { ok: false, status: 0, json: null };
    } finally {
        clearTimeout(t);
    }
}

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const simplificar = (s) => semAcento(s).replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

// "Chitãozinho & Xororó - Evidências (Ao Vivo) [Clipe Oficial]" -> {artista, titulo}
function limparTituloVideo(titulo, canal) {
    let t = String(titulo || "")
        .replace(/[\(\[][^)\]]*(oficial|official|clipe|video|vídeo|lyric|letra|audio|áudio|visualizer|hd|4k)[^)\]]*[\)\]]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    let artista = String(canal || "").replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").trim();
    const partes = t.split(/\s+[-–—|]\s+/);
    if (partes.length >= 2) {
        artista = partes[0].trim();
        t = partes.slice(1).join(" - ").trim();
    }
    return { titulo: t, artista };
}

// ---------- 1) Odesli (só com chave) ----------
const MAPA_ODESLI = {
    spotify: "spotify", youtube: "youtube", youtubeMusic: "youtubeMusic", deezer: "deezer",
    appleMusic: "appleMusic", itunes: "appleMusic", amazonMusic: "amazonMusic",
    soundcloud: "soundcloud", tidal: "tidal", audiomack: "audiomack",
};
async function viaOdesli(url) {
    const params = new URLSearchParams({ url, userCountry: "BR", songIfSingle: "true", key: process.env.ODESLI_API_KEY });
    const r = await getJson(`https://api.song.link/v1-alpha.1/links?${params}`);
    if (!r.ok || !r.json || !r.json.linksByPlatform) return null;
    const d = r.json;
    const links = {};
    Object.keys(MAPA_ODESLI).forEach((k) => {
        const u = d.linksByPlatform[k] && d.linksByPlatform[k].url;
        if (u && !links[MAPA_ODESLI[k]] && /^https:\/\//.test(u)) links[MAPA_ODESLI[k]] = u;
    });
    const ents = d.entitiesByUniqueId || {};
    const pref = ["spotify", "appleMusic", "itunes", "deezer", "youtube"];
    let e = ents[d.entityUniqueId] || {};
    for (const p of pref) {
        const id = d.linksByPlatform[p] && d.linksByPlatform[p].entityUniqueId;
        if (id && ents[id] && ents[id].title) { e = ents[id]; break; }
    }
    return { titulo: e.title || "", artista: e.artistName || "", capa: e.thumbnailUrl || "", links, buscas: [], pagina: d.pageUrl || "", fonte: "odesli" };
}

// ---------- 2) Busca própria ----------
async function identificar(u) {
    const host = u.hostname.replace(/^www\./, "");

    // Deezer: /track/123 (links curtos deezer.page.link são seguidos)
    if (/deezer\.(com|page\.link)$/.test(host) || host === "link.deezer.com") {
        let alvo = u.toString();
        if (!/\/track\/\d+/.test(alvo)) {
            const r = await getJson(alvo, { redirect: "follow" });
            if (r.urlFinal) alvo = r.urlFinal;
        }
        const id = (alvo.match(/\/track\/(\d+)/) || [])[1];
        if (id) {
            const r = await getJson(`https://api.deezer.com/track/${id}`);
            if (r.json && r.json.title) {
                return { plataforma: "deezer", titulo: r.json.title, artista: r.json.artist && r.json.artist.name, capa: r.json.album && (r.json.album.cover_xl || r.json.album.cover_big), deezer: r.json.link, isrc: r.json.isrc };
            }
        }
    }

    // Apple Music: ...?i=123 ou /song/nome/123
    if (host === "music.apple.com" || host === "itunes.apple.com") {
        const id = u.searchParams.get("i") || (u.pathname.match(/\/song\/[^/]+\/(\d+)/) || [])[1];
        if (id) {
            const r = await getJson(`https://itunes.apple.com/lookup?id=${id}&country=BR`);
            const t = r.json && r.json.results && r.json.results.find((x) => x.kind === "song");
            if (t) return { plataforma: "appleMusic", titulo: t.trackName, artista: t.artistName, capa: capaApple(t.artworkUrl100), appleMusic: t.trackViewUrl };
        }
    }

    // YouTube / YouTube Music (oEmbed público)
    if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
        const idv = u.searchParams.get("v") || (host === "youtu.be" ? u.pathname.slice(1) : (u.pathname.match(/\/(shorts|embed)\/([\w-]{11})/) || [])[2]);
        const watch = idv ? `https://www.youtube.com/watch?v=${idv}` : u.toString();
        const r = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
        if (r.json && r.json.title) {
            const { titulo, artista } = limparTituloVideo(r.json.title, r.json.author_name);
            return {
                plataforma: host === "music.youtube.com" ? "youtubeMusic" : "youtube",
                titulo, artista, capa: idv ? `https://i.ytimg.com/vi/${idv}/hqdefault.jpg` : r.json.thumbnail_url,
                youtube: watch, youtubeMusic: idv ? `https://music.youtube.com/watch?v=${idv}` : "",
            };
        }
    }

    // Spotify (oEmbed público: traz o nome da faixa e a capa; o artista vem da busca)
    if (host === "open.spotify.com" && /\/track\//.test(u.pathname)) {
        const limpo = `https://open.spotify.com${u.pathname.replace(/^\/intl-[a-z-]+/, "")}`;
        const r = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(limpo)}`);
        if (r.json && r.json.title) return { plataforma: "spotify", titulo: r.json.title, artista: "", capa: r.json.thumbnail_url, spotify: limpo };
    }

    return null;
}

function capaApple(url) {
    return url ? String(url).replace(/\/\d+x\d+bb\./, "/600x600bb.") : "";
}

function melhor(lista, titulo, artista, pegarTitulo, pegarArtista) {
    const alvoT = simplificar(titulo), alvoA = simplificar(artista);
    let top = null, pontos = -1;
    (lista || []).forEach((x, i) => {
        const t = simplificar(pegarTitulo(x)), a = simplificar(pegarArtista(x));
        let p = 0;
        if (t === alvoT) p += 4; else if (t.includes(alvoT) || alvoT.includes(t)) p += 2;
        if (semAcento(pegarTitulo(x)).trim() === semAcento(titulo).trim()) p += 1; // título idêntico (sem "Remastered", "Ao Vivo"...)
        if (alvoA && (a === alvoA || a.includes(alvoA) || alvoA.includes(a))) p += 3;
        p -= i * 0.1; // leve preferência pela ordem de relevância do serviço
        if (p > pontos) { pontos = p; top = x; }
    });
    return pontos >= 2 ? top : null;
}

async function buscaPropria(url) {
    const u = new URL(url);
    const base = await identificar(u);
    if (!base || !base.titulo) return null;

    const consulta = [base.titulo, base.artista].filter(Boolean).join(" ");
    const links = {};
    ["spotify", "youtube", "youtubeMusic", "deezer", "appleMusic"].forEach((k) => { if (base[k]) links[k] = base[k]; });
    let { titulo, artista, capa } = base;

    // Deezer (exato)
    if (!links.deezer) {
        const r = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(consulta)}&limit=10`);
        const m = melhor(r.json && r.json.data, titulo, artista, (x) => x.title, (x) => x.artist && x.artist.name);
        if (m) {
            links.deezer = m.link;
            if (!artista) artista = m.artist && m.artist.name;
            if (!capa || /ytimg|scdn/.test(capa)) capa = (m.album && (m.album.cover_xl || m.album.cover_big)) || capa;
        }
    }
    // Apple Music (exato, iTunes Search API)
    if (!links.appleMusic) {
        const r = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent([titulo, artista].filter(Boolean).join(" "))}&entity=song&country=BR&limit=10`);
        const m = melhor(r.json && r.json.results, titulo, artista, (x) => x.trackName, (x) => x.artistName);
        if (m) {
            links.appleMusic = m.trackViewUrl;
            if (!artista) artista = m.artistName;
            if (!capa) capa = capaApple(m.artworkUrl100);
        }
    }

    // Páginas de busca (plataformas sem busca pública gratuita)
    const q = encodeURIComponent([titulo, artista].filter(Boolean).join(" "));
    const buscas = [];
    const paginaBusca = {
        spotify: `https://open.spotify.com/search/${q}`,
        youtube: `https://www.youtube.com/results?search_query=${q}`,
        youtubeMusic: `https://music.youtube.com/search?q=${q}`,
        amazonMusic: `https://music.amazon.com.br/search/${q}`,
    };
    Object.keys(paginaBusca).forEach((k) => {
        if (!links[k]) { links[k] = paginaBusca[k]; buscas.push(k); }
    });

    return { titulo: titulo || "", artista: artista || "", capa: capa || "", links, buscas, pagina: "", fonte: "busca-propria" };
}

exports.handler = async function (event, context) {
    const user = context.clientContext && context.clientContext.user;
    if (!user) return resposta(401, { error: "Não autenticado" });

    const url = String((event.queryStringParameters && event.queryStringParameters.url) || "").trim();
    try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
        return resposta(400, { error: "Cole um link válido de música (Spotify, YouTube, Deezer, Apple Music...)." });
    }

    if (process.env.ODESLI_API_KEY) {
        const r = await viaOdesli(url);
        if (r && Object.keys(r.links).length) return resposta(200, r);
    }

    const r = await buscaPropria(url);
    if (!r) {
        return resposta(404, { error: "Não consegui identificar essa música pelo link. Use um link de Spotify, YouTube, Deezer ou Apple Music, ou preencha os links à mão." });
    }
    return resposta(200, r);
};
