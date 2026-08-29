const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");

// Ver momentos-api.js para a explicação do fallback siteID/token.
function criarStore() {
  const opcoes = { name: "momentos-imagens", consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

// Antes essa function commitava a imagem no GitHub (mesmo padrão do antigo
// salvar-tiktok.js) — o que significava que a foto só aparecia no site
// depois de um deploy completo (1-2 minutos, às vezes mais). Agora a
// imagem vai direto pro Netlify Blobs, junto com o metadado — sem git,
// sem deploy, sem GITHUB_TOKEN nessa função.
exports.handler = async (event, context) => {
  try {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Não autenticado" }) };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Método não permitido" }) };
    }

    const { nomeArquivo, conteudoBase64, tipoConteudo } = JSON.parse(event.body || "{}");

    if (!nomeArquivo || !conteudoBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "nomeArquivo e conteudoBase64 são obrigatórios" }),
      };
    }

    // Chave única — evita qualquer colisão entre uploads, mesmo com o
    // mesmo nome de arquivo original.
    const chave = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const buffer = Buffer.from(conteudoBase64, "base64");

    const store = criarStore();
    await store.set(chave, buffer, {
      metadata: {
        contentType: tipoConteudo || "image/jpeg",
        nomeOriginal: nomeArquivo,
      },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        url: `/.netlify/functions/imagem-momento?chave=${chave}`,
        chave,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
