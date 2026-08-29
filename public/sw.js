// Service Worker do site da Meny.
//
// REGRA MAIS IMPORTANTE DESTE ARQUIVO: nunca cachear conteúdo dinâmico.
// Essa lista existe porque essa mesma conversa já corrigiu vários bugs de
// cache desatualizado (JSON do TikTok/YouTube, imagens de momentos, etc).
// Um Service Worker mal configurado reintroduziria esses bugs de um jeito
// pior — o usuário precisaria limpar o Service Worker manualmente, não só
// dar F5.
//
// Sempre que bumpar essa versão, caches antigos são apagados no "activate".
const CACHE_VERSION = "v2";
const STATIC_CACHE = `meny-static-${CACHE_VERSION}`;
const PAGES_CACHE = `meny-pages-${CACHE_VERSION}`;

// App shell: arquivos estáticos que raramente mudam, seguros para
// precachear na instalação.
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/assets/css/main.css",
  "/assets/css/responsive.css",
  "/assets/vendors/font-awesome/css/all.min.css",
  "/assets/vendors/swiper/swiper.css",
  "/assets/vendors/magnific-popup/magnific-popup.css",
  "/assets/vendors/jquery/jquery-3.6.0.js",
  "/assets/vendors/swiper/swiper.js",
  "/assets/vendors/magnific-popup/jquery.magnific-popup.js",
  "/assets/vendors/typed/typed.js",
  "/assets/js/blog.js",
  "/assets/js/momentos.js",
  "/assets/js/script.js",
  "/assets/js/scroll-spy.js",
  "/assets/js/counter-up.js",
  "/assets/images/logo.png",
  "/assets/images/Home/Home-Image.png",
];

// Nunca interceptar/cachear nada que bata com esses prefixos — passa direto
// pra rede, sempre. Cobre: dados dinâmicos (JSON de momentos/TikTok/blog),
// o painel admin, e todas as Netlify Functions (autenticação, contador,
// salvar TikTok, calendário, idade).
const NUNCA_CACHEAR = [
  "/.netlify/functions/",
  "/admin",
  "/assets/data/",
  "/blog.json",
];

function devePassarDireto(url) {
  return NUNCA_CACHEAR.some((prefixo) => url.pathname.startsWith(prefixo));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome !== STATIC_CACHE && nome !== PAGES_CACHE)
            .map((nome) => caches.delete(nome))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Só mexe em requisições do mesmo domínio. CDNs externos (jsdelivr,
  // cdnjs, identity.netlify.com, oEmbed do TikTok, etc.) passam direto pela
  // rede, sem passar pelo Service Worker.
  if (url.origin !== self.location.origin) return;

  // Nunca interceptar métodos que não sejam GET (POST das functions, etc.)
  if (request.method !== "GET") return;

  if (devePassarDireto(url)) {
    return; // deixa o navegador lidar normalmente, sem cache nenhum
  }

  // Navegação de página inteira (ex: abrir o site, dar F5): tenta a rede
  // primeiro (conteúdo sempre atualizado); se falhar (offline), cai pro
  // cache; se não tiver cache, mostra a tela de offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copia));
          return resposta;
        })
        .catch(
          () =>
            caches.match(request).then((cached) => cached) ||
            caches.match("/offline.html")
        )
    );
    return;
  }

  // Assets estáticos (CSS, JS, imagens, fontes): serve do cache na hora
  // (rápido) e atualiza em segundo plano pra próxima visita — nunca
  // trava a página esperando rede, mas também nunca fica desatualizado
  // por muito tempo.
  event.respondWith(
    caches.match(request).then((cached) => {
      const buscaRede = fetch(request)
        .then((resposta) => {
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copia));
          }
          return resposta;
        })
        .catch(() => cached);

      return cached || buscaRede;
    })
  );
});
