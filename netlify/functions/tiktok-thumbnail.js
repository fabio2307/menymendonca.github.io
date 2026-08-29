const fetch = require("node-fetch");

// Proxeia thumbnails do TikTok (tiktokcdn.com) através do nosso próprio
// domínio. O CDN do TikTok bloqueia hotlink baseado no cabeçalho Referer
// quando o navegador carrega a imagem direto de outro site
// (<img src="https://p16-...tiktokcdn.com/...">) — por isso as imagens
// apareciam como erro 403 e caíam no fallback. Buscando a imagem aqui, no
// servidor (sem o Referer do navegador do visitante), o TikTok costuma
// permitir.
//
// Restrito a domínios *.tiktokcdn*.com por segurança — sem essa checagem,
// essa function viraria um proxy aberto pra qualquer URL (risco de SSRF:
// alguém poderia usá-la pra buscar recursos internos ou de outros sites
// através do nosso servidor).
const DOMINIOS_PERMITIDOS = /(^|\.)tiktokcdn[\w-]*\.com$/i;

exports.handler = async (event) => {
    const url = event.queryStringParameters && event.queryStringParameters.url;

    if (!url) {
        return { statusCode: 400, body: "Parâmetro 'url' é obrigatório" };
    }

    let alvo;
    try {
        alvo = new URL(url);
    } catch {
        return { statusCode: 400, body: "URL inválida" };
    }

    if (!DOMINIOS_PERMITIDOS.test(alvo.hostname)) {
        return { statusCode: 403, body: "Domínio não permitido" };
    }

    try {
        const resposta = await fetch(alvo.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; meny-site-thumbnail-proxy/1.0)",
            },
        });

        if (!resposta.ok) {
            return {
                statusCode: resposta.status,
                body: "Falha ao buscar imagem no TikTok",
            };
        }

        const contentType = resposta.headers.get("content-type") || "image/jpeg";
        const buffer = await resposta.buffer();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": contentType,
                // Cacheia no CDN do Netlify — a imagem em si não muda, só
                // a URL assinada do TikTok expira eventualmente (aí o
                // próximo build/enriquecimento traz uma nova).
                "Cache-Control": "public, max-age=86400, s-maxage=604800",
                "Access-Control-Allow-Origin": "*",
            },
            body: buffer.toString("base64"),
            isBase64Encoded: true,
        };
    } catch (error) {
        return {
            statusCode: 502,
            body: "Erro ao buscar a imagem: " + error.message,
        };
    }
};
