document.addEventListener("DOMContentLoaded", function () {

    fetch("assets/data/momentos.json")
        .then(response => response.json())
        .then(data => {

            const container = document.getElementById("portfolio-container");
            container.innerHTML = "";

            data.forEach(item => {

                const div = document.createElement("div");
                div.className = `portfolio-item image ${item.categoria}`;

                div.innerHTML = `
                    <img src="${item.imagem}" alt="${item.titulo}" />
                    <div class="content">
                        <h4>${item.titulo}</h4>
                        <p>${item.categoria}</p>
                        <a data-effect="mfp-newspaper"
                           href="${item.imagem}"
                           class="view-btn">
                           <i class="fas fa-search-plus"></i>
                        </a>
                    </div>
                `;

                container.appendChild(div);
            });

            // Reativar filtro (se estiver usando MixItUp ou Isotope)
            if (typeof mixitup !== "undefined") {
                mixitup('.box-container');
            }

        })
        .catch(error => console.error("Erro ao carregar JSON:", error));

});