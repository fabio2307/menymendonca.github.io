$(document).ready(function(){

  $('.scroll-top').hide();

  /*--------------- Navbar Toggler ---------------*/
  $('#menu-btn').click(function(){
    $(this).toggleClass('fa-times');
    $('.navbar').toggleClass('active');
  });

  $('.navbar a').on('click', function(){
    $('#menu-btn').removeClass('fa-times');
    $('.navbar').removeClass('active');
  });

  /*--------------- Scroll-Top ---------------*/
  $(window).on('scroll', function () {
    const scrollTop = $(this).scrollTop();
    
    $('#menu-btn').removeClass('fa-times');
    $('.navbar').removeClass('active');

    // STICKY HEADER
    if(scrollTop > 0){
      $(".header").addClass("sticky");
    }else{
      $(".header").removeClass("sticky");
    }

    if (scrollTop > 100) {
      $('.scroll-top').fadeIn();
    } else {
      $('.scroll-top').fadeOut();
    }

  });

});
