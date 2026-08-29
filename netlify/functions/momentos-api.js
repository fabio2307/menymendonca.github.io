const { getStore } = require("@netlify/blobs");

// Em produção, o Netlify injeta as credenciais do Blobs automaticamente.
// Local (netlify dev), isso só funciona se o projeto estiver "linkado"
// (netlify link) com uma versão recente da CLI — quando não está, passar
// siteID/token explicitamente resolve (mesmo padrão já usado no
// contador.js). As duas variáveis já existem no painel do Netlify; local,
// precisam estar no .env também.
function criarStore(nome) {
  const opcoes = { name: nome, consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

const store = criarStore("momentos");
const CHAVE = "items";

exports.handler = async function (event, context) {
  if (event.httpMethod === "GET") {
    const dados = (await store.get(CHAVE, { type: "json" })) || { items: [] };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
      body: JSON.stringify(dados),
    };
  }

  if (event.httpMethod === "POST") {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Não autenticado" }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) };
    }

    if (!Array.isArray(payload.items)) {
      return { statusCode: 400, body: JSON.stringify({ error: "'items' precisa ser um array" }) };
    }

    // Validação mínima de cada item — evita salvar lixo estrutural que
    // quebraria o momentos.js no front-end.
    const itensValidos = payload.items.every(
      (item) => item && typeof item.titulo === "string" && typeof item.categoria === "string"
    );
    if (!itensValidos) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cada item precisa de 'titulo' e 'categoria'" }) };
    }

    await store.setJSON(CHAVE, { items: payload.items });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, total: payload.items.length }),
    };
  }

  return { statusCode: 405, body: "Método não permitido" };
};
