let blogSwiper;

async function carregarBlog() {
    try {
        const response = await fetch("blog.json?v=" + new Date().getTime());
        const posts = await response.json();

        const container = document.getElementById("blog-dinamico");
        container.innerHTML = "";

        posts.forEach(post => {
            const slide = document.createElement("div");
            slide.className = "swiper-slide blog-item";

            const date = new Date(post.date).toLocaleDateString("pt-BR");

            let description = post.description || "";
            description = description.replace(/<[^>]*>?/gm, "");

            if (description.length > 120) {
                description = description.substring(0, 120) + "...";
            }

            slide.innerHTML = `
                <div class="image">
                    <img src="${post.thumbnail && post.thumbnail !== ''
                    ? post.thumbnail
                    : 'assets/images/Blogs/blog-1.png'
                }" alt="${post.platform}" />
                </div>

                <div class="content">
                    <div class="intro">
                        <h5>
                            <i class="fas fa-calendar-alt"></i>
                            <span>${date}</span>
                        </h5>
                        <h5>
                            <i class="fas fa-user"></i>
                            <span>por admin</span>
                        </h5>
                    </div>

                    <a class="main-heading" target="_blank" href="${post.url}">
                        ${post.title}
                    </a>

                    ${description ? `<p>${description}</p>` : ""}

                    <a target="_blank" href="${post.url}" class="btn">
                        Veja mais <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            `;

            container.appendChild(slide);
        });

        // 🔥 Destroi se já existir
        if (blogSwiper) {
            blogSwiper.destroy(true, true);
        }

        // 🚀 Recria o Swiper
        blogSwiper = new Swiper(".blog-slider", {
            spaceBetween: 20,
            loop: posts.length > 3, // 🔥 só ativa loop se tiver mais de 3 posts
            autoplay: posts.length > 1 ? {
                delay: 3000,
                disableOnInteraction: false,
            } : false,
            pagination: {
                el: ".swiper-pagination2",
                clickable: true,
            },
            breakpoints: {
                0: { slidesPerView: 1 },
                768: { slidesPerView: 2 },
                1024: { slidesPerView: 3 },
            },
        });

    } catch (error) {
        console.error("Erro ao carregar blog:", error);
    }
}

carregarBlog();