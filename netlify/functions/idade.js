// netlify/functions/idade.js
//
// Calcula a idade no servidor a partir da variável de ambiente IDADE_NASC.
// Configure IDADE_NASC no painel do Netlify:
// Site settings > Environment variables > Add a variable
//   Key:   IDADE_NASC
//   Value: 1900-12-31   (sua data real, formato AAAA-MM-DD)
//
// Nunca coloque a data direto no código nem no HTML: só o resultado
// (a idade) deve chegar ao navegador.

function calcularIdade(dataNascimento) {
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);

    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();

    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
    }

    return idade;
}

exports.handler = async function () {
    const dataNascimento = process.env.IDADE_NASC;

    if (!dataNascimento) {
        return {
            statusCode: 500,
            body: JSON.stringify({ erro: "IDADE_NASC não configurada nas variáveis de ambiente do Netlify" }),
        };
    }

    const nascimento = new Date(dataNascimento);
    if (isNaN(nascimento.getTime())) {
        return {
            statusCode: 500,
            body: JSON.stringify({ erro: "IDADE_NASC inválida" }),
        };
    }

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idade: calcularIdade(dataNascimento) }),
    };
};