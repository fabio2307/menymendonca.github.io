const fetch = require("node-fetch");

const FILE_PATH = "tiktok-manual.json";
const TIKTOK_URL_REGEX = /^(https?:\/\/)?(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i;

function normalizarUrl(url) {
    try {
        const u = new URL(url.trim());

        // mantém pathname + remove tracking pesado
        return `${u.origin}${u.pathname}`;
    } catch {
        return "";
    }
}

exports.handler = async (event, context) => {

    try {

        // 🔐 VALIDAÇÃO DE AUTENTICAÇÃO
        const user = context.clientContext && context.clientContext.user;

        if (!user) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    success: false,
                    error: "Não autenticado"
                })
            };
        }

        if (event.httpMethod !== "POST") {
            return {
                statusCode: 405,
                body: JSON.stringify({
                    success: false,
                    error: "Método não permitido"
                })
            };
        }

        if (!event.body) {
            throw new Error("Body vazio");
        }

        const data = JSON.parse(event.body);

        if (!Array.isArray(data.videos)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: "Formato inesperado: 'videos' precisa ser um array"
                })
            };
        }

        const urlsInvalidas = data.videos.filter(
            v => !v || typeof v.url !== "string" || !TIKTOK_URL_REGEX.test(v.url)
        );

        if (urlsInvalidas.length) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: `${urlsInvalidas.length} link(s) não parecem ser URLs válidas do TikTok`
                })
            };
        }

        const vistos = new Set();
        const videos = [];

        for (const v of data.videos) {
            const urlLimpa = normalizarUrl(v.url);
            if (!urlLimpa || vistos.has(urlLimpa)) continue;
            vistos.add(urlLimpa);
            videos.push({ ...v, url: urlLimpa });
        }

        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        if (!GITHUB_TOKEN) {
            throw new Error("GITHUB_TOKEN não configurado nas variáveis de ambiente do Netlify");
        }

        const REPO_RAW = process.env.GITHUB_REPO;
        if (!REPO_RAW) {
            throw new Error("GITHUB_REPO não configurado nas variáveis de ambiente do Netlify");
        }

        // Tolera a variável vir como URL completa por engano
        // (ex: "https://github.com/usuario/repositorio" ou com ".git" no
        // final) em vez do formato esperado "usuario/repositorio".
        const REPO = REPO_RAW
            .trim()
            .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
            .replace(/\.git$/i, "")
            .replace(/\/+$/, "");

        const githubHeaders = {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
        };

        // 🔎 DESCOBRE O BRANCH PADRÃO DO REPOSITÓRIO em vez de assumir "main"
        // -- muitos repositórios usam "master" ou outro nome, e isso causava
        // 404 na hora de salvar mesmo com REPO/token corretos.
        const repoInfo = await fetch(
            `https://api.github.com/repos/${REPO}`,
            { headers: githubHeaders }
        );

        if (!repoInfo.ok) {
            const erro = await repoInfo.text();
            throw new Error(
                `Repositório "${REPO}" não encontrado ou sem acesso (${repoInfo.status}). ` +
                `Verifique se GITHUB_REPO está no formato "usuario/repositorio" (confira maiúsculas/minúsculas) ` +
                `e se o token tem acesso de leitura/escrita a esse repositório especificamente. Detalhe: ${erro}`
            );
        }

        const repoJson = await repoInfo.json();
        const BRANCH = repoJson.default_branch || "main";

        // Buscar arquivo atual (usando o branch padrão detectado)
        const arquivo = await fetch(
            `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
            { headers: githubHeaders }
        );

        let sha = null;
        if (arquivo.ok) {
            const json = await arquivo.json();
            sha = json.sha;
        } else if (arquivo.status !== 404) {
            const erro = await arquivo.text();
            throw new Error(`Falha ao ler arquivo atual (${arquivo.status}): ${erro}`);
        }

        const conteudoFinal = { videos };
        const content = Buffer.from(JSON.stringify(conteudoFinal, null, 2)).toString("base64");

        const salvar = await fetch(
            `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
            {
                method: "PUT",
                headers: {
                    ...githubHeaders,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: `Atualizando TikTok (via painel, usuário: ${user.email || "desconhecido"})`,
                    content,
                    sha,
                    branch: BRANCH,
                }),
            }
        );

        const retorno = await salvar.json();

        if (!salvar.ok) {
            throw new Error(
                `Falha ao salvar no branch "${BRANCH}" (${salvar.status}): ${JSON.stringify(retorno)}`
            );
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, videos, branch: BRANCH }),
        };

    } catch (error) {
        console.error("ERRO:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    }
};