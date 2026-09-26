// netlify/functions/calendar.js
//
// Eventos da agenda do site (Google Agenda). Qual agenda: ver netlify/lib/agenda.js
// (painel admin > aba "Agenda"). Devolve só título, datas, descrição, local e link
// — nada de e-mails de quem criou/organiza os eventos.
//
// Cache: o CDN do Netlify guarda a resposta por 5 minutos, então muitas visitas
// viram poucas chamadas ao Google. Um evento novo aparece no site em até ~5 min.

const { lerAgenda, buscarEventos } = require("../lib/agenda");

exports.handler = async function () {
    const { calendarId } = await lerAgenda();
    const r = await buscarEventos(calendarId);
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            // em caso de erro, guarda por menos tempo para se recuperar rápido
            "Netlify-CDN-Cache-Control": r.ok ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60",
        },
        body: JSON.stringify({ items: r.itens }),
    };
};
