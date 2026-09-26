// netlify/lib/agenda.js
//
// Agenda do site = Google Agenda (os eventos continuam sendo criados lá).
// Qual agenda o site lê (nesta ordem):
//   1) Painel admin > aba "Agenda" (Netlify Blobs, store "config", chave "agenda")
//   2) Variável de ambiente CALENDAR_ID
//   3) A agenda que já era usada (ID_PADRAO abaixo)
// A chave do Google continua só na variável API_KEY (segredo, nunca vai ao painel).

const { getStore } = require("@netlify/blobs");

const ID_PADRAO = "c56f0345c8a935d9d4c595146ab880a8a72983c0196a5b35428c292f3e74eb9b@group.calendar.google.com";
const FORMATO_ID = /^[\w.+-]+@([\w-]+\.)*(google\.com|gmail\.com|googlemail\.com)$|^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i;

function criarStore(nome) {
    const opcoes = { name: nome, consistency: "strong" };
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
        opcoes.siteID = process.env.NETLIFY_SITE_ID;
        opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
    }
    return getStore(opcoes);
}

async function lerAgenda() {
    let salvo = null;
    try { salvo = await criarStore("config").get("agenda", { type: "json" }); } catch { salvo = null; }
    const doPainel = salvo && salvo.calendarId;
    return {
        calendarId: doPainel || process.env.CALENDAR_ID || ID_PADRAO,
        origem: doPainel ? "painel" : process.env.CALENDAR_ID ? "variavel" : "padrao",
        chaveConfigurada: Boolean(process.env.API_KEY),
    };
}

// Aceita: o ID da agenda, o link "incorporar" (?src=), o link de
// compartilhamento (?cid= em base64) ou o endereço iCal público.
function extrairId(entrada) {
    let t = String(entrada || "").trim();
    if (!t) return "";
    try {
        const u = new URL(t);
        if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
        const src = u.searchParams.get("src");
        const cid = u.searchParams.get("cid");
        const ical = u.pathname.match(/\/calendar\/ical\/([^/]+)\//);
        if (src) t = src;
        else if (cid) {
            t = cid.includes("@") ? cid : Buffer.from(cid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        } else if (ical) t = decodeURIComponent(ical[1]);
        else return null;
    } catch { /* não é link: deve ser o próprio ID */ }
    t = decodeURIComponent(t).trim();
    return FORMATO_ID.test(t) ? t : null;
}

// Só o que o site mostra — nunca repassar criador/organizador (e-mails) etc.
function limparEvento(ev) {
    return {
        summary: String(ev.summary || "").slice(0, 200),
        description: String(ev.description || "").slice(0, 3000),
        location: String(ev.location || "").slice(0, 300),
        start: ev.start ? { dateTime: ev.start.dateTime, date: ev.start.date } : null,
        end: ev.end ? { dateTime: ev.end.dateTime, date: ev.end.date } : null,
        htmlLink: /^https:\/\/(www\.)?google\.com\/calendar\//.test(ev.htmlLink || "") ? ev.htmlLink : "",
    };
}

async function buscarEventos(calendarId, max = 250) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return { ok: false, status: 0, erro: "A variável API_KEY (chave do Google) não está configurada no Netlify.", itens: [] };
    const params = new URLSearchParams({
        key: apiKey,
        timeMin: new Date().toISOString(),
        singleEvents: "true",   // expande eventos que se repetem
        orderBy: "startTime",
        maxResults: String(max),
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    try {
        const resp = await fetch(url);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data.items)) {
            console.error("Google Calendar API respondeu com erro:", resp.status, JSON.stringify(data && data.error || {}));
            const erro = resp.status === 404 ? "Agenda não encontrada. Confira o ID e se ela está marcada como pública (Configurações da agenda > Permissões de acesso > Disponibilizar publicamente)."
                : resp.status === 403 || resp.status === 400 ? "O Google recusou a chave (API_KEY). Confira se a chave é válida e se a Google Calendar API está ativada."
                : `O Google respondeu com erro ${resp.status}.`;
            return { ok: false, status: resp.status, erro, itens: [] };
        }
        return { ok: true, status: 200, titulo: data.summary || "", itens: data.items.map(limparEvento) };
    } catch (err) {
        console.error("Falha ao buscar Google Calendar:", err.message);
        return { ok: false, status: 0, erro: "Não consegui falar com o Google agora.", itens: [] };
    }
}

module.exports = { ID_PADRAO, criarStore, lerAgenda, extrairId, buscarEventos, limparEvento };
