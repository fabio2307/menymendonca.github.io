// netlify/functions/admin-check.js
//
// O painel chama isto logo depois do login para saber se a conta tem
// permissão de admin (ver netlify/lib/auth.js). Não devolve nada sensível.

const { verificarAdmin } = require("../lib/auth");

exports.handler = async function (event, context) {
    const v = verificarAdmin(context);
    const status = v.user ? (v.admin ? 200 : 403) : 401;
    return {
        statusCode: status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
            logado: Boolean(v.user),
            admin: v.admin,
            // "compativel" = ADMIN_EMAILS vazia: qualquer conta logada entra
            modo: v.modo,
        }),
    };
};
