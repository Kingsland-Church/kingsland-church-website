/* Kingsland Church — main.js
   Mobile menu · Scroll reveals · Parallax · Moving cards */

document.documentElement.classList.add('js-anim');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

document.addEventListener('DOMContentLoaded', function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Dropdown menus (click-toggle, closes on outside click / Escape) ---- */
  var drops = document.querySelectorAll('.has-drop');
  drops.forEach(function (drop) {
    var trigger = drop.querySelector('.drop-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = drop.classList.contains('open');
      /* close all first */
      drops.forEach(function (d) { d.classList.remove('open'); });
      if (!isOpen) drop.classList.add('open');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-drop')) {
      drops.forEach(function (d) { d.classList.remove('open'); });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') drops.forEach(function (d) { d.classList.remove('open'); });
  });

  /* ---- Mobile menu ---- */
  var burger = document.getElementById('burger');
  var mnav   = document.getElementById('mnav');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var open = mnav.getAttribute('hidden') === null;
      if (open) {
        mnav.setAttribute('hidden', '');
        burger.setAttribute('aria-expanded', 'false');
      } else {
        mnav.removeAttribute('hidden');
        burger.setAttribute('aria-expanded', 'true');
      }
    });
  }

  /* ---- Mobile nav collapsible groups ---- */
  document.querySelectorAll('.mnav-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sub  = btn.nextElementSibling;
      var open = sub.getAttribute('hidden') === null;
      if (open) {
        sub.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
      } else {
        sub.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---- Scroll reveals (Intersection Observer) ---- */
  var reveals = document.querySelectorAll('.reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Hero canvas: floating grain — drifts, fades, respawns ---- */
  (function () {
    var canvas = document.getElementById('hero-canvas');
    if (!canvas || reduce) return;
    var ctx = canvas.getContext('2d');

    var W, H, stars = [];
    var mouseX = -9999, mouseY = -9999;
    var scrollProg = 0;

    var FRICTION   = 0.992; /* very slow decay — grains barely decelerate */
    var WANDER     = 0.003; /* almost imperceptible ambient drift */
    var REP_R      = 110;
    var REP_F      = 0.9;
    var SPEED_THR  = 0.22;  /* above this speed: start fading */
    var FADE_RATE  = 0.006; /* slow fade */
    var GROW_RATE  = 0.004; /* restore alpha when calm */

    function spawn(st) {
      st.x  = Math.random() * W;
      st.y  = Math.random() * H;
      st.vx = (Math.random() - 0.5) * 0.2;
      st.vy = (Math.random() - 0.5) * 0.2;
      st.wanderA = Math.random() * Math.PI * 2;
      st.life = 0; /* fade in from invisible */
    }

    function buildStars() {
      var list = [];
      var count = Math.min(Math.max(Math.round((W * H) / 900), 150), 600);
      for (var i = 0; i < count; i++) {
        var st = {
          x: 0, y: 0, vx: 0, vy: 0, wanderA: 0, life: 0,
          r:          0.4 + Math.random() * 1.2,
          baseAlpha:  0.14 + Math.random() * 0.46,
          phase:      Math.random() * Math.PI * 2,
          blinkSpeed: 0.45 + Math.random() * 2.0,
          wobbleAmp:  4  + Math.random() * 14,
          wobbleFreq: 0.05 + Math.random() * 0.18,
          wobbleOff:  Math.random() * Math.PI * 2,
          scrollSens: 0.3 + Math.random() * 0.9, /* each grain reacts differently */
        };
        spawn(st);
        st.life = Math.random(); /* stagger initial fade-in */
        list.push(st);
      }
      return list;
    }

    function init() {
      var rect = canvas.parentElement.getBoundingClientRect();
      W = canvas.width  = rect.width  || window.innerWidth;
      H = canvas.height = rect.height || window.innerHeight * 0.7;
      stars = buildStars();
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      var t = performance.now() / 1000;
      ctx.fillStyle = 'rgba(255,255,255,1)';

      /* scroll: gentle continuous leftward force, per-grain sensitivity */
      var scrollF = scrollProg * 0.006;

      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];

        /* ambient wander — slowly rotating direction, tiny impulse */
        st.wanderA += (Math.random() - 0.5) * 0.18;
        st.vx += Math.cos(st.wanderA) * WANDER;
        st.vy += Math.sin(st.wanderA) * WANDER * 0.35;

        /* scroll pushes left */
        st.vx -= scrollF * st.scrollSens;

        /* cursor repulsion impulse */
        var cdx = st.x - mouseX;
        var cdy = st.y - mouseY;
        var cd  = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cd < REP_R && cd > 0.5) {
          var imp = (1 - cd / REP_R) * REP_F;
          st.vx  += (cdx / cd) * imp;
          st.vy  += (cdy / cd) * imp;
        }

        /* integrate — no spring, grains drift freely */
        st.vx *= FRICTION;
        st.vy *= FRICTION;
        st.x  += st.vx;
        st.y  += st.vy;

        /* speed-based fade: moving fast = fading; still = brightening */
        var spd = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
        if (spd > SPEED_THR) {
          st.life = Math.max(0, st.life - FADE_RATE);
        } else {
          st.life = Math.min(1, st.life + GROW_RATE);
        }

        /* respawn when fully faded or drifted off canvas */
        if (st.life <= 0 || st.x < -60 || st.x > W + 60 || st.y < -60 || st.y > H + 60) {
          spawn(st);
          continue;
        }

        /* gentle y-wobble layered on top */
        var wy = Math.sin(t * st.wobbleFreq + st.wobbleOff) * st.wobbleAmp;

        var blink = 0.5 + 0.5 * Math.sin(t * st.blinkSpeed + st.phase);
        ctx.globalAlpha = st.baseAlpha * blink * st.life;

        ctx.beginPath();
        ctx.arc(st.x, st.y + wy, st.r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(render);
    }

    canvas.parentElement.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouseX = e.clientX - r.left;
      mouseY = e.clientY - r.top;
    });
    canvas.parentElement.addEventListener('mouseleave', function () {
      mouseX = -9999; mouseY = -9999;
    });

    window.addEventListener('scroll', function () {
      var hero  = canvas.parentElement;
      var heroH = hero ? hero.offsetHeight : H;
      scrollProg = Math.min(window.scrollY / (heroH || 1), 1);
    }, { passive: true });

    init();
    render();
    window.addEventListener('resize', function () { init(); });
  })();

  /* ---- Soft parallax on split image ---- */
  var px = document.getElementById('parallax');
  if (px && !reduce) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var r   = px.getBoundingClientRect();
        var off = (window.innerHeight / 2 - (r.top + r.height / 2)) * 0.05;
        px.style.transform = 'translateY(' + off + 'px) scale(1.06)';
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---- Pinned horizontal moving cards (desktop only) ---- */
  var sec   = document.getElementById('hscroll');
  var track = document.getElementById('track');
  if (sec && track) {
    var t2        = false;
    var isDesktop = function () { return window.innerWidth > 900 && !reduce; };
    var move      = function () {
      if (!isDesktop()) { track.style.transform = ''; return; }
      if (t2) return;
      t2 = true;
      requestAnimationFrame(function () {
        var top    = sec.offsetTop;
        var total  = sec.offsetHeight - window.innerHeight;
        var passed = Math.min(Math.max(window.scrollY - top, 0), total);
        var prog   = total > 0 ? passed / total : 0;
        var max    = Math.max(track.scrollWidth - window.innerWidth + 48, 0);
        track.style.transform = 'translateX(' + (-prog * max) + 'px)';
        t2 = false;
      });
    };
    window.addEventListener('scroll', move, { passive: true });
    window.addEventListener('resize', move);
    move();
  }
});
