// netlify/functions/curtidas-api.js
//
// ⚠️ RECURSO REVERSÍVEL — contagem de curtidas do site.
// Se gerar gasto excessivo ou abuso, há 3 formas de desligar (da mais
// rápida para a mais definitiva). Veja também "Curtidas" no LEIA-ME.txt:
//   1) Painel admin > aba "Curtidas" > desmarcar "Curtidas ativas".
//      O site para de chamar esta function na hora (volta a guardar a
//      curtida só no navegador de quem curtiu, como era antes).
//   2) Netlify > Environment variables > CURTIDAS_DESATIVADAS = 1
//      (e novo deploy). A function passa a recusar tudo sem gravar nada.
//   3) Apagar este arquivo. O site continua funcionando (trata a falta
//      da function como "curtidas desligadas").
//
// Travas de custo já embutidas:
//   - LIMITE DIÁRIO de gravações (CURTIDAS_LIMITE_DIA, padrão 3000/dia):
//     passou disso, novas curtidas só ficam no navegador até o dia seguinte.
//   - RITMO por conexão: no máximo 20 curtidas a cada 10 minutos.
//   - 1 curtida por item por conexão (guarda só um código embaralhado
//     da conexão, nunca o IP).
//   - O GET (contagens) é cacheado no CDN por 30s: muitas visitas quase
//     não viram execuções da function.
//
//   GET  -> { ativo, itens: { <chave>: { n, titulo, tipo } } }
//           (logado no admin: + { uso: { hoje, limite } })
//   POST -> { chave, acao: "curtir" | "descurtir", titulo, tipo } -> { chave, total }

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const { adminLogado } = require("../lib/auth");

function criarStore(nome) {
    const opcoes = { name: nome, consistency: "strong" };
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
        opcoes.siteID = process.env.NETLIFY_SITE_ID;
        opcoes.token = process.env.NETLIFY_AUTH_TOKEN;
    }
    return getStore(opcoes);
}

const LIMITE_DIA = Math.max(1, parseInt(process.env.CURTIDAS_LIMITE_DIA || "3000", 10) || 3000);
const RITMO_MAX = 20;                 // curtidas por janela, por conexão
const RITMO_JANELA_MS = 10 * 60 * 1000;
const MAX_QUEM_POR_ITEM = 5000;       // quantos "códigos de conexão" guardar por item
const TENTATIVAS = 5;

const HEADERS = { "Content-Type": "application/json" };
const resposta = (statusCode, corpo, extra = {}) => ({ statusCode, headers: { ...HEADERS, ...extra }, body: JSON.stringify(corpo) });

const hash = (txt, tam = 16) => crypto.createHash("sha256").update(String(txt)).digest("hex").slice(0, tam);
const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // dia em horário de Brasília

function desligadoPorVariavel() {
    return /^(1|true|sim|yes)$/i.test(String(process.env.CURTIDAS_DESATIVADAS || ""));
}

// Desligado pelo painel? (conteudo-api -> recursos.curtidas === false)
async function desligadoPeloPainel() {
    try {
        const conteudo = await criarStore("conteudo").get("site", { type: "json" });
        return Boolean(conteudo && conteudo.recursos && conteudo.recursos.curtidas === false);
    } catch {
        return false;
    }
}

// Lê-modifica-grava com controle de concorrência (mesmo padrão do contador.js)
async function atualizar(store, chave, mudar, vazio) {
    for (let i = 0; i < TENTATIVAS; i++) {
        const atual = await store.getWithMetadata(chave, { type: "json" });
        const dados = atual && atual.data ? atual.data : JSON.parse(JSON.stringify(vazio));
        const resultado = mudar(dados);
        if (resultado === false) return dados; // nada a gravar
        const ok = await store.setJSON(chave, dados, atual ? { onlyIfMatch: atual.etag } : { onlyIfNew: true });
        if (ok) return dados;
    }
    throw new Error("Muitas curtidas ao mesmo tempo, tente de novo");
}

