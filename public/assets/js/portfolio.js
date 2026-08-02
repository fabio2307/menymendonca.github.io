document.addEventListener("DOMContentLoaded", () => {
    fetch("assets/data/momentos.json")
        .then((res) => res.json())
        .then((data) => {
            const container = document.getElementById("portfolio-container");
            if (!container) return;

            container.innerHTML = "";

            data.items.forEach((item) => {
                const div = document.createElement("div");

                div.className = `portfolio-item ${item.categoria}`;

                div.innerHTML = `
          <img src="${item.imagem}" />
          <div class="content">
            <h4>${item.titulo}</h4>
            <p>${item.categoria}</p>
          </div>
        `;

                container.appendChild(div);
            });

            if (typeof mixitup !== "undefined") {
                mixitup(".box-container");
            }
        })
        .catch(console.error);
});