// netlify/functions/contador.js
//
// Contador de visitas persistente usando Netlify Blobs
// (armazenamento chave-valor nativo do Netlify — não precisa de banco externo).
//
// Requer o pacote "@netlify/blobs" no package.json do projeto:
//   npm install @netlify/blobs
//
// Não precisa configurar nada extra: quando o site está hospedado no Netlify,
// o contexto do Blobs é injetado automaticamente na function.

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const store = getStore("contador-visitas");
  const CHAVE = "total";

  try {
    if (event.httpMethod === "GET") {
      // Apenas consulta o valor atual, sem incrementar
      // (útil se algum painel admin quiser ver sem contar como visita)
      const atual = (await store.get(CHAVE, { type: "json" })) || { total: 0 };
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atual),
      };
    }

    // POST = registra uma nova visita e incrementa
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
      body: JSON.stringify({ erro: "Falha ao acessar o contador", detalhe: error.message }),
    };
  }
};