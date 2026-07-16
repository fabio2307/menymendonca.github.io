const fetch = require("node-fetch");

exports.handler = async (event) => {

    try {

        if (!event.body) {

            throw new Error(
                "Body vazio"
            );

        }

        const data = JSON.parse(event.body);

        const GITHUB_TOKEN =
            process.env.GITHUB_TOKEN;

        if (!GITHUB_TOKEN) {

            throw new Error(
                "GITHUB_TOKEN não configurado"
            );

        }

        const REPO =
            process.env.GITHUB_REPO;

        const FILE_PATH =
            "tiktok-manual.json";

        const BRANCH =
            "main";

        // Buscar arquivo atual

        const arquivo = await fetch(

            `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,

            {
                headers: {

                    Authorization:
                        `Bearer ${GITHUB_TOKEN}`,

                    Accept:
                        "application/vnd.github+json"

                }

            }

        );

        if (!REPO) {

            throw new Error(
                "GITHUB_REPO não configurado"
            );

        }

        let sha = null;

        if (arquivo.ok) {

            const json =
                await arquivo.json();

            sha =
                json.sha;

        }

        const content =
            Buffer
                .from(
                    JSON.stringify(
                        data,
                        null,
                        2
                    )
                )
                .toString("base64");

        const salvar =
            await fetch(

                `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,

                {

                    method: "PUT",

                    headers: {

                        Authorization:
                            `token ${GITHUB_TOKEN}`,
                        Accept:
                            "application/vnd.github+json",
                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        message:
                            "Atualizando TikTok",
                        content,
                        sha,
                        branch:
                            BRANCH

                    })

                }
            );

        const retorno =
            await salvar.json();

        if (!salvar.ok) {

            throw new Error(
                JSON.stringify(retorno)
            );

        }

        return {

            statusCode: 200,
            body: JSON.stringify({

                success: true
            })

        };

    } catch (error) {

        console.error(
            "ERRO:",
            error
        );

        return {

            statusCode: 500,

            body: JSON.stringify({

                success: false,
                error: error.message

            })

        };

    }

};