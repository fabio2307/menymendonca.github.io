const { getStore } = require("@netlify/blobs");

const store = getStore({
  name: "contador-visitas",
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN,
  // "strong": evita mostrar um total desatualizado por causa de
  // consistência eventual entre regiões — importante pra um contador que
  // as pessoas realmente olham.
  consistency: "strong",
});

const CHAVE = "total";
const MAX_TENTATIVAS = 5;

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "GET") {
      const atual = (await store.get(CHAVE, { type: "json" })) || { total: 0 };

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atual),
      };
    }

    // POST = incrementa. O padrão antigo era "ler total, somar 1, gravar"
    // — sem controle de concorrência, duas visitas simultâneas podiam ler
    // o mesmo total e as duas gravarem o mesmo valor incrementado,
    // perdendo uma contagem (comum em pico de tráfego, tipo início de
    // live). Aqui grava só se ninguém mudou o valor entre a leitura e a
    // escrita; se mudou, tenta de novo com o valor mais recente.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const registro = await store.getWithMetadata(CHAVE, { type: "json" });
      const totalAtual = registro?.data?.total || 0;
      const novoTotal = totalAtual + 1;

      const opcoesEscrita = registro
        ? { onlyIfMatch: registro.etag }   // já existe: só grava se não mudou
        : { onlyIfNew: true };              // primeira vez: só cria se ainda não existir

      const escritaOk = await store.setJSON(CHAVE, { total: novoTotal }, opcoesEscrita);

      if (escritaOk) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ total: novoTotal }),
        };
      }
      // Conflito: outra requisição escreveu entre a leitura e a escrita
      // desta tentativa — tenta de novo com o valor mais recente.
    }

    throw new Error(`Muitos conflitos simultâneos ao incrementar (${MAX_TENTATIVAS} tentativas)`);

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        erro: "Falha ao acessar o contador",
        detalhe: error.message
      }),
    };
  }
};