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

// Roda UMA VEZ, depois do deploy que inclui as novas functions/*-api.js,
// mas antes de você começar a editar pelo novo admin. Copia o conteúdo
// atual dos JSONs publicados para dentro do Blobs, preservando tudo que
// já foi cadastrado. Depois de confirmar que os dados migraram certo,
// pode apagar este arquivo.
//
// Chame assim (autenticado, pelo navegador já logado no /admin):
//   fetch("/.netlify/functions/migrate-json-to-blobs", { method: "POST" })

exports.handler = async function (event, context) {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Não autenticado" }) };
  }

  const base = process.env.URL || process.env.DEPLOY_URL;
  if (!base) {
    return { statusCode: 500, body: JSON.stringify({ error: "URL do site não disponível no ambiente" }) };
  }

  const resultado = {};

  try {
    const resp = await fetch(`${base}/assets/data/momentos.json`);
    const dados = resp.ok ? await resp.json() : { items: [] };
    const items = Array.isArray(dados.items) ? dados.items : [];
    await criarStore("momentos").setJSON("items", { items });
    resultado.momentos = { migrados: items.length };
  } catch (e) {
    resultado.momentos = { erro: e.message };
  }

  try {
    const resp = await fetch(`${base}/assets/data/tiktok-manual.json`);
    const dados = resp.ok ? await resp.json() : { videos: [] };
    const videos = Array.isArray(dados) ? dados : dados.videos || [];
    await criarStore("tiktok-manual").setJSON("videos", { videos });
    resultado.tiktokManual = { migrados: videos.length };
  } catch (e) {
    resultado.tiktokManual = { erro: e.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, resultado }),
  };
};
