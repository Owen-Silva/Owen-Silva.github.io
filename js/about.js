/* ============================================================
   about.js — the far edge of the world.

   One scene, and it is the page's whole argument: nine ridges
   receding into haze, one for every design direction this site
   was drawn in. The further a direction got, the further away
   its ridge stands; the one that was kept is the lit ridge at
   the horizon, and it is the only vermilion on the page.

   Built on window.Scene (js/scene.js), so it inherits that
   contract: DPR capped at 2, it starts when it scrolls into
   view, the loop stops the moment it settles, reduced motion
   gets the settled frame, and a failure says why in words.
   The camera (window.InkScene) is used if it is there and the
   page is complete without it.

   Every word it speaks is read out of the page itself — the
   five rounds under "How this site was made" — so the facts
   exist as real text whether or not this file ever runs.
   ============================================================ */
(function () {
  'use strict';

  /* the nine lanes and the rounds each one ran in.
     Farthest first: the further a direction got, the further
     away it stands, so lane I sits on the horizon. */
  var LANES = [
    { id: 'I', a: 3, b: 5, mine: true },
    { id: 'H', a: 3, b: 5 },
    { id: 'G', a: 3, b: 5 },
    { id: 'F', a: 3, b: 3 },
    { id: 'E', a: 3, b: 3 },
    { id: 'D', a: 3, b: 3 },
    { id: 'C', a: 1, b: 2 },
    { id: 'B', a: 1, b: 2 },
    { id: 'A', a: 1, b: 2 }
  ];

  var CROP = 0.06;   /* how much of each ridge's own crest the noise may cut */

  /* ---- small maths ---------------------------------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function hash1(n) { var s = Math.sin(n * 127.1) * 43758.5453123; return s - Math.floor(s); }
  function vn(x, seed) {
    var i = Math.floor(x), f = x - i;
    var a = hash1(i + seed), b = hash1(i + 1 + seed);
    var u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
  function fbm(x, seed) {
    return vn(x, seed) * 0.52 +
           vn(x * 2.07 + 11.3, seed + 3.7) * 0.26 +
           vn(x * 4.13 + 5.9, seed + 7.1) * 0.14 +
           vn(x * 8.63 + 2.3, seed + 13.9) * 0.08;
  }

  /* ---- one light, one place -------------------------------
     js/scene.js draws a dawn on every other page: a gather into
     the sky, the edge on a crest, the light falling onto the
     plain, all of it lit by ONE distribution, so the light is a
     place on the horizon and never a stripe across the page.
     This page owns its horizon — the engine stands its own down
     while #ridge-svg is on screen — so it draws that same dawn
     itself, from scene.js's own numbers. Everything below is
     copied from paintDawn() / farOpts() there and the two have
     to be changed together (QA-4 D15: one night, one drawing). */
  var PHONE = matchMedia('(max-width: 600px), (pointer: coarse)').matches;
  var LIGHT = [[0, 0.16], [0.10, 0.34], [0.26, 1], [0.42, 0.62],
               [0.54, 0.10], [0.68, 0.88], [0.84, 0.22], [1, 0.05]];
  function lightAt(u) {
    for (var i = 1; i < LIGHT.length; i++) {
      if (u <= LIGHT[i][0]) {
        var a = LIGHT[i - 1], b = LIGHT[i];
        return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
      }
    }
    return LIGHT[LIGHT.length - 1][1];
  }

  /* scene.js's crest(seed, terms): harmonics, so a profile and not
     a scribble. The kept direction's ridge is drawn with the
     engine's own dawn crest — seed 7717, four harmonics — so the
     edge lit here is the edge the engine lights on every other
     page, and the light's two places fall on the same peaks. */
  function crestFn(seed, terms) {
    var A = [], F = [], P = [], norm = 0, s = seed, i, a;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (i = 0; i < terms; i++) {
      a = Math.pow(0.56, i) * (0.75 + 0.5 * rnd());
      A.push(a);
      F.push(Math.PI * (0.9 + 1.4 * rnd()) * Math.pow(2.04, i));
      P.push(rnd() * 6.283);
      norm += a;
    }
    return function (x) {
      var v = 0;
      for (var j = 0; j < terms; j++) v += A[j] * Math.sin(x * F[j] + P[j]);
      return v / norm;
    };
  }
  var DAWN_CREST = crestFn(7717, 4);

  /* ---- colour: read off the host, so the theme drives it --- */
  function rgb(str) {
    str = (str || '').trim();
    if (str.charAt(0) === '#') {
      var h = str.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var n = parseInt(h.slice(0, 6), 16);
      if (isNaN(n)) return [0, 0, 0];
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = str.match(/-?\d+(\.\d+)?/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return [0, 0, 0];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function paint(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' +
           (a == null ? 1 : Math.round(a * 1000) / 1000) + ')';
  }

  /* ---- the five rounds, read out of the page --------------- */
  function readRounds() {
    var out = [];
    var lis = document.querySelectorAll('#ab-rounds li');
    [].forEach.call(lis, function (li) {
      var h = li.querySelector('h3'), p = li.querySelector('p');
      out.push({
        n: parseInt(li.getAttribute('data-round'), 10) || out.length + 1,
        lanes: parseInt(li.getAttribute('data-lanes'), 10) || 0,
        t: h ? h.textContent.replace(/\s+/g, ' ').trim() : '',
        d: p ? p.textContent.replace(/\s+/g, ' ').trim() : ''
      });
    });
    return out;
  }

  /* ============================================================
     the ridge scene
     ============================================================ */
  function ridgeScene() {
    var S = window.Scene, I = window.Ink;
    var host = document.getElementById('ridge-pane');
    if (!host || !S) return;

    var svg = document.getElementById('ridge-svg');
    var cvs = document.getElementById('ridge-cv');
    var ROUNDS = readRounds();
    var report = (I && I.reporter) ? I.reporter('about-state') : function (msg, bad) {
      var n = document.getElementById('about-state');
      if (!n) return;
      n.textContent = msg;
      if (bad) n.setAttribute('data-bad', '1'); else n.removeAttribute('data-bad');
    };

    var L = { ridges: [], stars: [] };
    var hot = -1;

    /* The world (js/scene.js) stands its own ranges behind every
       page. On this page the range IS the content, so the page's
       stylesheet stands those ambient ranges down and this scene
       carries the landscape alone — one horizon, one vermilion. */
    function worldLive() {
      return !!(window.InkScene && window.InkScene.world && window.InkScene.world.host &&
                document.documentElement.classList.contains('has-ink-world'));
    }

    function tone(name, fallback) {
      var v = '';
      try { v = getComputedStyle(host).getPropertyValue(name); } catch (e) {}
      return rgb(v || fallback || '#000');
    }

    /* ---- layout: the range, the stars, the hit bands -------- */
    function layout(g) {
      var W = g.W, H = g.H;
      var hero = host.parentElement;
      var vTop = 0, vBot = H;
      try {
        var hr = hero.getBoundingClientRect(), pr = host.getBoundingClientRect();
        if (hr.height > 0 && pr.height > 0) {
          vTop = clamp(((hr.top - pr.top) / pr.height) * H, 0, H);
          vBot = clamp(((hr.bottom - pr.top) / pr.height) * H, 0, H);
        }
      } catch (e) {}
      if (vBot - vTop < 80) { vTop = 0; vBot = H; }

      var narrow = W < 760;
      var view = vBot - vTop;
      var hy = vTop + view * (narrow ? 0.40 : 0.50);

      /* the horizon never crosses the title: it settles below it,
         whatever the type does at this width. */
      try {
        var txt = hero.querySelector('.ab-hero__text');
        if (txt) {
          var tr = txt.getBoundingClientRect(), pr2 = host.getBoundingClientRect();
          if (tr.height > 0 && pr2.height > 0) {
            hy = Math.max(hy, ((tr.bottom - pr2.top) / pr2.height) * H + view * 0.055);
          }
        }
      } catch (e) {}
      hy = Math.min(hy, vTop + view * 0.70);
      var span = vBot - hy;
      var n = LANES.length;
      var step = narrow ? 5 : 4;

      L.W = W; L.H = H; L.narrow = narrow;
      L.vTop = vTop; L.vBot = vBot; L.hy = hy;

      L.skyA = tone('--ridge-sky-a', '#06090C');
      L.skyB = tone('--ridge-sky-b', '#16232B');
      L.far = tone('--ridge-far', '#364852');
      L.near = tone('--ridge-near', '#05080B');
      L.lit = tone('--ridge-lit', '#F0603A');
      L.star = tone('--ridge-star', '#ECE5D7');

      /* the dawn, in scene.js's own units — fractions of the
         VIEWPORT, so this horizon is drawn at the size the
         engine's is on the screens either side of it */
      var wa = tone('--wash-a', '#070B0F');
      L.dark = (wa[0] + wa[1] + wa[2]) / 3 < 128;      /* scene.js isDark() */
      L.landDeep = L.dark ? wa : tone('--ground', '#EFE9DC');
      L.k = L.dark ? 1 : 0.55;                         /* paintDawn's k     */
      var vh = window.innerHeight || 800;
      L.G = Math.round((PHONE ? 0.22 : 0.26) * vh);    /* gather into the sky */
      L.S = Math.round((PHONE ? 0.09 : 0.10) * vh);    /* the spill below     */
      L.fall = Math.round(0.020 * vh);                 /* farOpts rimFall     */
      L.edgeW = PHONE ? 2.2 : 2.6;                     /* the ribbon's width  */
      L.glow = PHONE ? 4 : 5;
      L.wide = PHONE ? 11 : 15;
      L.strip = null;                                  /* both rebuilt on the */
      L.edgeCv = null;                                 /* next frame          */

      L.stars = [];
      var wantStars = 0;
      try { wantStars = parseFloat(getComputedStyle(host).getPropertyValue('--ridge-stars')) || 0; } catch (e) {}

      /* a handful of fixed stars, never a starfield and never a twinkle */
      if (wantStars > 0.5) {
        var count = narrow ? 18 : 30;
        for (var s = 0; s < count; s++) {
          var sx = hash1(s * 3.11 + 1.7) * W;
          var sy = vTop + hash1(s * 7.31 + 5.3) * Math.max(24, hy - vTop - 18);
          var mag = hash1(s * 13.7 + 2.9);
          L.stars.push({ x: sx, y: sy, r: 0.55 + mag * 0.85, a: 0.14 + mag * 0.4 });
        }
      }

      L.ridges = [];
      for (var k = 0; k < n; k++) {
        var u = n === 1 ? 1 : k / (n - 1);              /* 0 = the horizon, 1 = underfoot */
        var base = hy + span * (0.045 + 1.05 * Math.pow(u, 1.15));
        var amp = span * (0.055 + 0.60 * Math.pow(u, 1.3));
        /* distance is spatial frequency: a far range is many small
           teeth, the one underfoot is two or three big masses */
        var freq = 5.4 - u * 3.6;
        var seed = 31.7 + k * 17.13;
        var lf = LANES[k].mine ? DAWN_CREST : null;   /* the engine's own edge */
        var pts = [], top = Infinity;
        for (var x = 0; x <= W + step; x += step) {
          var px = Math.min(x, W);
          var uu = px / Math.max(1, W);
          var nz = (fbm(uu * freq, seed) - 0.5) * 2.1;
          var y = lf ? base + amp * lf(uu) : base - nz * amp;
          pts.push(px, y);
          if (y < top) top = y;
          if (px >= W) break;
        }
        L.ridges.push({
          lane: LANES[k], u: u, base: base, amp: amp, top: top, pts: pts,
          fill: mix(L.far, L.near, Math.pow(u, 0.66)),
          haze: Math.max(18, span * 0.20),
          start: 0.10 + u * 0.46
        });
      }

      /* the hit bands: one per ridge, between its crest and the
         crest of the one in front of it. Invisible, but real. */
      if (!svg) return;
      for (var b = 0; b < L.ridges.length; b++) {
        var r = L.ridges[b];
        var nextTop = b + 1 < L.ridges.length ? L.ridges[b + 1].top : vBot + 40;
        var y0 = clamp(r.top - (b === 0 ? 26 : 6), vTop, vBot);
        var y1 = clamp(nextTop - 6, vTop, vBot);
        if (y1 - y0 < 9) y1 = Math.min(vBot, y0 + 9);
        var ln = r.lane, rd = ROUNDS[ln.b - 1];
        var rect = S.el('rect', {
          'class': 'ridge-hit', x: 0, y: y0, width: W, height: Math.max(9, y1 - y0),
          fill: 'transparent', tabindex: '0', role: 'button', 'data-i': b,
          'aria-label': 'Direction ' + ln.id + ', ' + statusOf(ln) + '. Last round: ' +
            (rd ? rd.t + '. ' + rd.d : 'round ' + ln.b + '.')
        });
        (function (i) {
          rect.addEventListener('pointerenter', function () { say(i); });
          rect.addEventListener('focus', function () { say(i); });
          rect.addEventListener('pointerleave', function () { say(-1); });
          rect.addEventListener('blur', function () { say(-1); });
        })(b);
        svg.appendChild(rect);
      }
    }

    function statusOf(ln) {
      if (ln.mine) return 'kept — this site is drawn in it';
      if (ln.b >= ROUNDS.length && ROUNDS.length) return 'ran to the last round';
      return 'stopped after round ' + ln.b;
    }

    /* ---- one frame ----------------------------------------- */
    function crest(ctx, r, dy, from, to) {
      var p = r.pts, i;
      var a = Math.max(0, Math.floor((from == null ? 0 : from) * (p.length / 2 - 1))) * 2;
      var b = Math.min(p.length - 2, Math.ceil((to == null ? 1 : to) * (p.length / 2 - 1)) * 2);
      if (b <= a) return false;
      ctx.beginPath();
      ctx.moveTo(p[a], p[a + 1] + dy);
      for (i = a + 2; i <= b; i += 2) ctx.lineTo(p[i], p[i + 1] + dy);
      return true;
    }

    /* ---- the dawn ------------------------------------------
       scene.js hangs this on one div as three CSS layers; here
       it is the same three things in canvas — the gather, the
       edge, the spill — with paintDawn()'s numbers. */

    /* the dawn's distribution times a crest's own height: the
       light lands where a range stands highest and the valleys
       stay dark, so an edge reads as a silhouette taking light
       and never as a rule across the page (scene.js edgeMask
       and rimLight, the same expression). */
    function litGradient(ctx, r, a, floor) {
      var p = r.pts, n = p.length / 2, i, y, lo = Infinity, hi = -Infinity;
      for (i = 0; i < n; i++) { y = p[i * 2 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      var gr = ctx.createLinearGradient(0, 0, L.W, 0), N = 48;
      for (i = 0; i <= N; i++) {
        var u = i / N;
        y = p[Math.round(u * (n - 1)) * 2 + 1];
        var hgt = hi === lo ? 1 : (hi - y) / (hi - lo);          /* 1 at the peaks */
        gr.addColorStop(u, paint(L.lit, Math.min(1,
          a * lightAt(u) * (floor + (1 - floor) * Math.pow(hgt, 1.7)))));
      }
      return gr;
    }

    /* the gather and the spill are one gradient running through
       the edge: 26vh of sky gathering above the line, 10vh of it
       falling on the plain below, the whole of it masked by the
       light. Built once per layout and blitted, so a frame costs
       one drawImage and the loop still stops. */
    function litStrip(W, h, stops) {
      var cv = document.createElement('canvas'), i;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      var c = cv.getContext('2d');
      if (!c) return null;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var gd = c.createLinearGradient(0, 0, 0, h);
      for (i = 0; i < stops.length; i++) gd.addColorStop(stops[i][0], paint(L.lit, stops[i][1]));
      c.fillStyle = gd;
      c.fillRect(0, 0, W, h);
      /* one distribution masks the gather, the spill, the edge and
         the light the dawn leaves on the land, so they can only
         ever be the same dawn */
      c.globalCompositeOperation = 'destination-in';
      var mk = c.createLinearGradient(0, 0, W, 0);
      for (i = 0; i <= 16; i++) mk.addColorStop(i / 16, 'rgba(0,0,0,' + lightAt(i / 16).toFixed(3) + ')');
      c.fillStyle = mk;
      c.fillRect(0, 0, W, h);
      cv.__h = h;
      return cv;
    }

    function buildStrip(W) {
      var G = L.G, S = L.S, k = L.k, h = G + S;
      return litStrip(W, h, [
        [0, 0],
        [0.42 * G / h, 0.030 * k],
        [0.80 * G / h, 0.085 * k],
        [G / h, 0.190 * k],
        [(G + 0.38 * S) / h, 0.060 * k],
        [1, 0]
      ]);
    }

    /* the edge on its own strip, so its two glows can be the
       filter scene.js hangs on the element, verbatim */
    function buildEdge(W, r) {
      var p = r.pts, i, lo = Infinity, hi = -Infinity;
      for (i = 0; i < p.length; i += 2) {
        if (p[i + 1] < lo) lo = p[i + 1];
        if (p[i + 1] > hi) hi = p[i + 1];
      }
      var pad = 6 + L.edgeW, top = lo - pad, h = (hi - lo) + pad * 2;
      var cv = document.createElement('canvas');
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      var c = cv.getContext('2d');
      if (!c) return null;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.strokeStyle = litGradient(c, r, 0.88 * L.k, 0.04);
      c.lineWidth = L.edgeW; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(p[0], p[1] - top);
      for (i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1] - top);
      c.stroke();
      cv.__top = top; cv.__h = h;
      return cv;
    }

    function drawDawn(ctx, r, dy, a, hotter) {
      if (!L.strip) L.strip = buildStrip(L.W);
      if (L.strip) {
        ctx.globalAlpha = a;
        ctx.drawImage(L.strip, 0, Math.round(r.base + dy) - L.G, L.W, L.G + L.S);
      }
      if (!L.edgeCv) L.edgeCv = buildEdge(L.W, r);
      var e = L.edgeCv;
      ctx.globalAlpha = 1;
      if (!e) return;
      ctx.save();
      ctx.globalAlpha = a;
      if ('filter' in ctx) {
        ctx.filter = 'drop-shadow(0 0 ' + L.glow + 'px ' + paint(L.lit, 0.42 * L.k) + ') ' +
                     'drop-shadow(0 1px ' + L.wide + 'px ' + paint(L.lit, 0.26 * L.k) + ')';
      }
      ctx.drawImage(e, 0, e.__top + dy, L.W, e.__h);
      ctx.restore();
      /* a pointer on the horizon brightens it; nothing moves */
      if (hotter) {
        ctx.globalAlpha = 0.45 * a;
        ctx.drawImage(e, 0, e.__top + dy, L.W, e.__h);
      }
      ctx.globalAlpha = 1;
    }

    function draw(g, p) {
      var ctx = g.ctx, W = L.W, H = L.H;
      if (!ctx) return;

      /* the sky: one gradient, ground to haze, nothing else */
      var skyIn = clamp(p / 0.22, 0, 1);
      var gd = ctx.createLinearGradient(0, L.vTop - H * 0.1, 0, L.hy);
      gd.addColorStop(0, paint(L.skyA, 1));
      gd.addColorStop(0.62, paint(mix(L.skyA, L.skyB, 0.55), 1));
      gd.addColorStop(1, paint(L.skyB, 1));
      ctx.globalAlpha = skyIn;
      ctx.fillStyle = gd;
      ctx.fillRect(0, 0, W, L.hy + 2);
      /* below the horizon the ground carries on to the bottom edge */
      ctx.fillStyle = paint(L.skyB, 1);
      ctx.fillRect(0, L.hy, W, H - L.hy);

      /* the stars */
      var starIn = clamp((p - 0.05) / 0.4, 0, 1);
      if (starIn > 0) {
        for (var s = 0; s < L.stars.length; s++) {
          var st = L.stars[s];
          ctx.globalAlpha = st.a * starIn;
          ctx.fillStyle = paint(L.star, 1);
          ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.2832); ctx.fill();
        }
      }

      /* the range, far to near: each one covers what is behind it */
      for (var k = 0; k < L.ridges.length; k++) {
        var r = L.ridges[k];
        var q = easeOut(clamp((p - r.start) / 0.34, 0, 1));
        if (q <= 0) continue;
        var dy = (1 - q) * (12 + 34 * r.u);
        var lit = !!r.lane.mine;

        /* the ranges standing IN the dawn take its light the way
           the engine's far and deep ranges do: 0.74 on the one
           behind the horizon, 0.46 on the next, both on their own
           peaks only. Everything further in stays night. */
        var rimA = lit ? 0 : (k === 1 ? (L.dark ? 0.74 : 0.34)
                                      : (k === 2 ? (L.dark ? 0.46 : 0) : 0));

        /* the silhouette — haze caught on its own shoulder, so a
           ridge is a body of air and not a flat band of colour */
        ctx.globalAlpha = q;
        var gTop = r.top + dy;
        var gr = ctx.createLinearGradient(0, gTop, 0, gTop + r.haze);
        gr.addColorStop(0, paint(mix(r.fill, L.skyB, 0.34), 1));
        gr.addColorStop(1, paint(r.fill, 1));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(-2, H + 4);
        ctx.lineTo(-2, r.pts[1] + dy);
        for (var i = 0; i < r.pts.length; i += 2) ctx.lineTo(r.pts[i], r.pts[i + 1] + dy);
        ctx.lineTo(W + 2, r.pts[r.pts.length - 1] + dy);
        ctx.lineTo(W + 2, H + 4);
        ctx.closePath();
        ctx.fill();

        /* the land the lit crest belongs to, cut on its own curve
           and running out over 26vh: the edge stands on a dark
           shoulder, the way it does under the engine's dawn, and
           the haze of the ranges behind it comes back below. */
        if (lit) {
          var lTop = r.base + dy - r.amp, lRun = L.G + r.amp;   /* D + A, as the engine's box */
          ctx.save();
          ctx.clip();
          var ld = ctx.createLinearGradient(0, lTop, 0, lTop + lRun);
          ld.addColorStop(0, paint(L.landDeep, (L.dark ? 0.72 : 0.34) * q));
          ld.addColorStop((0.34 * L.G + r.amp) / lRun, paint(L.landDeep, (L.dark ? 0.34 : 0.16) * q));
          ld.addColorStop(1, paint(L.landDeep, 0));
          ctx.fillStyle = ld;
          ctx.fillRect(0, lTop, W, lRun);
          ctx.restore();
        }

        /* the light this range takes on the land under its own
           crest: not a second edge, the colour the dawn leaves */
        if (rimA) {
          if (!r.wash) {
            r.wash = litStrip(W, r.amp * 1.55 + L.fall + 4,
              [[0, (L.dark ? 0.26 : 0.14) * (k === 1 ? 1 : 0.55)], [1, 0]]);
          }
          if (r.wash) {
            ctx.save();
            ctx.clip();
            ctx.globalAlpha = q;
            ctx.drawImage(r.wash, 0, r.base + dy - r.amp, W, r.wash.__h);
            ctx.restore();
          }
        }

        /* a hairline where each ridge meets the one behind it —
           and where the dawn reaches, that hairline IS the dawn */
        if (k > 0) {
          ctx.globalAlpha = q;
          ctx.strokeStyle = rimA ? litGradient(ctx, r, rimA, 0.05)
                                 : paint(mix(r.fill, L.skyB, 0.55), 0.45);
          ctx.lineWidth = rimA ? (L.dark ? 1.5 : 1) : 1;
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          if (crest(ctx, r, dy)) ctx.stroke();
        }

        /* the kept direction's own edge: the horizon itself */
        if (lit) {
          var dawnIn = clamp((p - 0.28) / 0.46, 0, 1) * q;
          if (dawnIn > 0) drawDawn(ctx, r, dy, dawnIn, hot === k);
        } else if (hot === k) {
          ctx.globalAlpha = 0.6 * q;
          ctx.strokeStyle = paint(L.star, 1);
          ctx.lineWidth = 1.3;
          if (crest(ctx, r, dy)) ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    var sc = S.make({
      host: host, canvas: cvs, svg: svg, id: 'ridges', report: report, channel: 'ridges',
      label: 'the range', duration: 2400,
      layout: layout,
      frame: function (g, t) { draw(g, t); return false; },
      still: function (g) { draw(g, 1); }
    });

    /* ---- what the scene says ------------------------------- */
    function say(i) {
      hot = i;
      sc.paint(1);
      var out = document.getElementById('ridge-read');
      if (!out) return;
      out.innerHTML = '';
      var a = document.createElement('span'); a.className = 'k';
      var b = document.createElement('b');
      var p = document.createElement('p');
      var r = L.ridges[i];
      if (i < 0 || !r) {
        a.textContent = 'Five rounds';
        b.textContent = 'Six directions started; three were kept';
        p.textContent = 'The lit ridge at the horizon is the direction this site is drawn in. ' +
          'Point at a ridge to read how far one got; every round is written out below.';
      } else {
        var ln = r.lane, rd = ROUNDS[ln.b - 1];
        a.textContent = 'Direction ' + ln.id + ' · ' + statusOf(ln);
        b.textContent = rd ? 'Round ' + ln.b + ' — ' + rd.t : 'Round ' + ln.b;
        p.textContent = rd ? rd.d : '';
      }
      out.appendChild(a); out.appendChild(b); out.appendChild(p);
    }
    say(-1);

    /* the camera, if the engine is there — a transform on the
       host, no repaint, nothing running while the visitor is still */
    try {
      if (window.InkScene && window.InkScene.layer && !window.InkScene.reduced) {
        window.InkScene.layer(host, 0.09, { mode: 'viewport', max: 70 });
      }
    } catch (e) {}
  }

  function boot() {
    if (!window.Scene) return;
    ridgeScene();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
