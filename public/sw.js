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
const CACHE_VERSION = "v6"; // v6: redes sociais vindas do painel (redes.js) | v5: PWA revisado
const STATIC_CACHE = `meny-static-${CACHE_VERSION}`;
const PAGES_CACHE = `meny-pages-${CACHE_VERSION}`;

// App shell: arquivos estáticos que raramente mudam, seguros para
// precachear na instalação.
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/assets/images/logo.png",
  "/assets/images/Home/Home-Image.png",
  "/assets/images/About/About-Image.png",
  "/assets/images/Blogs/youtube.jpg",
  "/assets/images/Blogs/tiktok.jpg",
  "/assets/images/icons/icon-192.png",
  "/assets/images/icons/icon-512.png",
  "/assets/images/icons/icon-maskable-512.png",
  "/assets/js/temas.js",
  "/assets/js/redes.js",
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
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            // guarda sem a querystring: "/?pwa=1" (abrir pelo ícone) e "/"
            // viram a mesma página no cache
            caches.open(PAGES_CACHE).then((cache) => cache.put(url.origin + url.pathname, copia));
          }
          return resposta;
        })
        .catch(async () => {
          // Antes: "promise || fallback" nunca chegava ao offline.html
          // (uma Promise é sempre "verdadeira"). Agora espera de verdade.
          const cached =
            (await caches.match(url.origin + url.pathname)) ||
            (await caches.match(request, { ignoreSearch: true })) ||
            (url.pathname === "/" || url.pathname === "/index.html" ? await caches.match("/") : null);
          return cached || (await caches.match("/offline.html")) || Response.error();
        })
    );
    return;
  }

  // Telas de abertura do iPhone: grandes e usadas só na instalação — rede direta.
  if (url.pathname.startsWith("/assets/images/splash/")) return;

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
