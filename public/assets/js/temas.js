/* =========================================================
   Temas do site da Meny — arquivo compartilhado entre o site
   (index.html) e o painel (admin.html).

   O tema escolhido fica salvo no conteudo-api como:
     tema: { id: "esmeralda", destaque: "#00ffa9" | null }
   "destaque" é a cor personalizada opcional (troca só a cor principal).
   ========================================================= */
(function () {
    "use strict";

    // Cada tema: destaque, destaque2 (tom médio), profundo (tom escuro da
    // marca), fundo, superfície, texto, texto secundário, texto apagado e
    // a cor do texto que vai EM CIMA do destaque (botões).
    var TEMAS = {
        esmeralda: {
            nome: "Esmeralda", descricao: "O verde original do site",
            destaque: "#00ffa9", destaque2: "#1f7a4d", profundo: "#0b3d2a",
            fundo: "#07160f", superficie: "#0d2119",
            texto: "#ffffff", texto2: "#d7e2dd", apagado: "#8fa89c", sobreDestaque: "#07160f",
        },
        ametista: {
            nome: "Noite roxa", descricao: "Roxo suave sobre fundo escuro",
            destaque: "#b98cff", destaque2: "#6b3fb8", profundo: "#2a1650",
            fundo: "#110a1f", superficie: "#1b1230",
            texto: "#ffffff", texto2: "#e2dcef", apagado: "#a397bd", sobreDestaque: "#140a26",
        },
        pordosol: {
            nome: "Pôr do sol", descricao: "Coral e rosa, clima de show",
            destaque: "#ff7a59", destaque2: "#d9468f", profundo: "#5a1d3a",
            fundo: "#1a0c12", superficie: "#26131b",
            texto: "#ffffff", texto2: "#f0dde2", apagado: "#b7959f", sobreDestaque: "#1a0c12",
        },
        oceano: {
            nome: "Oceano", descricao: "Azul claro e profundo",
            destaque: "#38bdf8", destaque2: "#1d6fa5", profundo: "#0b3150",
            fundo: "#06121f", superficie: "#0c1c2e",
            texto: "#ffffff", texto2: "#d6e4ef", apagado: "#8aa2b8", sobreDestaque: "#06121f",
        },
        dourado: {
            nome: "Dourado", descricao: "Brilho de palco",
            destaque: "#f2c14e", destaque2: "#b4862a", profundo: "#4a3510",
            fundo: "#14100a", superficie: "#211a10",
            texto: "#ffffff", texto2: "#ece3d0", apagado: "#ab9d80", sobreDestaque: "#14100a",
        },
        claro: {
            nome: "Claro", descricao: "Fundo claro com verde (o feed de vídeos continua escuro)",
            destaque: "#0a9f6c", destaque2: "#0e7a55", profundo: "#c9f0e0",
            fundo: "#f5faf7", superficie: "#e3efe8",
            texto: "#0b1a13", texto2: "#2c3d35", apagado: "#5d7066", sobreDestaque: "#ffffff",
            claro: true,
        },
    };
    var PADRAO = "esmeralda";

    function hexParaRgb(hex) {
        var h = String(hex || "").replace("#", "");
        if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
        if (!/^[0-9a-f]{6}$/i.test(h)) return null;
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function luminancia(hex) {
        var rgb = hexParaRgb(hex);
        if (!rgb) return 0;
        var c = rgb.map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contraste(a, b) {
        var l1 = luminancia(a), l2 = luminancia(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function misturar(hexA, hexB, peso) {
        var a = hexParaRgb(hexA), b = hexParaRgb(hexB);
        if (!a || !b) return hexA;
        return "#" + a.map(function (v, i) {
            return Math.round(v * (1 - peso) + b[i] * peso).toString(16).padStart(2, "0");
        }).join("");
    }

    // Resolve { id, destaque } num tema completo (com a cor personalizada aplicada).
    function resolver(escolha) {
        escolha = escolha || {};
        var base = TEMAS[escolha.id] || TEMAS[PADRAO];
        var t = Object.assign({ id: TEMAS[escolha.id] ? escolha.id : PADRAO }, base);
        if (hexParaRgb(escolha.destaque)) {
            var d = escolha.destaque.toLowerCase();
            t.destaque = d;
            t.destaque2 = misturar(d, t.fundo, 0.45);
            t.profundo = t.claro ? misturar(d, "#ffffff", 0.8) : misturar(d, t.fundo, 0.75);
            // texto do botão: escuro ou branco, o que tiver mais contraste
            t.sobreDestaque = contraste(d, "#ffffff") >= contraste(d, t.fundo) && contraste(d, "#ffffff") >= 3 ? "#ffffff" : (t.claro ? "#0b1a13" : t.fundo);
            t.personalizado = true;
        }
        return t;
    }

    // Variáveis CSS usadas pelo index.html
    function variaveis(t) {
        var rgb = function (h) { return (hexParaRgb(h) || [0, 0, 0]).join(", "); };
        return {
            "--green": t.destaque, "--green-rgb": rgb(t.destaque),
            "--green-mid": t.destaque2, "--green-deep": t.profundo,
            "--black": t.fundo, "--black-rgb": rgb(t.fundo),
            "--surface-2": t.superficie, "--surface-rgb": rgb(t.superficie),
            "--white": t.texto, "--white-rgb": rgb(t.texto),
            "--grey": t.texto2, "--muted": t.apagado, "--on-green": t.sobreDestaque,
        };
    }

    // Palco escuro do feed quando o tema é claro (vídeo pede fundo escuro).
    function variaveisPalco(t) {
        if (!t.claro) return null;
        var escuro = resolver({ id: PADRAO, destaque: t.destaque });
        var v = variaveis(escuro);
        v["--on-green"] = contraste(t.destaque, "#ffffff") >= 3 ? "#ffffff" : escuro.fundo;
        return v;
    }

    function aplicar(escolha, raiz) {
        raiz = raiz || document.documentElement;
        var t = resolver(escolha);
        var v = variaveis(t);
        Object.keys(v).forEach(function (k) { raiz.style.setProperty(k, v[k]); });
        raiz.setAttribute("data-tema", t.id);
        raiz.toggleAttribute("data-tema-claro", !!t.claro);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta && raiz === document.documentElement) meta.setAttribute("content", t.fundo);
        return t;
    }

    window.MenyTemas = {
        TEMAS: TEMAS, PADRAO: PADRAO,
        resolver: resolver, variaveis: variaveis, variaveisPalco: variaveisPalco,
        aplicar: aplicar, contraste: contraste, hexParaRgb: hexParaRgb,
    };
})();
