const { getStore } = require("@netlify/blobs");

const store = getStore({
  name: "contador-visitas",
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN
});

exports.handler = async function (event) {
  const CHAVE = "total";

  try {
    if (event.httpMethod === "GET") {
      const atual = (await store.get(CHAVE, { type: "json" })) || { total: 0 };

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atual),
      };
    }

    // POST = incrementa
    const atual = (await store.get(CHAVE, { type: "json" })) || { total: 0 };
    const novoTotal = atual.total + 1;

    await store.setJSON(CHAVE, { total: novoTotal });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: novoTotal }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        erro: "Falha ao acessar o contador",
        detalhe: error.message
      }),
    };
  }
};