exports.handler = async function (event, context) {
    const user = adminLogado(context);
    const store = criarStore("curtidas");

    if (event.httpMethod === "GET") {
        const ativo = !desligadoPorVariavel() && !(await desligadoPeloPainel());
        let itens = {};
        try {
            const c = await store.get("contagem", { type: "json" });
            itens = (c && c.itens) || {};
        } catch { /* sem contagens ainda */ }

        const corpo = { ativo, itens };
        if (user) {
            let hoje = 0;
            try { hoje = ((await store.get(`uso/${hojeBR()}`, { type: "json" })) || {}).escritas || 0; } catch { /* ignora */ }
            corpo.uso = { hoje, limite: LIMITE_DIA, desligadoPorVariavel: desligadoPorVariavel() };
            return resposta(200, corpo, { "Cache-Control": "no-store" });
        }
        return resposta(200, corpo, { "Cache-Control": "public, max-age=30" });
    }

    if (event.httpMethod !== "POST") return resposta(405, { error: "Método não permitido" });

    if (desligadoPorVariavel() || (await desligadoPeloPainel())) {
        return resposta(403, { desativado: true, error: "Curtidas desativadas" });
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return resposta(400, { error: "JSON inválido" }); }

    const chave = String(body.chave || "").trim().slice(0, 300);
    const acao = body.acao === "descurtir" ? "descurtir" : body.acao === "curtir" ? "curtir" : "";
    if (!chave || !acao) return resposta(400, { error: "Informe 'chave' e 'acao'" });
    const titulo = String(body.titulo || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const tipo = ["youtube", "tiktok", "momentos"].includes(body.tipo) ? body.tipo : "";

    // código da conexão (IP + navegador, embaralhado; o IP não é guardado)
    const headers = event.headers || {};
    const ip = headers["x-nf-client-connection-ip"] || String(headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
    const quem = hash(`${ip}|${headers["user-agent"] || ""}|${process.env.CURTIDAS_SAL || process.env.NETLIFY_SITE_ID || "meny"}`);

    try {
        // 1) limite diário de gravações
        let estourou = false;
        await atualizar(store, `uso/${hojeBR()}`, (u) => {
            if (u.escritas >= LIMITE_DIA) { estourou = true; return false; }
            u.escritas += 1;
        }, { escritas: 0 });
        if (estourou) return resposta(429, { limite: true, error: "Limite diário de curtidas atingido" });

        // 2) ritmo por conexão
        let rapidoDemais = false;
        await atualizar(store, `ritmo/${quem}`, (r) => {
            const agora = Date.now();
            if (agora - r.inicio > RITMO_JANELA_MS) { r.inicio = agora; r.n = 0; }
            if (r.n >= RITMO_MAX) { rapidoDemais = true; return false; }
            r.n += 1;
        }, { inicio: Date.now(), n: 0 });
        if (rapidoDemais) return resposta(429, { error: "Muitas curtidas seguidas. Tente daqui a pouco." });

        // 3) 1 curtida por item por conexão
        let mudou = 0;
        await atualizar(store, `quem/${hash(chave, 24)}`, (q) => {
            const i = q.h.indexOf(quem);
            if (acao === "curtir") {
                if (i >= 0) return false;
                q.h.push(quem);
                if (q.h.length > MAX_QUEM_POR_ITEM) q.h.splice(0, q.h.length - MAX_QUEM_POR_ITEM);
                mudou = 1;
            } else {
                if (i < 0) return false;
                q.h.splice(i, 1);
                mudou = -1;
            }
        }, { h: [] });

        // 4) contagem geral
        const contagem = await atualizar(store, "contagem", (c) => {
            const atual = c.itens[chave] || { n: 0, titulo, tipo };
            if (!mudou && c.itens[chave]) return false;
            atual.n = Math.max(0, (atual.n || 0) + mudou);
            if (titulo) atual.titulo = titulo;
            if (tipo) atual.tipo = tipo;
            c.itens[chave] = atual;
        }, { itens: {} });

        return resposta(200, { chave, total: (contagem.itens[chave] && contagem.itens[chave].n) || 0 });
    } catch (err) {
        return resposta(503, { error: err.message });
    }
};
