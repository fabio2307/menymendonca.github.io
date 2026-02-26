let blogSwiper;

async function carregarBlog() {
    try {
        const response = await fetch("blog.json");
        const posts = await response.json();

        const container = document.getElementById("blog-dinamico");
        container.innerHTML = "";

        posts.forEach(post => {
            const slide = document.createElement("div");
            slide.className = "swiper-slide blog-item";

            const date = new Date(post.date).toLocaleDateString("pt-BR");

            let description = post.description || post.content || "";
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
            <h5><i class="fas fa-calendar-alt"></i>
              <span>${date}</span>
            </h5>
            <h5><i class="fas fa-user"></i>
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

        // 🔥 Destrói swiper antigo se existir
        if (blogSwiper) {
            blogSwiper.destroy(true, true);
        }


    } catch (error) {
        console.error("Erro ao carregar blog:", error);
    }
}

carregarBlog();