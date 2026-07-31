/* Hero particle cross
   Dots form a cross shape, shimmer at rest, burst outward on scroll */

(function () {
  var canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var hero   = document.querySelector('.hero');
  var ctx    = canvas.getContext('2d');
  var parts  = [];
  var prog   = 0;  /* 0 = intact, 1 = fully dispersed */

  /* Particle colours — white, lavender, pale pink, ice blue */
  var COLS = [
    '255,255,255',
    '220,200,255',
    '255,210,240',
    '190,210,255',
    '240,230,255'
  ];

  /* ---- Build particle field ---- */
  function build() {
    canvas.width  = hero.offsetWidth;
    canvas.height = hero.offsetHeight;
    parts = [];

    var w  = canvas.width,  h  = canvas.height;
    var cx = w * 0.52,      cy = h * 0.60;   /* slightly right of centre, shifted down */
    var size = Math.min(w, h);

    var armW  = size * 0.068;  /* thickness of each arm */
    var vH    = size * 0.82;   /* vertical arm height */
    var hW    = size * 0.74;   /* horizontal arm width */

    /* Christian cross: crossbar sits 1/3 from top, 2/3 from bottom */
    var crossY = cy - vH * 0.17;   /* intersection point shifted up */
    var vTop   = crossY - vH * 0.33;
    var vBot   = crossY + vH * 0.67;
    var hLeft  = cx - hW / 2,  hRight = cx + hW / 2;
    var hTop   = crossY - armW / 2, hBot = crossY + armW / 2;

    /* Density: ~10% denser */
    var count = Math.round((armW * vH + hW * armW - armW * armW) / 818);
    count = Math.max(418, Math.min(count, 900));

    for (var i = 0; i < count; i++) {
      var x, y;

      if (Math.random() < 0.5) {
        /* Vertical bar */
        x = cx - armW / 2 + Math.random() * armW;
        y = vTop + Math.random() * vH;
      } else {
        /* Horizontal bar — skip overlap zone already covered above */
        x = hLeft + Math.random() * hW;
        y = hTop + Math.random() * armW;
      }

      /* Drift angle: away from cross centre, plus randomness */
      var ang  = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 1.6;
      var dist = 90 + Math.random() * 300;

      parts.push({
        x:    x,
        y:    y,
        dx:   Math.cos(ang) * dist,
        dy:   Math.sin(ang) * dist,
        r:    0.6 + Math.random() * 1.8,
        base: 0.28 + Math.random() * 0.62,
        ph:   Math.random() * Math.PI * 2,
        spd:  0.6 + Math.random() * 1.6,
        col:  COLS[Math.floor(Math.random() * COLS.length)]
      });
    }
  }

  /* ---- Render loop ---- */
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var t = Date.now() * 0.001;

    /* Ease-out for movement (burst feel), linear for fade */
    var move = 1 - Math.pow(1 - prog, 2.2);
    var fade = prog;

    for (var i = 0; i < parts.length; i++) {
      var p     = parts[i];
      var twink = 0.30 + 0.70 * Math.sin(t * p.spd + p.ph);
      var alpha = p.base * twink * (1 - fade * 0.92);

      if (alpha < 0.012) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = 'rgb(' + p.col + ')';
      ctx.beginPath();
      ctx.arc(
        p.x + p.dx * move,
        p.y + p.dy * move,
        p.r,
        0, Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  /* ---- Scroll → progress ---- */
  window.addEventListener('scroll', function () {
    prog = Math.min(window.scrollY / (window.innerHeight * 0.55), 1);
  }, { passive: true });

  /* ---- Init ---- */
  window.addEventListener('resize', build);
  build();
  draw();
})();
