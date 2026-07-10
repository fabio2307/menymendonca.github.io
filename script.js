let blogSwipers = {};

function limparTexto(texto) {
  return (texto || "").replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
}

function truncarTexto(texto, limite = 120) {
  if (!texto) return "";
  return texto.length > limite ? `${texto.substring(0, limite)}...` : texto;
}

function criarSlideVazio(mensagem, linkTexto, linkUrl) {
  return `
    <div class="swiper-slide blog-item blog-item--empty">
      <div class="content">
        <span class="platform-tag platform-tag--empty">Atualização em breve</span>
        <h4>${mensagem}</h4>
        <p>Assim que o feed atualizar, este carrossel vai exibir os últimos conteúdos.</p>
        <a target="_blank" rel="noopener noreferrer" href="${linkUrl}" class="btn">
          ${linkTexto} <i class="fas fa-arrow-right"></i>
        </a>
      </div>
    </div>
  `;
}

function renderizarSlides(container, posts, fallbackConfig) {
  if (!container) return [];

  const items = Array.isArray(posts) ? posts : [];

  if (!items.length) {
    container.innerHTML = criarSlideVazio(
      fallbackConfig.emptyTitle,
      fallbackConfig.ctaLabel,
      fallbackConfig.ctaUrl
    );
    return [];
  }

  container.innerHTML = items.map(post => {
    const date = post.date ? new Date(post.date).toLocaleDateString("pt-BR") : "";
    const description = truncarTexto(limparTexto(post.description || post.content || ""));
    const platformClass = (post.platform || fallbackConfig.platform).toLowerCase().replace(/\s+/g, "-");
    const thumbnail = post.thumbnail && post.thumbnail !== ""
      ? post.thumbnail
      : fallbackConfig.fallbackImage;

    return `
      <div class="swiper-slide blog-item blog-item--${platformClass}">
        <div class="image">
          <img src="${thumbnail}" alt="${post.platform || fallbackConfig.platform}" />
        </div>

        <div class="content">
          <div class="intro">
            <h5><i class="fas fa-calendar-alt"></i><span>${date}</span></h5>
            <h5><i class="fas fa-user"></i><span>${post.platform || fallbackConfig.platform}</span></h5>
          </div>

          <a class="main-heading" target="_blank" rel="noopener noreferrer" href="${post.url}">
            ${post.title}
          </a>

          ${description ? `<p>${description}</p>` : ""}

          <a target="_blank" rel="noopener noreferrer" href="${post.url}" class="btn">
            Veja mais <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      </div>
    `;
  }).join("");

  return posts;
}

function iniciarSwiper(selector, paginationSelector) {
  if (blogSwipers[selector]) {
    blogSwipers[selector].destroy(true, true);
  }

  blogSwipers[selector] = new Swiper(selector, {
    spaceBetween: 20,
    loop: true,
    observer: true,
    observeParents: true,
    watchOverflow: true,
    autoplay: {
      delay: 2500,
      disableOnInteraction: false,
    },
    pagination: {
      el: paginationSelector,
      clickable: true,
    },
    breakpoints: {
      0: { slidesPerView: 1 },
      768: { slidesPerView: 1 },
      1024: { slidesPerView: 1 },
    },
  });
}

async function carregarBlog() {
  const configTikTok = {
    platform: "TikTok",
    emptyTitle: "Ainda não há posts de TikTok carregados.",
    ctaLabel: "abrir perfil",
    ctaUrl: "https://www.tiktok.com/@meny.menycita",
    fallbackImage: "assets/images/Blogs/blog-1.png",
  };

  const configYouTube = {
    platform: "YouTube",
    emptyTitle: "Ainda não há vídeos do YouTube carregados.",
    ctaLabel: "abrir canal",
    ctaUrl: "https://www.youtube.com/@menymendonca4269",
    fallbackImage: "assets/images/Blogs/blog-2.png",
  };

  try {
    const response = await fetch("blog.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Falha ao carregar blog.json (${response.status})`);
    }

    const posts = await response.json();
    const postsValidos = Array.isArray(posts) ? posts : [];

    const grupos = postsValidos.reduce((acc, post) => {
      const key = (post.platform || "").toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(post);
      return acc;
    }, {});

    const tiktokPosts = (grupos.tiktok || []).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
    const youtubePosts = (grupos.youtube || []).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    renderizarSlides(document.getElementById("blog-tiktok-dinamico"), tiktokPosts, configTikTok);
    renderizarSlides(document.getElementById("blog-youtube-dinamico"), youtubePosts, configYouTube);
  } catch (error) {
    console.error("Erro ao carregar blog:", error);
    renderizarSlides(document.getElementById("blog-tiktok-dinamico"), [], configTikTok);
    renderizarSlides(document.getElementById("blog-youtube-dinamico"), [], configYouTube);
  } finally {
    iniciarSwiper(".blog-slider--tiktok", ".swiper-pagination-tiktok");
    iniciarSwiper(".blog-slider--youtube", ".swiper-pagination-youtube");
  }
}

document.addEventListener("DOMContentLoaded", carregarBlog);

