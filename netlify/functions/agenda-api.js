// netlify/functions/agenda-api.js
//
// Painel admin > aba "Agenda". Exige login de admin.
//   GET  -> { calendarId, origem, chaveConfigurada, teste: {ok, total, proximos[], erro} }
//   POST -> body { agenda }  (ID, link de incorporar/compartilhar ou iCal; vazio = volta ao padrão)
//           testa no Google antes de salvar.

const { adminLogado } = require("../lib/auth");
const { criarStore, lerAgenda, extrairId, buscarEventos } = require("../lib/agenda");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const resposta = (statusCode, corpo) => ({ statusCode, headers: HEADERS, body: JSON.stringify(corpo) });

async function testar(calendarId) {
    const r = await buscarEventos(calendarId, 50);
    return {
        ok: r.ok, erro: r.erro || "", titulo: r.titulo || "", total: r.itens.length,
        proximos: r.itens.slice(0, 3).map((e) => ({ titulo: e.summary, inicio: (e.start && (e.start.dateTime || e.start.date)) || "" })),
    };
}

exports.handler = async function (event, context) {
    if (!adminLogado(context)) return resposta(401, { error: "Não autenticado" });

    if (event.httpMethod === "GET") {
        const atual = await lerAgenda();
        return resposta(200, { ...atual, teste: await testar(atual.calendarId) });
    }
    if (event.httpMethod !== "POST") return resposta(405, { error: "Método não permitido" });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return resposta(400, { error: "JSON inválido" }); }

    const entrada = String(body.agenda || "").trim();
    const config = criarStore("config");

    if (!entrada) {
        await config.delete("agenda").catch(() => {});
        const atual = await lerAgenda();
        return resposta(200, { success: true, ...atual, teste: await testar(atual.calendarId) });
    }

    const id = extrairId(entrada);
    if (!id) return resposta(400, { error: "Não reconheci a agenda. Cole o ID da agenda (algo@group.calendar.google.com) ou o link de compartilhamento do Google Agenda." });

    const teste = await testar(id);
    if (!teste.ok) return resposta(400, { error: teste.erro, calendarId: id });

    await config.setJSON("agenda", { calendarId: id, salvoEm: new Date().toISOString() });
    return resposta(200, { success: true, ...(await lerAgenda()), teste });
};
