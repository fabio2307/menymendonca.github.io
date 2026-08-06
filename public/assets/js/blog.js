let blogSwipers = {};

function limparTexto(texto) {
  return (texto || "").replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
}

function truncarTexto(texto, limite = 120) {
  if (!texto) return "";
  return texto.length > limite ? `${texto.substring(0, limite)}...` : texto;
}

function escaparHtml(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isUrlTikTok(url) {
  // Inclui vt.tiktok.com (comum em links compartilhados pelo app),
  // além de tiktok.com e vm.tiktok.com.
  return /tiktok\.com|v[mt]\.tiktok\.com/i.test(url || "");
}

function normalizarUrlTikTok(url) {
  return (url || "").trim().split("?")[0];
}

function criarSlideVazio(mensagem, linkTexto, linkUrl) {
  return `
    <div class="swiper-slide blog-item blog-item--empty">
      <div class="content">
        <span class="platform-tag platform-tag--empty">Atualização em breve</span>
        <h4>${escaparHtml(mensagem)}</h4>
        <p>Assim que o feed atualizar, este carrossel vai exibir os últimos conteúdos.</p>
        <a target="_blank" rel="noopener noreferrer" href="${escaparHtml(linkUrl)}" class="btn">
          ${escaparHtml(linkTexto)} <i class="fas fa-arrow-right"></i>
        </a>
      </div>
    </div>
  `;
}

function renderizarSlides(container, posts, fallbackConfig) {
  if (!container) return 0;

  const items = Array.isArray(posts) ? posts : [];

  if (!items.length) {
    container.innerHTML = criarSlideVazio(
      fallbackConfig.emptyTitle,
      fallbackConfig.ctaLabel,
      fallbackConfig.ctaUrl
    );
    return 0;
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
          <img src="${escaparHtml(thumbnail)}" alt="${escaparHtml(post.platform || fallbackConfig.platform)}" loading="lazy" />
        </div>

        <div class="content">
          <div class="intro">
            <h5><i class="fas fa-calendar-alt"></i><span>${date}</span></h5>
            <h5><i class="fas fa-user"></i><span>${escaparHtml(post.platform || fallbackConfig.platform)}</span></h5>
          </div>

          <a class="main-heading" target="_blank" rel="noopener noreferrer" href="${escaparHtml(post.url)}">
            ${escaparHtml(post.title || post.platform || fallbackConfig.platform)}
          </a>

          ${description ? `<p>${escaparHtml(description)}</p>` : ""}

          <a target="_blank" rel="noopener noreferrer" href="${escaparHtml(post.url)}" class="btn">
            Veja mais <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      </div>
    `;
  }).join("");

  return items.length;
}

function iniciarSwiper(selector, paginationSelector, slideCount) {
  if (blogSwipers[selector]) {
    blogSwipers[selector].destroy(true, true);
  }

  const podeLoop = slideCount > 1;

  blogSwipers[selector] = new Swiper(selector, {
    spaceBetween: 20,
    loop: podeLoop,
    observer: true,
    observeParents: true,
    watchOverflow: true,
    autoplay: podeLoop ? {
      delay: 2500,
      disableOnInteraction: false,
    } : false,
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

function normalizarPostTikTok(item) {
  const bruto = typeof item === "string" ? { url: item } : item;
  const url = normalizarUrlTikTok(bruto?.url);

  if (!url || !isUrlTikTok(url)) return null;

  return {
    platform: "TikTok",
    title: bruto.titulo || "Vídeo TikTok",
    url,
    thumbnail: bruto.thumbnail || "",
    description: bruto.descricao || "",
    date: bruto.date || new Date().toISOString(),
  };
}

async function carregarTikTokManual() {
  try {
    // Precisa bater exatamente com o FILE_PATH usado pela function de
    // salvamento (netlify/functions/salvar-tiktok.js ou equivalente):
    // "assets/data/tiktok-manual.json". Esse arquivo NÃO fica na raiz
    // publicada — buscar "/tiktok-manual.json" sempre retorna 404/JSON
    // antigo, porque é um arquivo diferente do que a function grava.
    const response = await fetch("/assets/data/tiktok-manual.json", { cache: "no-store" });
    if (!response.ok) return [];

    const data = await response.json().catch(() => ({}));
    const videos = Array.isArray(data) ? data : (data.videos || []);

    return videos
      .map(normalizarPostTikTok)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function buscarMetaTikTok(url) {
  try {
    // Passa pela function-proxy (netlify/functions/tiktok-oembed.js) em vez
    // de chamar tiktok.com/oembed direto do navegador — evita depender do
    // CORS do TikTok, que pode variar por navegador/região.
    const response = await fetch(
      `/.netlify/functions/tiktok-oembed?url=${encodeURIComponent(url)}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: data.title || "",
      thumbnail: data.thumbnail_url || "",
      author: data.author_name || "",
    };
  } catch {
    return null;
  }
}

async function enriquecerTikTok(posts) {
  return Promise.all(
    posts.map(async post => {
      if (post.thumbnail) return post;

      const meta = await buscarMetaTikTok(post.url);
      if (!meta) return post;

      return {
        ...post,
        title: post.title === "Vídeo TikTok" && meta.title ? meta.title : post.title,
        thumbnail: meta.thumbnail || post.thumbnail,
        description: meta.author ? `@${meta.author}` : post.description,
      };
    })
  );
}

