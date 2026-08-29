// netlify/functions/conteudo-api.js
//
// Guarda e serve o conteúdo editável das seções Home e Sobre (textos,
// foto e contadores). Segue o mesmo padrão de momentos-api.js:
//   GET  -> público, qualquer visitante pode ler (renderização do site)
//   POST -> exige usuário autenticado via Netlify Identity (painel admin)
//
// Armazenamento em Netlify Blobs, num único registro "site" dentro do
// store "conteudo" (não precisa de lista/índice como Momentos/TikTok
// porque é sempre um objeto único, não uma coleção).

const { getStore } = require("@netlify/blobs");

const STORE_NAME = "conteudo";
const CHAVE = "site";

// Conteúdo padrão — usado na primeira execução (antes de qualquer save)
// ou como fallback se o Blobs estiver indisponível. Mantém os mesmos
// textos que já existiam no HTML, para não haver "flash" de conteúdo
// diferente para quem já conhece o site.
const CONTEUDO_PADRAO = {
    home: {
        badge: "streaming • música • presença",
        paragrafo1:
            "Com mais de 40 anos vividos, encantando as pessoas com a minha voz nos momentos, dedico-me também ao streaming há quatro anos, onde transformo transmissões em momentos de pura alegria para o público.",
        paragrafo2:
            "Uma presença acolhedora, voz marcante e conteúdo pensado para aproximar pessoas.",
        typedStrings: ["cantora", "streaming ", "mãe"],
        imagem: "assets/images/Home/Home-Image.png",
    },
    about: {
        titulo: "Meu nome é meny mendonça.",
        paragrafo:
            "Recifense de coração vibrante, há mais de 20 anos transformo sonhos em realidade como empreendedora e encantando as pessoas com a minha voz nos momentos vagos. Mãe dedicada e apaixonada pela vida, encontrei no streaming - onde estou há mais 4 anos - uma nova forma de espalhar leveza. Minha missão? Levar alegria a cada tela e mostrar que a vida, quando vivida com um sorriso, é muito mais bonita.",
        sexo: "Feminino",
        idioma: "português",
        trabalho: "Streaming, empreendedora",
        imagem: "assets/images/About/About-Image.png",
        contadores: [
            { numero: 4, texto: "anos de | Streaming" },
            { numero: 20, texto: "anos | cantando" },
        ],
    },
};

function normalizarConteudo(dados) {
    // Faz um merge raso com o padrão, pra garantir que campos novos
    // (adicionados em atualizações futuras) sempre existam mesmo que
    // o registro salvo seja antigo.
    return {
        home: { ...CONTEUDO_PADRAO.home, ...(dados && dados.home) },
        about: { ...CONTEUDO_PADRAO.about, ...(dados && dados.about) },
    };
}

// Cria o store manualmente com siteID/token do .env quando disponíveis.
// Isso é necessário porque, em "netlify dev" com Node < 22, a injeção
// automática de contexto do Blobs não funciona (mesmo depois de "netlify
// link") — e é o mesmo motivo pelo qual NETLIFY_SITE_ID e
// NETLIFY_AUTH_TOKEN já existem no .env deste projeto para as outras
// functions que usam Blobs. Em produção (deploy real na Netlify) essas
// variáveis também precisam existir nas Environment Variables do site;
// se não existirem lá, cai automaticamente na injeção automática do
// próprio Netlify, que funciona normalmente em produção.
function criarStore() {
    const { NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN } = process.env;

    if (NETLIFY_SITE_ID && NETLIFY_AUTH_TOKEN) {
        return getStore({
            name: STORE_NAME,
            siteID: NETLIFY_SITE_ID,
            token: NETLIFY_AUTH_TOKEN,
        });
    }

    return getStore(STORE_NAME);
}

exports.handler = async (event, context) => {
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
    };

    const store = criarStore();

    if (event.httpMethod === "GET") {
        try {
            const dados = await store.get(CHAVE, { type: "json" });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(normalizarConteudo(dados)),
            };
        } catch (err) {
            // Blobs indisponível ou registro corrompido: devolve o
            // padrão em vez de quebrar o carregamento do site.
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(CONTEUDO_PADRAO),
            };
        }
    }

    if (event.httpMethod === "POST") {
        const user = context.clientContext && context.clientContext.user;
        if (!user) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: "Não autenticado" }),
            };
        }

        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (err) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "JSON inválido" }),
            };
        }

        if (!body.home || !body.about) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Envie os campos 'home' e 'about'" }),
            };
        }

        const conteudo = normalizarConteudo(body);

        try {
            await store.setJSON(CHAVE, conteudo);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, conteudo }),
            };
        } catch (err) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Falha ao salvar: " + err.message }),
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Método não permitido" }),
    };
};