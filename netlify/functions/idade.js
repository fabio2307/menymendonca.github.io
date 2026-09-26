// netlify/functions/idade.js
//
// Calcula a idade no servidor. A DATA DE NASCIMENTO NUNCA vai para o
// navegador de quem visita o site — só o resultado (a idade).
//
// De onde vem a data (nesta ordem):
//   1) Painel admin (aba "Sobre") -> salva no Netlify Blobs, store "config",
//      chave "nascimento" = { data: "AAAA-MM-DD", ocultar: false }
//   2) Variável de ambiente IDADE_NASC (forma antiga, continua valendo
//      como reserva enquanto a data não for salva pelo painel)
//
//   GET  (público)         -> { idade }  ou  { oculta: true }
//   GET  (logado no admin) -> { idade, data, ocultar, origem }  (para preencher o formulário)
//   POST (logado no admin) -> body { data: "AAAA-MM-DD" | "", ocultar: bool }

const { getStore } = require("@netlify/blobs");

function criarStore() {
    const opcoes = { name: "config", consistency: "strong" };
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
        opcoes.siteID = process.env.NETLIFY_SITE_ID;
        opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
    }
    return getStore(opcoes);
}

const CHAVE = "nascimento";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function dataValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ""))) return false;
    const d = new Date(texto + "T12:00:00Z");
    if (isNaN(d.getTime())) return false;
    // a data precisa existir de verdade (evita 2024-02-31) e não pode ser futura
    if (d.toISOString().slice(0, 10) !== texto) return false;
    return d.getUTCFullYear() >= 1900 && d <= new Date();
}

function calcularIdade(dataNascimento) {
    const hoje = new Date();
    const [ano, mes, dia] = dataNascimento.split("-").map(Number);
    let idade = hoje.getFullYear() - ano;
    const m = hoje.getMonth() + 1 - mes;
    if (m < 0 || (m === 0 && hoje.getDate() < dia)) idade--;
    return idade;
}

const resposta = (statusCode, corpo) => ({ statusCode, headers: HEADERS, body: JSON.stringify(corpo) });

exports.handler = async function (event, context) {
    const user = context.clientContext && context.clientContext.user;
    const store = criarStore();

    let salvo = null;
    try {
        salvo = await store.get(CHAVE, { type: "json" });
    } catch {
        salvo = null; // Blobs indisponível: segue com a variável de ambiente
    }

    if (event.httpMethod === "GET") {
        const doPainel = salvo && dataValida(salvo.data) ? salvo.data : "";
        const daVariavel = dataValida(process.env.IDADE_NASC) ? process.env.IDADE_NASC : "";
        const data = doPainel || daVariavel;
        const ocultar = Boolean(salvo && salvo.ocultar);
        const idade = data ? calcularIdade(data) : null;

        if (user) {
            return resposta(200, {
                idade,
                data,
                ocultar,
                origem: doPainel ? "painel" : daVariavel ? "variavel" : "nenhuma",
            });
        }

        if (ocultar) return resposta(200, { oculta: true });
        if (idade === null) {
            return resposta(500, { erro: "Data de nascimento não configurada (painel admin ou IDADE_NASC)" });
        }
        return resposta(200, { idade });
    }

    if (event.httpMethod === "POST") {
        if (!user) return resposta(401, { error: "Não autenticado" });

        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch {
            return resposta(400, { error: "JSON inválido" });
        }

        const data = String(body.data || "").trim();
        if (data && !dataValida(data)) {
            return resposta(400, { error: "Data inválida. Use uma data real, no passado (AAAA-MM-DD)." });
        }

        const registro = { data, ocultar: Boolean(body.ocultar) };
        await store.setJSON(CHAVE, registro);

        const efetiva = data || (dataValida(process.env.IDADE_NASC) ? process.env.IDADE_NASC : "");
        return resposta(200, { success: true, ...registro, idade: efetiva ? calcularIdade(efetiva) : null });
    }

    return resposta(405, { error: "Método não permitido" });
};
