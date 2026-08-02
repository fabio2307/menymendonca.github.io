const fetch = require("node-fetch");

exports.handler = async (event) => {
    const url = event.queryStringParameters && event.queryStringParameters.url;

    // Sem isso, uma chamada sem "?url=..." tentava fazer fetch de uma URL
    // com "undefined" no meio, gerando erro confuso em vez de uma resposta clara.
    if (!url) {
        return {
            statusCode: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Parâmetro 'url' é obrigatório" }),
        };
    }

    try {
        const res = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        );

        if (!res.ok) {
            return {
                statusCode: res.status,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "TikTok oEmbed retornou erro" }),
            };
        }

        const data = await res.json();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(data),
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: err.message }),
        };
    }
};