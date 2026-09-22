/* ============================================================
   world.js — the night world.

   Space above, a vast landscape below, a horizon between them
   carrying the only vermilion on the page. It is drawn with one
   2D canvas and no library: a sky, a galactic band made of the
   stars themselves, several procedural ridges receding into haze,
   a still lake that gives the sky back, and a camera that pulls
   back at load and keeps moving while the visitor scrolls.

   Nothing here is data. The only optional tie is the number of
   stars, which the front page sets to the commit count.

   window.InkWorld
     mountHero(el, o) create the world inside `el` (a canvas is
                      appended). This is the door the front page's
                      hero uses. `mount` is the same call, published
                      only on a page with no hero host (#world), so
                      that the ambient engine's offer of its own
                      host is declined where a hero already owns the
                      world. opts: { stars, onState(msg,bad),
                      auto (listen to scroll, default true),
                      travel (px of scroll the camera move spans),
                      light (force the paper palette) }.
                      Returns the instance; also becomes the one
                      the module-level calls below address.
     settled()        on the instance: true once the opening has run
                      and the camera has caught up with the scroll.
     setProgress(p)   0 = the settled opening frame, 1 = the end of
                      the camera's travel (the land has fallen away
                      and the page is up in the sky). Values between
                      are eased towards, so it is safe to call on
                      every scroll event.
     pause()          stop rendering and drop the frame callback.
     resume()         allow rendering again and repaint once.
     destroy()        stop everything, remove the canvas and the
                      listeners. Safe to call twice.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COARSE = matchMedia('(pointer: coarse)').matches;

  /* ---- small helpers ---------------------------------------- */

  function rng(seed) {                      // mulberry32
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hex(s) {
    s = String(s || '').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m) {
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) {
      var p = m[1].split(',');
      return [+p[0] || 0, +p[1] || 0, +p[2] || 0];
    }
    return [10, 15, 20];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (+a).toFixed(3) + ')';
  }
  function lum(c) { return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; }
  function cvar(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return hex(v || fb);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---- ONE NIGHT --------------------------------------------
     The same five numbers are written into js/scene.js, which paints the
     ambient world behind all seven pages. Before this, these ranges were
     near-black and neutral while atlas, portal and about's were steel
     blue, so the front page and the rest of the site were two places.

     `d` is distance: 0 at the near plane, 1 at the furthest. The near
     plane is the darkest and almost neutral — there is no air in front
     of it — and each plane further away lifts and goes bluer, because
     there is more night between it and the reader.

       crest = mix(NEAR, FAR, 0.06 + 0.72 * d^0.9)
       foot  = mix(NEAR, FAR, 0.02 + 0.34 * d)

     Change it HERE AND IN scene.js, or the site stops being one night.
     The hero's own drama is not in these colours: it is in the scale of
     the name against the near plane, which is as dark as it ever was. */
  function nightNear(dark) {
    return dark ? mix(cvar('--ground-deep', '#06090C'), [0, 0, 0], 0.55)
                : mix(cvar('--rule-strong', '#C9C0AB'), cvar('--ink-low', '#535C61'), 0.54);
  }
  function nightFar(dark) {
    return dark ? cvar('--wash-c', '#1C2A32')
                : mix(cvar('--rule-strong', '#C9C0AB'), cvar('--ink-low', '#535C61'), 0.10);
  }
  function crestTone(d, dark) {
    return mix(nightNear(dark), nightFar(dark), 0.06 + 0.72 * Math.pow(d, 0.9));
  }
  function footTone(d, dark) {
    return mix(nightNear(dark), nightFar(dark), 0.02 + 0.34 * d);
  }

  /* the one easing family: a long deceleration, nothing bouncy */
  function outQuint(t) { return 1 - Math.pow(1 - t, 3.3); }
  function outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  /* value noise over one dimension, and a ridged sum of it: the
     mountains are this function and nothing else. */
  function noiseTable(seed) {
    var r = rng(seed), t = new Float32Array(512);
    for (var i = 0; i < 512; i++) t[i] = r();
    return t;
  }
  function vnoise(x, t) {
    var i = Math.floor(x), f = x - i;
    var a = t[((i % 512) + 512) % 512], b = t[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * smooth(f);
  }
  function ridged(x, t, oct) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < oct; o++) {
      var n = vnoise(x * f, t);
      n = 1 - Math.abs(n * 2 - 1);
      v += amp * n * n;
      norm += amp;
      f *= 2.07; amp *= 0.52;
    }
    return v / norm;
  }

  /* ---- one world -------------------------------------------- */

  function build(host, opts) {
    opts = opts || {};
    var say = opts.onState || function () {};
    var reduced = opts.reduced != null ? opts.reduced : REDUCED;
    var phone = matchMedia('(max-width: 600px)').matches || COARSE;

    var cvs = document.createElement('canvas');
    cvs.className = 'world__cv';
    cvs.setAttribute('aria-hidden', 'true');
    var ctx = null, dead = '';
    try {
      ctx = cvs.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('a 2D canvas context could not be created');
    } catch (e) {
      dead = (e && e.message) || 'the canvas could not be drawn on';
    }
    if (dead) {
      say('the night world could not draw (' + dead + '). The page keeps its ink ground.', true);
      return { failed: true, stars: 0, setProgress: function () {}, pause: function () {},
               resume: function () {}, destroy: function () {}, repaint: function () {} };
    }
    host.appendChild(cvs);
    cvs.addEventListener('contextlost', function (ev) {
      ev.preventDefault();
      stop(); cvs.style.display = 'none';
      say('the night world lost its canvas mid-flight. The page keeps its ink ground.', true);
    });

    var W = 0, H = 0, dpr = 1, hz = 0, waterY = 0;
    var STARS = Math.max(120, Math.round(opts.stars || 1800));
    if (phone) STARS = Math.min(STARS, 760);
    var RIDGES = phone ? 5 : 6;
    var travel = opts.travel || 0;

    /* ---- palette, read from the stylesheet so Ink and Paper both work */
    var P = {};
    function palette() {
      var ground = cvar('--ground', '#0A0F14');
      var hi = cvar('--ink-hi', '#ECE5D7');
      var accent = cvar('--accent', '#F0603A');
      var dark = lum(ground) < 0.5;
      P.dark = dark;
      P.accent = accent;
      if (dark) {
        /* the sky is the same three values every other page's sky is
           painted from (ink.css --wash-a/b/c, the night shader's cA/cB/cC),
           so the hero and the world behind the rest of the document are
           one atmosphere rather than two greys */
        P.skyTop = cvar('--wash-a', '#070B0F');
        P.skyMid = cvar('--wash-b', '#10191F');
        P.skyHz = cvar('--wash-c', '#1C2A32');
        P.deep = crestTone(0, true);            // the near plane
        P.far = crestTone(1, true);             // the furthest
        P.star = hi;
        P.starA = 1;
        P.bandA = 1;
      } else {
        P.skyTop = mix(ground, hi, 0.16);
        P.skyMid = mix(ground, hi, 0.05);
        P.skyHz = mix(ground, [255, 255, 255], 0.55);
        /* on paper the name is ink-black, so the nearest ranges stop well
           short of black — the type has to keep reading over them */
        P.deep = mix(ground, hi, 0.58);
        P.far = mix(ground, hi, 0.20);
        P.star = mix(ground, hi, 0.55);
        P.starA = 0.34;                       /* on paper they are ink specks, not stars */
        P.bandA = 0.5;
      }
    }

    /* ---- the stars -------------------------------------------- */
    var sx, sy, sr, sBin, bins = 7, binA = [];
    var bigX = [], bigY = [], bigR = [];
    function makeStars() {
      var r = rng(90917), n = STARS;
      sx = new Float32Array(n); sy = new Float32Array(n);
      sr = new Float32Array(n); sBin = new Uint8Array(n);
      bigX = []; bigY = []; bigR = [];
      var bandY = hz - H * 0.34, slope = -0.235;
      var x0 = -W * 0.32, x1 = W * 1.32, top = -H * 0.42;
      for (var i = 0; i < n; i++) {
        var x = x0 + r() * (x1 - x0), y;
        var inBand = r() < 0.52;
        if (inBand) {
          /* two gaussians: a bright core and a wider halo, so the band
             is made of the stars instead of painted over them */
          var g = (r() + r() + r() - 1.5) * (r() < 0.6 ? H * 0.038 : H * 0.125);
          y = bandY + slope * (x - W * 0.5) + g;
        } else {
          y = top + r() * (hz - top);
        }
        if (y > hz - 2) y = top + r() * (hz - top - 4);
        var depth = r();
        var rad = 0.36 + Math.pow(depth, 3.1) * 1.55;
        var a = (0.16 + Math.pow(depth, 1.5) * 0.84);
        if (inBand) a *= 0.82;
        a *= P.starA;
        sx[i] = x; sy[i] = y; sr[i] = rad;
        sBin[i] = clamp(Math.floor(a * bins), 0, bins - 1);
        if (rad > 1.62 && bigX.length < (phone ? 10 : 26)) { bigX.push(x); bigY.push(y); bigR.push(rad); }
      }
      binA = [];
      for (var b = 0; b < bins; b++) binA.push((b + 0.62) / bins);
    }

    /* ---- the ridges ------------------------------------------- */
    /* each is a silhouette sampled once per resize and then only
       transformed, so a camera move costs a few fills and nothing else */
    var ridge = [];
    function makeRidges() {
      ridge = [];
      var pts = phone ? 96 : 210;
      var x0 = -W * 0.34, x1 = W * 1.34;
      for (var k = 0; k < RIDGES; k++) {
        var f = k / (RIDGES - 1);                       // 0 far … 1 near
        var tbl = noiseTable(1471 + k * 977);
        var baseY = hz + H * (0.014 + Math.pow(f, 1.25) * 0.315);
        var amp = H * (0.05 + Math.pow(f, 1.4) * 0.40);
        /* nearer ranges are BROADER on screen, not busier: the spatial
           frequency falls as the forms come towards us */
        /* a phone shows fewer, bigger forms — the same range seen through a
           narrower window, not the same picture squeezed */
        var freq = (2.75 - f * 2.28) / W * (phone ? 2.1 : 6.4);
        var oct = f > 0.5 ? 3 : 4;
        var px = new Float32Array(pts + 1), py = new Float32Array(pts + 1);
        for (var i = 0; i <= pts; i++) {
          var x = x0 + (x1 - x0) * (i / pts);
          var n = ridged(x * freq + k * 13.7, tbl, oct);
          /* a long slow swell under the detail: real ranges are not even */
          n = n * 0.7 + vnoise(x * freq * 0.17 + k * 5.1, tbl) * 0.46;
          px[i] = x; py[i] = baseY - amp * n;
        }
        ridge.push({ f: f, x: px, y: py, base: baseY, amp: amp });
      }
    }

    /* ---- the grain: one small tile, drawn over everything ------ */
    var grain = null;
    function makeGrain() {
      var s = 92, c = document.createElement('canvas');
      c.width = s; c.height = s;
      var g = c.getContext('2d');
      if (!g) { grain = null; return; }
      var im = g.createImageData(s, s), d = im.data, r = rng(4242);
      for (var i = 0; i < d.length; i += 4) {
        var v = 118 + (r() - 0.5) * 150;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      try { grain = ctx.createPattern(c, 'repeat'); } catch (e) { grain = null; }
    }

    /* ---- sizing ------------------------------------------------ */
    function size() {
      var r = host.getBoundingClientRect();
      W = Math.max(280, Math.round(r.width || window.innerWidth));
      H = Math.max(360, Math.round(r.height || window.innerHeight));
      dpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px';
      cvs.style.height = H + 'px';
      hz = Math.round(H * (phone ? 0.44 : 0.475));
      waterY = Math.round(hz + H * (phone ? 0.25 : 0.29));
      if (!travel) travel = Math.round(H * 1.25);
      palette(); makeStars(); makeRidges(); makeGrain();
    }

    /* ---- the camera -------------------------------------------- */
    /* one transform per depth: things far away barely move, the
       near ridges swing. `open` runs the pull-back, `p` the scroll. */
    var open = 0;            // 0 → 1 over the opening
    var p = 0, pTarget = 0;  // scroll progress, eased towards the target
    var OPEN_MS = 5200;

    function camAt(depth) {
      var o = 1 - open;                                  // 1 at the start
      var zoom = (1 + o * 1.34) * (1 - p * 0.13);
      var lift = (-o * 0.05 + p * 0.40) * H;
      var pan = (o * 0.035 - p * 0.02) * W;
      var s = 1 + (zoom - 1) * (0.22 + 0.78 * depth);
      return { s: s, y: lift * (0.16 + 0.84 * depth), x: pan * (0.12 + 0.88 * depth) };
    }
    function apply(depth) {
      var c = camAt(depth);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(W * 0.5 + c.x, hz + c.y);
      ctx.scale(c.s, c.s);
      ctx.translate(-W * 0.5, -hz);
    }

    /* ---- painting ---------------------------------------------- */

    function paintSky() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var c = camAt(0.02);
      var top = hz + (-hz - 40) * c.s + c.y;
      var g = ctx.createLinearGradient(0, top, 0, hz + c.y + 8);
      g.addColorStop(0, rgb(P.skyTop));
      g.addColorStop(0.52, rgb(P.skyMid));
      g.addColorStop(0.88, rgb(mix(P.skyMid, P.skyHz, 0.72)));
      g.addColorStop(1, rgb(P.skyHz));
      ctx.fillStyle = rgb(P.skyTop);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Math.max(0, hz + c.y + 8));
    }

    function paintStars(alpha, mirror) {
      if (alpha <= 0.004) return;
      var i, b, n = sx.length;
      ctx.fillStyle = rgb(P.star);
      for (b = 0; b < bins; b++) {
        var a = binA[b] * alpha;
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        var any = false;
        for (i = 0; i < n; i++) {
          if (sBin[i] !== b) continue;
          var r = sr[i], y = mirror ? (2 * waterY - sy[i]) : sy[i];
          if (mirror && (y > H + 40 || y < waterY - 2)) continue;
          ctx.rect(sx[i] - r * 0.5, y - r * 0.5, r, r);
          any = true;
        }
        if (any) ctx.fill();
      }
      /* the handful of bright ones get a real disc and a soft edge */
      ctx.globalAlpha = alpha;
      for (i = 0; i < bigX.length; i++) {
        var y2 = mirror ? (2 * waterY - bigY[i]) : bigY[i];
        if (mirror) continue;
        var rr = bigR[i];
        var rg = ctx.createRadialGradient(bigX[i], y2, 0, bigX[i], y2, rr * 3.1);
        rg.addColorStop(0, rgba(P.star, 0.95 * P.starA));
        rg.addColorStop(0.34, rgba(P.star, 0.30 * P.starA));
        rg.addColorStop(1, rgba(P.star, 0));
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(bigX[i], y2, rr * 3.1, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgb(P.star);
      }
      ctx.globalAlpha = 1;
    }

    /* the only vermilion on the page: a low smear along the horizon,
       brightest left of centre, cut off above by the far ridge */
    /* one squashed ellipse of light, so there is no edge anywhere:
       a clipped rectangle leaves a hard line and reads as a band */
    function smear(cx, cy, rx, ry, a) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgba(P.accent, a));
      g.addColorStop(0.26, rgba(P.accent, a * 0.42));
      g.addColorStop(0.62, rgba(P.accent, a * 0.09));
      g.addColorStop(1, rgba(P.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }

    function paintHorizon(alpha) {
      if (alpha <= 0.01) return;
      /* added, not laid over: vermilion on ink has to read as light,
         never as a brown wash */
      if (P.dark) ctx.globalCompositeOperation = 'lighter';
      smear(W * 0.34, hz, W * 0.50, H * 0.05, 0.78 * alpha);
      /* QA-3 D4: this edge was the faintest warm thing on the front page —
         fainter than the nav's current mark. The ranges still stand in
         front of most of it, so what a visitor sees is light BEHIND the
         mountains rather than a rule across the hero. */
      var l = ctx.createLinearGradient(W * 0.34 - W * 0.5, 0, W * 0.34 + W * 0.58, 0);
      l.addColorStop(0, rgba(P.accent, 0));
      l.addColorStop(0.42, rgba(P.accent, 0.82 * alpha));
      l.addColorStop(1, rgba(P.accent, 0));
      ctx.fillStyle = l;
      ctx.fillRect(-W, hz - 0.5, W * 3, 1.1);
      ctx.globalCompositeOperation = 'source-over';
    }

    function ridgePath(R, flipAt) {
      var n = R.x.length, i;
      ctx.beginPath();
      if (flipAt != null) {
        ctx.moveTo(R.x[0], 2 * flipAt - R.y[0]);
        for (i = 1; i < n; i++) ctx.lineTo(R.x[i], 2 * flipAt - R.y[i]);
        ctx.lineTo(R.x[n - 1], flipAt - (R.base - flipAt) - H * 2);
        ctx.lineTo(R.x[0], flipAt - (R.base - flipAt) - H * 2);
      } else {
        ctx.moveTo(R.x[0], R.y[0]);
        for (i = 1; i < n; i++) ctx.lineTo(R.x[i], R.y[i]);
        ctx.lineTo(R.x[n - 1], R.base + H * 2);
        ctx.lineTo(R.x[0], R.base + H * 2);
      }
      ctx.closePath();
    }

    function ridgeFill(R) {
      var t = R.f;                                   // 0 far … 1 near
      /* the ONE NIGHT ramp, exactly as scene.js paints the three ambient
         planes. On paper the ranges keep their own lighter set, because
         there the type is ink-black and has to read over them. */
      var crest = P.dark ? crestTone(1 - t, true) : mix(P.far, P.deep, Math.pow(t, 0.78));
      var foot = P.dark ? footTone(1 - t, true)
                        : mix(mix(P.far, P.deep, Math.pow(t, 0.78)), P.skyHz, (1 - t) * 0.42 + 0.06);
      var g = ctx.createLinearGradient(0, R.base - R.amp * 1.05, 0, R.base + H * 0.10);
      g.addColorStop(0, rgb(crest));
      g.addColorStop(1, rgb(foot));
      return g;
    }

    /* the haze the far ranges stand in: a low band of sky, tight to the
       horizon. Atmospheric perspective, not a glow over the picture. */
    function paintHaze(alpha) {
      var c = camAt(0.30);
      var y = hz + c.y, top = y - H * 0.13 * c.s, bot = y + H * 0.055 * c.s;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, rgba(P.skyHz, 0));
      g.addColorStop(0.62, rgba(P.skyHz, 0.30 * alpha));
      g.addColorStop(0.88, rgba(P.skyHz, 0.42 * alpha));
      g.addColorStop(1, rgba(P.skyHz, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, top, W, bot - top);
    }

    function paintRidges(alpha) {
      for (var k = 0; k < ridge.length; k++) {
        var R = ridge[k];
        var a = clamp(alpha * 1.25 - k * 0.06, 0, 1);
        if (a <= 0.01) continue;
        apply(0.10 + R.f * 0.86);
        ctx.globalAlpha = a;
        ctx.fillStyle = ridgeFill(R);
        ridgePath(R, null);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (k === 1) paintHaze(alpha);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* a still lake: the sky and the ridges handed back, softened */
    function paintWater(alpha) {
      var c = camAt(0.42);
      var wy = hz + (waterY - hz) * c.s + c.y;
      if (wy > H + 4) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, wy, W, H - wy + 2); ctx.clip();
      var g = ctx.createLinearGradient(0, wy, 0, H);
      g.addColorStop(0, rgb(mix(P.skyHz, P.deep, P.dark ? 0.50 : 0.24)));
      g.addColorStop(0.3, rgb(mix(P.skyHz, P.deep, P.dark ? 0.86 : 0.50)));
      g.addColorStop(1, rgb(P.deep));
      ctx.fillStyle = g;
      ctx.fillRect(0, wy, W, H - wy + 2);

      if (!phone) {
        /* the near ridges, mirrored and very faint */
        ctx.save();
        for (var k = Math.max(0, ridge.length - 2); k < ridge.length; k++) {
          ctx.globalAlpha = 0.085 * alpha;
          ctx.fillStyle = rgb(mix(P.deep, P.skyHz, 0.4));
          ridgePath(ridge[k], wy);
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      /* the sky, given back */
      ctx.save();
      ctx.translate(0, 2 * (wy - waterY));
      paintStars(0.16 * alpha, true);
      ctx.restore();

      /* the horizon, given back — a soft column, not a flooded field */
      if (P.dark) ctx.globalCompositeOperation = 'lighter';
      smear(W * 0.34, wy, W * 0.30, H * 0.13, 0.26 * alpha);
      ctx.globalCompositeOperation = 'source-over';

      /* ripples: horizontal breaks that crowd towards the far shore */
      var r = rng(771), NR = phone ? 26 : 58;
      ctx.fillStyle = rgb(mix(P.deep, P.skyHz, P.dark ? 0.62 : 0.24));
      for (var i = 0; i < NR; i++) {
        var t = Math.pow(i / NR, 1.65);
        var y = wy + t * (H - wy) * 1.3;
        if (y > H) break;
        var w = W * (0.1 + r() * 0.55), x = -W * 0.1 + r() * W * 1.1;
        ctx.globalAlpha = (0.06 + r() * 0.16) * alpha * (0.3 + t * 0.9);
        ctx.fillRect(x, y, w, Math.max(0.7, 0.5 + t * 1.8));
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* the shore we are standing on: the last form, nearly black */
    function paintShore(alpha) {
      if (!shore) return;
      apply(1.05);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgb(P.deep);
      ridgePath(shore, null);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var shore = null;

    function paintVeil() {
      if (p <= 0.004) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      var ground = cvar('--ground', '#0A0F14');
      g.addColorStop(0, rgba(ground, 0.72 * p));
      g.addColorStop(0.45, rgba(ground, 0.90 * p));
      g.addColorStop(1, rgba(ground, 0.97 * p));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function paintGrainAndEdge() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (grain) {
        ctx.globalAlpha = P.dark ? 0.042 : 0.026;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      var ground = cvar('--ground', '#0A0F14');
      var v = ctx.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.30,
                                       W * 0.5, H * 0.46, Math.max(W, H) * 0.78);
      v.addColorStop(0, rgba(ground, 0));
      v.addColorStop(1, rgba(ground, P.dark ? 0.62 : 0.30));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    function paint() {
      if (!ctx) return;
      /* the opening reveals the world outwards: sky, then depth,
         then the horizon, then the forms nearest to us */
      var o = open;
      var aSky = clamp(o / 0.18, 0, 1);
      var aStar = clamp((o - 0.05) / 0.40, 0, 1);
      var aHz = clamp((o - 0.22) / 0.34, 0, 1);
      var aRidge = clamp((o - 0.03) / 0.44, 0, 1);
      var aWater = clamp((o - 0.26) / 0.40, 0, 1);

      /* as the camera climbs, the land falls away and dims out of the
         page's way; only a faint dust of sky is left behind the text */
      var away = 1 - p * 0.86;

      paintSky();
      apply(0.06);
      paintStars(aStar * (1 - p * 0.45), false);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      apply(0.10);
      paintHorizon(aHz * away);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintRidges(aRidge * away);
      paintWater(aWater * away);
      paintShore(clamp((o - 0.10) / 0.40, 0, 1) * away);
      paintGrainAndEdge();
      paintVeil();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (aSky < 1) { /* keeps the first frames from flashing the ground */ }
    }

    /* ---- the loop: it runs for the opening and for camera moves,
       and stops the moment nothing is in flight ------------------ */
    var raf = 0, t0 = 0, tPrev = 0, running = false, paused = false, killed = false;
    var lastDrawnP = -1, lastDrawnOpen = -1, settledSaid = false;
    var frames = 0, cost = 0, worst = 0;

    function step(now) {
      raf = 0;
      if (killed || paused) { running = false; return; }
      var f0 = performance.now();
      if (!t0) { t0 = now; tPrev = now; }
      var dt = Math.min(0.5, Math.max(0.001, (now - tPrev) / 1000));
      tPrev = now;
      if (open < 1) open = reduced ? 1 : clamp(outQuint(clamp((now - t0) / OPEN_MS, 0, 1)), 0, 1);
      var dp = pTarget - p;
      /* a time-based follow, so the camera takes the same ~0.4 s to catch up
         whatever the frame rate — and lands exactly when frames are starved */
      p += dp * (1 - Math.pow(0.00006, dt));
      if (Math.abs(dp) < 0.0012) p = pTarget;
      paint();
      lastDrawnP = p; lastDrawnOpen = open;
      var c = performance.now() - f0;
      frames++; cost += c; if (c > worst) worst = c;
      window.__world = { frames: frames, avgMs: +(cost / frames).toFixed(2), maxMs: +worst.toFixed(2),
                         stars: sx ? sx.length : 0, settled: false };
      if (open >= 1 && p === pTarget) {
        running = false;
        window.__world.settled = true;
        if (!settledSaid) {
          settledSaid = true;
          say(starLine() + '.');
        }
        return;
      }
      raf = requestAnimationFrame(step);
    }

    function starLine() {
      var n = sx ? sx.length : 0;
      return (opts.stars && n === opts.stars)
        ? n.toLocaleString('en-GB') + ' stars, one for every commit'
        : n.toLocaleString('en-GB') + ' stars';
    }

    function wake() {
      if (killed || paused || running || !ctx) return;
      if (open >= 1 && p === pTarget) { return; }
      running = true;
      raf = requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    /* ---- inputs ------------------------------------------------ */
    function setProgress(v) {
      v = clamp(+v || 0, 0, 1);
      if (Math.abs(v - pTarget) < 0.0004) return;
      pTarget = v;
      if (reduced) { p = v; paint(); return; }
      wake();
    }

    var onScroll = null;
    if (opts.auto !== false) {
      onScroll = function () {
        setProgress((window.scrollY || window.pageYOffset || 0) / travel);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var rt = 0;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (killed) return;
        size(); makeShore();
        if (onScroll) onScroll();
        paint();
        wake();
      }, 180);
    }
    window.addEventListener('resize', onResize);
    function onTheme() { setTimeout(function () { if (!killed) { palette(); paint(); } }, 20); }
    document.addEventListener('inkthemechange', onTheme);
    function onVis() { if (document.hidden) stop(); else wake(); }
    document.addEventListener('visibilitychange', onVis);

    function makeShore() {
      var tbl = noiseTable(8821);
      var pts = phone ? 60 : 130, x0 = -W * 0.34, x1 = W * 1.34;
      var baseY = hz + H * 0.52, amp = H * 0.15;
      var px = new Float32Array(pts + 1), py = new Float32Array(pts + 1);
      for (var i = 0; i <= pts; i++) {
        var x = x0 + (x1 - x0) * (i / pts);
        var n = ridged(x * 0.62 / W * (phone ? 1.3 : 3.4), tbl, 3);
        px[i] = x; py[i] = baseY - amp * (n * 0.8 + 0.26);
      }
      shore = { f: 1, x: px, y: py, base: baseY + H, amp: amp };
    }

    /* ---- go ---------------------------------------------------- */
    size();
    makeShore();
    if (onScroll) onScroll();
    if (reduced) {
      open = 1; p = pTarget;
      paint();
      window.__world = { frames: 1, avgMs: 0, maxMs: 0, stars: sx.length, settled: true, reduced: true };
      say(starLine() + ' · still frame (reduced motion)');
    } else {
      open = 0;
      paint();
      running = true;
      raf = requestAnimationFrame(step);
      say(starLine() + ' · the camera is pulling back…');
    }

    var api = {
      failed: false,
      stars: function () { return sx ? sx.length : 0; },
      /* true once the opening has finished and the camera has caught up —
         a caller that wants to put the world to sleep can wait for the
         opening to have said its piece first. */
      settled: function () { return open >= 1 && p === pTarget; },
      setProgress: setProgress,
      pause: function () { paused = true; stop(); },
      resume: function () { if (killed) return; paused = false; paint(); wake(); },
      repaint: function () { if (!killed) { size(); makeShore(); paint(); } },
      destroy: function () {
        if (killed) return;
        killed = true; stop();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('inkthemechange', onTheme);
        document.removeEventListener('visibilitychange', onVis);
        if (onScroll) window.removeEventListener('scroll', onScroll);
        try { host.removeChild(cvs); } catch (e) {}
      },
      canvas: cvs
    };
    return api;
  }

  var current = null;

  /* Two doors, on purpose. The ambient engine (scene.js) offers ITS host to
     `InkWorld.mount` whenever this file is on the page, and takes the offer
     being accepted as "a richer world is driving, do not paint the ranges".
     The front page does not want that: its world belongs to the HERO, one
     screen of it, and the night behind the rest of the document has to be
     the same sky and the same ranges every other page carries. So the hero
     calls `mountHero`, and `mount` is only published on a page that has no
     hero host of its own — a page that really does want this world behind
     all of it. */
  var heroHost = document.getElementById('world');
  window.InkWorld = {
    mountHero: function (el, opts) { current = build(el, opts); return current; },
    setProgress: function (v) { if (current) current.setProgress(v); },
    pause: function () { if (current) current.pause(); },
    resume: function () { if (current) current.resume(); },
    destroy: function () { if (current) { current.destroy(); current = null; } },
    get: function () { return current; }
  };
  if (!heroHost) window.InkWorld.mount = window.InkWorld.mountHero;
})();
