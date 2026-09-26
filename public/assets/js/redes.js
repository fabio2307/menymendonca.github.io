/* =========================================================
   Redes sociais do site da Meny — catálogo compartilhado entre o
   site (index.html) e o painel (admin.html).

   O que a Meny cadastra no painel fica no conteudo-api como:
     redes: {
       lista: [{ tipo: "tiktok", handle: "@meny.menycita", url: "https://...", visivel: true }, ...],
       live: "https://www.tiktok.com/@meny.menycita/live"   // vazio = automático pelo @ do TikTok
     }
   ========================================================= */
(function () {
    "use strict";

    // icone: classe do Font Awesome (brands). null = ícone genérico.
    // modelo: como montar o link a partir do @ (quando o link fica em branco).
    var CATALOGO = {
        youtube:   { nome: "YouTube",   icone: "fa-youtube",   acao: "vídeos completos e lives", dominio: /(^|\.)(youtube\.com|youtu\.be)$/, modelo: "https://www.youtube.com/@{h}" },
        tiktok:    { nome: "TikTok",    icone: "fa-tiktok",    acao: "clipes curtos e lives",    dominio: /(^|\.)tiktok\.com$/,               modelo: "https://www.tiktok.com/@{h}" },
        instagram: { nome: "Instagram", icone: "fa-instagram", acao: "fotos e stories",          dominio: /(^|\.)instagram\.com$/,            modelo: "https://www.instagram.com/{h}" },
        facebook:  { nome: "Facebook",  icone: "fa-facebook",  acao: "novidades e fotos",        dominio: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, modelo: "https://www.facebook.com/{h}" },
        kwai:      { nome: "Kwai",      icone: null,           acao: "vídeos curtos",            dominio: /(^|\.)kwai\.com$/,                 modelo: "https://www.kwai.com/@{h}" },
        x:         { nome: "X (Twitter)", icone: "fa-x-twitter", acao: "recados rápidos",        dominio: /(^|\.)(x\.com|twitter\.com)$/,     modelo: "https://x.com/{h}" },
        threads:   { nome: "Threads",   icone: "fa-threads",   acao: "conversas",                dominio: /(^|\.)threads\.(net|com)$/,        modelo: "https://www.threads.net/@{h}" },
        whatsapp:  { nome: "WhatsApp",  icone: "fa-whatsapp",  acao: "fale comigo",              dominio: /(^|\.)(wa\.me|whatsapp\.com)$/,    modelo: "https://wa.me/{n}" },
        telegram:  { nome: "Telegram",  icone: "fa-telegram",  acao: "canal de avisos",          dominio: /(^|\.)(t\.me|telegram\.me)$/,      modelo: "https://t.me/{h}" },
        spotify:   { nome: "Spotify",   icone: "fa-spotify",   acao: "minhas músicas",           dominio: /(^|\.)spotify\.com$/,              modelo: "" },
        twitch:    { nome: "Twitch",    icone: "fa-twitch",    acao: "lives",                    dominio: /(^|\.)twitch\.tv$/,                modelo: "https://www.twitch.tv/{h}" },
        discord:   { nome: "Discord",   icone: "fa-discord",   acao: "comunidade",               dominio: /(^|\.)(discord\.gg|discord\.com)$/, modelo: "" },
        outra:     { nome: "Outro site", icone: null,          acao: "",                         dominio: null,                               modelo: "" },
    };

    // O que o site usava antes (reserva se o painel ainda não tiver nada salvo)
    var PADRAO = {
        lista: [
            { tipo: "youtube",   handle: "@menymendonca4269", url: "https://www.youtube.com/@menymendonca4269", visivel: true },
            { tipo: "tiktok",    handle: "@meny.menycita",    url: "https://www.tiktok.com/@meny.menycita",    visivel: true },
            { tipo: "instagram", handle: "@meny.meny.meny",   url: "https://www.instagram.com/meny.meny.meny", visivel: true },
        ],
        live: "",
    };

    var semArroba = function (h) { return String(h || "").trim().replace(/^@+/, ""); };

    // Monta o link a partir do @ (ex.: TikTok "@meny" -> https://www.tiktok.com/@meny)
    function linkDoHandle(tipo, handle) {
        var c = CATALOGO[tipo];
        if (!c || !c.modelo || !semArroba(handle)) return "";
        return c.modelo.replace("{h}", encodeURIComponent(semArroba(handle)).replace(/%40/g, "@"))
                       .replace("{n}", semArroba(handle).replace(/\D/g, ""));
    }

    // Confere um link: https e domínio compatível com a rede
    function conferir(tipo, url) {
        var c = CATALOGO[tipo];
        if (!url) return { ok: false, erro: "Falta o link" };
        var u;
        try { u = new URL(url); } catch (e) { return { ok: false, erro: "Link inválido" }; }
        if (u.protocol !== "https:") return { ok: false, erro: "O link precisa começar com https://" };
        if (c && c.dominio && !c.dominio.test(u.hostname)) return { ok: true, aviso: "Esse link não parece ser do " + c.nome };
        return { ok: true };
    }

    function linkLive(cfg) {
        if (cfg && cfg.live) return cfg.live;
        var tt = (cfg && cfg.lista || []).find(function (r) { return r.tipo === "tiktok"; }) ||
                 PADRAO.lista.find(function (r) { return r.tipo === "tiktok"; });
        var h = semArroba(tt && tt.handle);
        return h ? "https://www.tiktok.com/@" + h + "/live" : "";
    }

    window.MenyRedes = {
        CATALOGO: CATALOGO, PADRAO: PADRAO,
        linkDoHandle: linkDoHandle, conferir: conferir, linkLive: linkLive, semArroba: semArroba,
    };
})();
