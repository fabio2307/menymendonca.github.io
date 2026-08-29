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

const store = criarStore("feeds");

exports.handler = async function (event) {
  const plataforma = event.queryStringParameters && event.queryStringParameters.platform;

  if (plataforma !== "youtube" && plataforma !== "tiktok") {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Use ?platform=youtube ou ?platform=tiktok" }),
    };
  }

  const dados = (await store.get(plataforma, { type: "json" })) || [];

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    body: JSON.stringify(dados),
  };
};
