/*--------------- Blog Slider ---------------*/
blogSwiper = new Swiper(".blog-slider", {
    spaceBetween: 20,
    loop: false, // 🔥 desativa loop definitivamente
    autoplay: false, // 🔥 remove autoplay (evita reposicionamento automático)
    pagination: {
        el: ".swiper-pagination2",
        clickable: true,
    },
    watchOverflow: true,
    observer: true,
    observeParents: true,
    breakpoints: {
        0: { slidesPerView: 1 },
        768: { slidesPerView: 2 },
        1024: { slidesPerView: 3 },
    },
});