// netlify/lib/auth.js
//
// Quem pode usar o painel admin.
//
// O Netlify confere a assinatura e a validade do login (token JWT) antes de
// chamar a function e entrega o usuário em context.clientContext.user.
// Aqui decidimos se esse usuário é ADMIN:
//
//   1) Usuário com a função (role) "admin" no Netlify Identity -> admin.
//   2) E-mail listado na variável ADMIN_EMAILS (separados por vírgula) -> admin.
//   3) Se ADMIN_EMAILS estiver VAZIA e ninguém tiver a role "admin":
//      modo compatível — qualquer usuário logado é aceito (como era antes).
//      Isso só é seguro com o cadastro do Identity em "Invite only".
//      O painel mostra um aviso enquanto estiver nesse modo.

function listaAdmins() {
    return String(process.env.ADMIN_EMAILS || "")
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

// Retorna { user, admin, modo } — modo: "role" | "lista" | "compativel" | "negado" | "anonimo"
function verificarAdmin(context) {
    const user = context && context.clientContext && context.clientContext.user;
    if (!user) return { user: null, admin: false, modo: "anonimo" };

    const roles = (user.app_metadata && user.app_metadata.roles) || [];
    if (Array.isArray(roles) && roles.includes("admin")) return { user, admin: true, modo: "role" };

    const lista = listaAdmins();
    if (lista.length) {
        const ok = lista.includes(String(user.email || "").toLowerCase());
        return { user, admin: ok, modo: ok ? "lista" : "negado" };
    }
    return { user, admin: true, modo: "compativel" };
}

// Atalho: usuário admin ou null (usar no lugar de context.clientContext.user)
function adminLogado(context) {
    const v = verificarAdmin(context);
    if (v.user && !v.admin) console.warn(`Acesso negado ao painel para ${v.user.email}`);
    return v.admin ? v.user : null;
}

module.exports = { verificarAdmin, adminLogado, listaAdmins };
