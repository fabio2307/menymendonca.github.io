const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");
const { adminLogado } = require("../lib/auth");

// Ver momentos-api.js para a explicação do fallback siteID/token.
function criarStore() {
  const opcoes = { name: "momentos-imagens", consistency: "strong" };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opcoes.siteID = process.env.NETLIFY_SITE_ID;
    opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
  }
  return getStore(opcoes);
}

const MAX_BYTES = 5 * 1024 * 1024;

// Tipo da imagem pelos primeiros bytes ("assinatura" do arquivo)
function detectarTipo(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.slice(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}

// Antes essa function commitava a imagem no GitHub (mesmo padrão do antigo
// salvar-tiktok.js) — o que significava que a foto só aparecia no site
// depois de um deploy completo (1-2 minutos, às vezes mais). Agora a
// imagem vai direto pro Netlify Blobs, junto com o metadado — sem git,
// sem deploy, sem GITHUB_TOKEN nessa função.
exports.handler = async (event, context) => {
  try {
    const user = adminLogado(context);
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
    // Segurança: só aceita imagens de verdade (confere os primeiros bytes do
    // arquivo, não só o tipo informado) e até 5 MB. Sem isso, dava para subir
    // um HTML/SVG que seria servido pelo nosso domínio (risco de XSS).
    const buffer = Buffer.from(String(conteudoBase64), "base64");
    if (buffer.length > MAX_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: "Imagem muito grande (máximo 5 MB)" }) };
    }
    const tipoReal = detectarTipo(buffer);
    if (!tipoReal) {
      return { statusCode: 415, body: JSON.stringify({ error: "Formato não aceito. Envie JPG, PNG, WEBP ou GIF." }) };
    }

    const chave = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

    const store = criarStore();
    await store.set(chave, buffer, {
      metadata: {
        contentType: tipoReal,
        nomeOriginal: String(nomeArquivo).slice(0, 120),
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