function mesclarPosts(listaA, listaB) {
  const mapa = new Map();

  [...listaA, ...listaB].forEach(post => {
    if (!post?.url) return;

    const existente = mapa.get(post.url);

    if (!existente) {
      mapa.set(post.url, post);
      return;
    }

    // Mescla mantendo os melhores dados disponíveis de cada fonte,
    // em vez de deixar o último item da lista apagar thumbnail/título
    // já enriquecidos que vieram do blog.json.
    mapa.set(post.url, {
      ...existente,
      ...post,
      title: (post.title && post.title !== "Vídeo TikTok") ? post.title : (existente.title || post.title),
      thumbnail: post.thumbnail || existente.thumbnail,
      description: post.description || existente.description,
      date: post.date || existente.date,
    });
  });

  return Array.from(mapa.values()).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
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

  const containerTikTok = document.getElementById("blog-tiktok-dinamico");
  const containerYouTube = document.getElementById("blog-youtube-dinamico");

  try {
    const [blogResponse, manualTikTok] = await Promise.all([
      fetch("/blog.json", { cache: "no-store" }).catch(() => ({ ok: false })),
      carregarTikTokManual(),
    ]);

    let postsValidos = [];

    if (blogResponse.ok) {
      const posts = await blogResponse.json().catch(() => []);
      postsValidos = Array.isArray(posts) ? posts : [];
    }

    const grupos = postsValidos.reduce((acc, post) => {
      const key = (post.platform || "").toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(post);
      return acc;
    }, {});

    let tiktokPosts = mesclarPosts(grupos.tiktok || [], manualTikTok).slice(0, 6);
    const youtubePosts = (grupos.youtube || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);

    const totalTikTok = renderizarSlides(containerTikTok, tiktokPosts, configTikTok);
    const totalYouTube = renderizarSlides(containerYouTube, youtubePosts, configYouTube);

    iniciarSwiper(".blog-slider--tiktok", ".swiper-pagination-tiktok", totalTikTok);
    iniciarSwiper(".blog-slider--youtube", ".swiper-pagination-youtube", totalYouTube);

    if (tiktokPosts.length) {
      enriquecerTikTok(tiktokPosts).then(enriched => {
        const total = renderizarSlides(containerTikTok, enriched, configTikTok);
        iniciarSwiper(".blog-slider--tiktok", ".swiper-pagination-tiktok", total);
      });
    }
  } catch (error) {
    console.error("Erro ao carregar blog:", error);
    const totalTikTok = renderizarSlides(containerTikTok, [], configTikTok);
    const totalYouTube = renderizarSlides(containerYouTube, [], configYouTube);
    iniciarSwiper(".blog-slider--tiktok", ".swiper-pagination-tiktok", totalTikTok);
    iniciarSwiper(".blog-slider--youtube", ".swiper-pagination-youtube", totalYouTube);
  }
}

// ==============================
//  Status da live do TikTok
// ==============================
function iniciarStatusLive() {
  const SOCKET_URL = "https://tiktok-live-97o2.onrender.com";
  const SOCKET_IO_CDN = "https://cdn.socket.io/4.7.5/socket.io.min.js";

  const spotlightCard = document.getElementById("tiktok-spotlight-card");
  const spotlightCta = document.getElementById("tiktok-card-cta");
  const spotlightDesc = document.getElementById("tiktok-card-desc");
  const liveBadge = document.getElementById("live-badge");

  const textos = {
    normal: "Clipes curtos, bastidores e chamadas para as lives.",
    live: "🔴 AO VIVO AGORA — clique e assista!"
  };

  function aplicarStatus(online) {
    if (!spotlightCard) return;

    spotlightCard.classList.toggle("is-live", online);

    if (online) {
      if (spotlightCta) spotlightCta.textContent = "🔴 assistir agora";
      if (spotlightDesc) spotlightDesc.textContent = textos.live;
      if (liveBadge) liveBadge.style.display = "flex";
    } else {
      if (spotlightCta) spotlightCta.textContent = "abrir perfil";
      if (spotlightDesc) spotlightDesc.textContent = textos.normal;
      if (liveBadge) liveBadge.style.display = "none";
    }
  }

  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  function limparStatusLive() {
    if (!spotlightCard) return;

    spotlightCard.classList.remove("is-live");
    if (spotlightCta) spotlightCta.textContent = "abrir perfil";
    if (spotlightDesc) spotlightDesc.textContent = textos.normal;
    if (liveBadge) liveBadge.style.display = "none";
  }

  function conectarSocket() {
    if (typeof io !== "function") return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      timeout: 10000,
    });

    socket.on("liveStatus", (data) => {
      aplicarStatus(Boolean(data?.online));
    });

    socket.on("connect_error", () => {
      aplicarStatus(false);
    });
  }

  async function iniciar() {
    aplicarStatus(false);

    try {
      await carregarScript(`${SOCKET_URL}/socket.io/socket.io.js`);
    } catch {
      try {
        await carregarScript(SOCKET_IO_CDN);
      } catch {
        limparStatusLive();
        return;
      }
    }

    conectarSocket();
  }

  iniciar();
}
// ==============================
//  Exibição condicional do link de Login
// ==============================
function iniciarVisibilidadeLogin() {
  const adminLink = document.querySelector(".admin-link");
  if (!adminLink || !window.netlifyIdentity) return;

  function atualizarVisibilidade(user) {
    adminLink.style.display = user ? "inline-block" : "none";
  }

  // Verifica imediatamente, caso a sessão já esteja ativa
  atualizarVisibilidade(netlifyIdentity.currentUser());

  netlifyIdentity.on("init", atualizarVisibilidade);
  netlifyIdentity.on("login", () => atualizarVisibilidade(netlifyIdentity.currentUser()));
  netlifyIdentity.on("logout", () => atualizarVisibilidade(null));

  netlifyIdentity.init();
}

document.addEventListener("DOMContentLoaded", () => {
  carregarBlog();
  iniciarStatusLive();
  iniciarVisibilidadeLogin();
});