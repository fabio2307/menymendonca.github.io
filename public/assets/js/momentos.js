let mixer = null;

// Remove acentos, espaços e deixa minúsculo, para casar exatamente
// com os seletores usados nos botões de filtro (.familia, .passeio, etc.)
function normalizarCategoria(str) {
    return (str || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")   // remove acentos
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");             // espaços -> hífen, caso existam categorias compostas
}

function escaparHtml(texto) {
    return String(texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", function () {

    // Trava para evitar que o script rode a inicialização duas vezes
    // (ex.: live-reload do "netlify dev" injetando o script mais de uma vez,
    // o que criaria dois mixers + dois listeners por botão e causaria o
    // aviso "MixItUp instance was busy / queue is full" a cada clique)
    if (window.__portfolioMomentosInit) {
        return;
    }
    window.__portfolioMomentosInit = true;

    const container = document.getElementById("portfolio-container");

    // Vem da API (Netlify Blobs) agora, não mais de um JSON gravado via
    // git — atualiza na hora, sem depender de deploy.
    fetch("/.netlify/functions/momentos-api", { cache: "no-store" })
        .then(response => {
            if (!response.ok) {
                throw new Error(`momentos.json respondeu ${response.status}`);
            }
            return response.json();
        })
        .then(data => {

            if (!container) return;

            const items = Array.isArray(data.items) ? data.items : [];

            if (!items.length) {
                container.innerHTML = `<p class="portfolio-empty">Nenhum momento publicado ainda.</p>`;
                return;
            }

            container.innerHTML = "";

            items.forEach(item => {

                const categoriaNormalizada = normalizarCategoria(item.categoria);

                const div = document.createElement("div");

                // classe usada pelo filtro agora é sempre normalizada
                div.className = `mix portfolio-item image ${categoriaNormalizada}`;
                // guarda o texto original para exibir no card
                div.dataset.categoriaOriginal = item.categoria;

                div.innerHTML = `
                    <img src="${escaparHtml(item.imagem)}" alt="${escaparHtml(item.titulo)}" loading="lazy" />
                    <div class="content">
                        <h4>${escaparHtml(item.titulo)}</h4>
                        <p>${escaparHtml(item.categoria)}</p>
                        <a href="${escaparHtml(item.imagem)}" class="view-btn" aria-label="Ampliar imagem: ${escaparHtml(item.titulo)}">
                            <i class="fas fa-search-plus"></i>
                        </a>
                    </div>
                `;

                container.appendChild(div);
            });

            // ✅ inicia MixItUp
            mixer = mixitup('#portfolio-container', {
                selectors: {
                    target: '.mix'
                },
                animation: {
                    duration: 300,
                    queue: true,
                    queueLimit: 3   // margem maior, evita rejeitar cliques em sequência
                }
            });

            // ✅ botão ativo
            // Seleciona o <button> real dentro de cada <li class="button">
            // (estrutura trocada no HTML para permitir foco/ativação via
            // teclado). O <li> continua existindo só como item de lista.
            const buttons = document.querySelectorAll('.controls .button .btn');

            buttons.forEach(btn => {
                btn.addEventListener('click', function () {

                    // ignora o clique se já existe uma animação em andamento
                    // (evita o warning "MixItUp instance was busy")
                    if (mixer.isMixing()) {
                        return;
                    }

                    buttons.forEach(b => {
                        b.classList.remove('active');
                        // Os botões de filtro viraram <button> reais (ver
                        // index.html) para funcionar com teclado (Tab +
                        // Enter/Espaço). aria-pressed comunica o estado
                        // "ativo" para leitores de tela, já que a classe
                        // .active sozinha é só visual.
                        b.setAttribute('aria-pressed', 'false');
                    });
                    this.classList.add('active');
                    this.setAttribute('aria-pressed', 'true');

                    // normaliza também o valor do data-filter, por segurança
                    // (ex.: ".familia" continua ".familia", mas evita problemas
                    // se algum dia o HTML vier com acento/maiúscula)
                    const filtroBruto = this.getAttribute('data-filter');

                    // Guarda defensiva: se por algum motivo o elemento clicado
                    // não tiver data-filter (ex.: HTML e JS fora de sincronia
                    // após um deploy parcial, ou cache de navegador servindo
                    // uma versão antiga de um dos dois arquivos), evita o
                    // TypeError "Cannot read properties of null" e avisa no
                    // console em vez de quebrar a página.
                    if (!filtroBruto) {
                        console.warn(
                            "Filtro de portfólio: elemento clicado não tem data-filter.",
                            this
                        );
                        return;
                    }

                    const filtro = filtroBruto === 'all'
                        ? 'all'
                        : '.' + normalizarCategoria(filtroBruto.replace('.', ''));

                    mixer.filter(filtro).catch((erro) => {
                        // Fila cheia (comportamento esperado, ver queueLimit acima)
                        // não deveria travar a UI; qualquer outro erro (ex.:
                        // seletor inválido) é logado para não passar em silêncio.
                        console.warn("Filtro de portfólio não aplicado:", erro);
                    });
                });
            });

            // ✅ inicializa popup
            initPopup();

        })
        .catch(error => {
            console.error("Erro ao carregar JSON:", error);
            if (container) {
                container.innerHTML = `<p class="portfolio-empty">Não foi possível carregar os momentos agora.</p>`;
            }
        });

});


// 🔥 POPUP COM BOTÃO DE FECHAR GARANTIDO
function initPopup() {
    if (typeof $.fn.magnificPopup === "undefined") {
        console.warn("Magnific Popup não carregado");
        return;
    }

    $('.view-btn').magnificPopup({
        type: 'image',
        gallery: {
            enabled: true
        },

        // fechamento sempre disponível, mesmo se algo bloquear o botão visual
        closeOnBgClick: true,   // clicar fora da imagem fecha
        enableEscapeKey: true,  // tecla Esc fecha
        closeOnContentClick: false,

        showCloseBtn: true,
        closeBtnInside: true,

        // marcação própria do botão de fechar, garantindo que ele sempre exista
        // e fique acima de qualquer outro elemento (evita casos em que o CSS
        // do tema esconde ou sobrepõe o botão padrão do plugin)
        closeMarkup: '<button title="Fechar (Esc)" type="button" class="mfp-close">&#215;</button>',

        // OBS: o efeito "zoom" foi removido de propósito.
        // Ele calcula a posição do elemento de origem (_getOffset) para animar
        // a imagem "crescendo" a partir do card clicado, mas quebra quando os
        // itens são inseridos dinamicamente (nosso caso, via JSON + MixItUp),
        // gerando "Cannot read properties of undefined (reading 'top')".
        mainClass: 'mfp-fade',
        removalDelay: 300
    });
}