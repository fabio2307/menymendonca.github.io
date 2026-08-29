const { getStore } = require("@netlify/blobs");

// Ver momentos-api.js para a explicação do fallback siteID/token.
function criarStore() {
  const opcoes = { name: "momentos-imagens", consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

exports.handler = async function (event, context) {
  const chave = event.queryStringParameters && event.queryStringParameters.chave;

  if (!chave) {
    return { statusCode: 400, body: "Parâmetro 'chave' é obrigatório" };
  }

  const store = criarStore();

  if (event.httpMethod === "GET") {
    const resultado = await store.getWithMetadata(chave, { type: "arrayBuffer" });

    if (!resultado) {
      return { statusCode: 404, body: "Imagem não encontrada" };
    }

    const contentType = (resultado.metadata && resultado.metadata.contentType) || "image/jpeg";
    const buffer = Buffer.from(resultado.data);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        // Cada upload gera uma chave nova (nunca sobrescreve uma
        // existente), então é seguro cachear "para sempre" — se a foto
        // mudar, ela vira uma chave/URL nova, não a mesma URL com
        // conteúdo diferente.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  }

  if (event.httpMethod === "DELETE") {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Não autenticado" }) };
    }

    await store.delete(chave);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  }

  return { statusCode: 405, body: "Método não permitido" };
};
