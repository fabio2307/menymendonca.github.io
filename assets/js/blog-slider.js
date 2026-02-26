/*--------------- Blog Slider ---------------*/
blogSwiper = new Swiper(".blog-slider", {
    spaceBetween: 20,
    speed: 600, // movimento mais suave
    autoplay: {
        delay: 4000,
        disableOnInteraction: false,
    },
    pagination: {
        el: ".swiper-pagination2",
        clickable: true,
    },

    breakpoints: {
        0: {
            slidesPerView: 1,
            loop: false, // 🔥 desativa loop no mobile
        },
        768: {
            slidesPerView: 2,
            loop: true,
        },
        1024: {
            slidesPerView: 3,
            loop: true,
        },
    },
});