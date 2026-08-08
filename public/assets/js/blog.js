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

// Usado como sentinela para saber se o admin definiu um título próprio ou
// se ainda é o rótulo genérico (e portanto pode ser substituído quando o
// enriquecimento via oEmbed trouxer a legenda real do vídeo).
const TITULO_PLACEHOLDER = "Vídeo TikTok";

// O campo "title" que o oEmbed do TikTok retorna é, na prática, a legenda
// completa do vídeo — incluindo #hashtags e @menções. Para usar como
// título curto do card (sem competir com a descrição, que já mostra a
// legenda inteira e destacada), removemos as tags e cortamos o texto.
function extrairTituloLimpo(legenda, limite = 70) {
  const semTags = (legenda || "")
    .replace(/#[\p{L}0-9_]+/gu, "")
    .replace(/@[\p{L}0-9_.]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!semTags) return "";
  return semTags.length > limite ? `${semTags.substring(0, limite)}...` : semTags;
}

// Destaca #hashtags e @menções dentro de um texto já escapado (escaparHtml
// precisa rodar ANTES desta função, nunca depois — senão os "<span>" que
// ela insere seriam escapados também).
function destacarTags(textoEscapado) {
  return (textoEscapado || "")
    .replace(/(^|\s)(#[\p{L}0-9_]+)/gu, '$1<span class="post-tag post-tag--hashtag" style="color:#fe2c55;font-weight:600;">$2</span>')
    .replace(/(^|\s)(@[\p{L}0-9_.]+)/gu, '$1<span class="post-tag post-tag--mention" style="color:#25a4bf;font-weight:600;">$2</span>');
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
    const description = truncarTexto(limparTexto(post.description || post.content || ""), 160);
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
            ${post.author ? `<h5><i class="fas fa-at"></i><span>${escaparHtml(post.author)}</span></h5>` : ""}
          </div>

          <a class="main-heading" target="_blank" rel="noopener noreferrer" href="${escaparHtml(post.url)}">
            ${escaparHtml(post.title || post.platform || fallbackConfig.platform)}
          </a>

          ${description ? `<p>${destacarTags(escaparHtml(description))}</p>` : ""}

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
    title: bruto.titulo || TITULO_PLACEHOLDER,
    url,
    thumbnail: bruto.thumbnail || "",
    description: bruto.descricao || "",
    author: bruto.autor || "",
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
      const faltaThumbnail = !post.thumbnail;
      const faltaLegenda = !post.description;
      const faltaAutor = !post.author;
      const faltaTitulo = !post.title || post.title === TITULO_PLACEHOLDER;

      // Só chama o oEmbed se realmente faltar alguma coisa — antes só
      // checava "thumbnail", então um vídeo já com thumbnail (mas sem
      // descrição/autor) nunca era enriquecido.
      if (!faltaThumbnail && !faltaLegenda && !faltaAutor && !faltaTitulo) {
        return post;
      }

      const meta = await buscarMetaTikTok(post.url);
      if (!meta) return post;

      return {
        ...post,
        // "meta.title" é a legenda completa do vídeo (com # e @) — vira a
        // descrição, nunca o "title" curto do card. O título só é
        // preenchido a partir dela quando o admin não definiu um próprio.
        title: faltaTitulo ? (extrairTituloLimpo(meta.title) || post.title) : post.title,
        thumbnail: post.thumbnail || meta.thumbnail,
        description: post.description || meta.title || "",
        author: post.author || (meta.author ? `@${meta.author}` : ""),
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
    // já enriquecidos que vieram do tiktok-feed.json (gerado no build).
    mapa.set(post.url, {
      ...existente,
      ...post,
      title: (post.title && post.title !== TITULO_PLACEHOLDER) ? post.title : (existente.title || post.title),
      thumbnail: post.thumbnail || existente.thumbnail,
      description: post.description || existente.description,
      author: post.author || existente.author,
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
    const [youtubeResponse, tiktokFeedResponse, manualTikTok] = await Promise.all([
      // blog.json agora só tem YouTube (TikTok ganhou arquivo próprio —
      // ver assets/data/tiktok-feed.json abaixo). Isso reflete os dois
      // carrosséis serem independentes hoje, diferente da versão antiga
      // em que os dois vinham juntos do mesmo blog.json.
      fetch("/blog.json", { cache: "no-store" }).catch(() => ({ ok: false })),
      // TikTok via RSS + manual, já mesclado no build.
      fetch("/assets/data/tiktok-feed.json", { cache: "no-store" }).catch(() => ({ ok: false })),
      // TikTok manual, direto do CMS, sempre ao vivo — garante que um
      // vídeo recém-salvo apareça na hora, mesmo antes do próximo build.
      carregarTikTokManual(),
    ]);

    let youtubePostsRaw = [];
    if (youtubeResponse.ok) {
      const posts = await youtubeResponse.json().catch(() => []);
      youtubePostsRaw = Array.isArray(posts) ? posts : [];
    }

    let tiktokFeed = [];
    if (tiktokFeedResponse.ok) {
      const posts = await tiktokFeedResponse.json().catch(() => []);
      tiktokFeed = Array.isArray(posts) ? posts : [];
    }

    let tiktokPosts = mesclarPosts(tiktokFeed, manualTikTok).slice(0, 6);
    const youtubePosts = youtubePostsRaw
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

  // Segundo badge "AO VIVO", na seção de blog — existe no HTML
  // (blog-live-badge, tiktok-panel-desc, tiktok-panel-cta) mas nunca era
  // atualizado por aqui, então ficava sempre no texto padrão mesmo com a
  // Meny ao vivo.
  const blogLiveBadge = document.getElementById("blog-live-badge");
  const blogPanelDesc = document.getElementById("tiktok-panel-desc");
  const blogPanelCta = document.getElementById("tiktok-panel-cta");

  const textos = {
    normal: "Clipes curtos, bastidores e chamadas para as lives.",
    live: "🔴 AO VIVO AGORA — clique e assista!"
  };

  const textosBlog = {
    normal: "Posts rápidos com bastidores, lives e chamadas para ação.",
    live: "🔴 AO VIVO AGORA — clique e assista!"
  };

  function aplicarStatus(online) {
    if (spotlightCard) {
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

    if (blogPanelDesc || blogPanelCta || blogLiveBadge) {
      if (online) {
        if (blogPanelCta) blogPanelCta.textContent = "🔴 assistir agora";
        if (blogPanelDesc) blogPanelDesc.textContent = textosBlog.live;
        if (blogLiveBadge) blogLiveBadge.style.display = "flex";
      } else {
        if (blogPanelCta) blogPanelCta.textContent = "seguir no tiktok";
        if (blogPanelDesc) blogPanelDesc.textContent = textosBlog.normal;
        if (blogLiveBadge) blogLiveBadge.style.display = "none";
      }
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
    aplicarStatus(false);
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