// netlify/functions/feeds-update.js
// Função AGENDADA (netlify.toml: a cada hora). Atualiza as listas de vídeos
// do YouTube e do TikTok. A lógica fica em netlify/lib/feeds.js, que também
// é usada pelo botão "Atualizar vídeos agora" do painel (fontes-api).

const { atualizarFeeds } = require("../lib/feeds");

exports.handler = async function () {
  try {
    await atualizarFeeds();
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("Erro ao atualizar feeds:", error.message);
    return { statusCode: 500, body: error.message };
  }
};
