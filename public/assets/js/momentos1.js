document.addEventListener("DOMContentLoaded", function () {

    fetch("/assets/data/momentos.json")
        .then(res => res.json())
        .then(data => {

            const container = document.getElementById("portfolio-container");
            container.innerHTML = "";

            data.items.forEach(item => {

                const div = document.createElement("div");

                // CLASSE CORRETA PARA MIXITUP
                div.className = `portfolio-item mix ${item.categoria}`;

                div.innerHTML = `
                    <img src="${item.imagem}" alt="${item.titulo}" />
                    <div class="content">
                        <h4>${item.titulo}</h4>
                        <p>${item.categoria}</p>
                    </div>
                `;

                container.appendChild(div);
            });

            // 🔥 INICIALIZAÇÃO CORRETA
            const mixer = mixitup('#portfolio-container', {
                selectors: {
                    target: '.portfolio-item'
                },
                animation: {
                    duration: 300
                }
            });

            // 🔥 CONTROLES MANUAIS (GARANTE FUNCIONAMENTO)
            document.querySelectorAll('.control').forEach(btn => {
                btn.addEventListener('click', function () {

                    document.querySelector('.control.active')?.classList.remove('active');
                    this.classList.add('active');

                    const filter = this.getAttribute('data-filter');
                    mixer.filter(filter);
                });
            });

        })
        .catch(err => console.error("Erro:", err));
});