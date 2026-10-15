/* ============================================================
   world.js — FIRE, on a still bay: direction B's sky over
   direction A's water. ("lets do a combination i want b but with
   a's water.")

   B's sky is untouched — the fire in the lowest quarter, the sun
   half under the waterline, the eleven underlit bands, the first
   stars. The sea is A's: a still bay that gives the sky back as
   soft mirrored bands, gives the headlands back squashed, carries
   one wide soft path of light that dies before it reaches the
   viewer, and moves only as a slow blurred swell. It is A's
   TECHNIQUE, not A's palette: every colour in the water is mixed
   out of this sky, so the gold, the coral and the magenta lie on
   it in the order they stand in the air, and it goes to
   --sun-deep at our feet.

   The hero of the front page is a bay in the last ten minutes of
   the light. The sun's disc is half under the sea's horizon; a
   gold path runs from it across the water towards the viewer; the
   sky goes gold at the horizon into orange, coral, magenta and
   then deep blue overhead; long cloud bands stretch back towards
   the horizon and take the light on their undersides; the land is
   nearly black, two ranges closing the bay at either side.

   The luminance of a real sky: the fire lives in the lowest
   quarter of it and NOWHERE else. Everything above that is deep
   and quiet, which is the only reason a cream name and a lede can
   be set across it. The type is never asked to fight the light.

   One 2D canvas, no library, and one allowed exception to the
   site's motion rule: the swell rolls — slowly — while the hero
   is on screen and the tab is visible, and stops dead otherwise.
   Reduced motion gets a still frame and no loop at all.

   HOW IT IS PAINTED
     · the whole still sea — the reflected bands, the headlands
       the water gives back, the sun's path — is painted ONCE per
       resize into an offscreen plate (A's move);
     · a still frame (sky, clouds, sun, ranges, then one blit of
       that plate) is painted whenever the camera moves, and the
       lower half of it is kept in a second offscreen;
     · a swell frame restores that band with one drawImage and
       brushes the moving water over it. A frame at rest costs a
       copy of a quarter of the canvas and a few hundred small
       sprites — never the whole picture again.

   window.InkWorld
     mountHero(el, o) build the world inside `el`. opts: {
                      onState(msg,bad), auto, travel, stars
                      (accepted and ignored: this world counts
                      nothing — it is a picture) }.
     settled()        the opening has run and the camera has caught up.
     setProgress(p)   0 = the settled opening frame, 1 = the end of
                      the camera's travel.
     pause() / resume() / destroy() / repaint()
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
  function smooth(t) { return t * t * (3 - 2 * t); }
  function sstep(a, b, x) { return a === b ? (x < a ? 0 : 1) : smooth(clamp((x - a) / (b - a), 0, 1)); }
  function outQuint(t) { return 1 - Math.pow(1 - t, 3.3); }

  /* value noise over one dimension, and a ridged sum of it: the
     mountains and the cloud bands are this function and nothing else. */
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
  function fbm(x, t, oct) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < oct; o++) { v += amp * vnoise(x * f, t); norm += amp; f *= 2.03; amp *= 0.5; }
    return v / norm;
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

  /* ---- THE EVENING ------------------------------------------
     Every colour in the picture is a CSS token (css/ink.css, the
     --sun-* block), so the same evening can be handed to the rest
     of the site without a second palette living in here. The ramp
     below is the whole point of the direction: `t` is height in the
     sky, 0 at the sea's horizon and 1 overhead, and only t < 0.25
     is allowed to be bright. */
  function skyRamp(P) {
    return [
      [0.000, P.flare],
      [0.028, P.gold],
      [0.070, P.orange],
      [0.130, P.coral],
      [0.210, mix(P.coral, P.magenta, 0.62)],
      [0.320, P.magenta],
      [0.450, mix(P.magenta, P.indigo, 0.62)],
      [0.620, P.indigo],
      [0.800, mix(P.indigo, P.zenith, 0.62)],
      [1.000, P.zenith]
    ];
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
      say('the sunset could not be drawn (' + dead + '). The page keeps the same sky as a CSS gradient.', true);
      return { failed: true, stars: 0, setProgress: function () {}, pause: function () {},
               resume: function () {}, destroy: function () {}, repaint: function () {} };
    }
    host.appendChild(cvs);
    cvs.addEventListener('contextlost', function (ev) {
      ev.preventDefault();
      lostCv = true;
      stop(); cvs.style.display = 'none';
      say('the sunset lost its canvas mid-flight, and with it the meteors. The page keeps the same sky as a CSS gradient.', true);
    });

    /* the offscreen that holds the lower half of the still frame, so a
       swell frame never repaints the sky */
    var keep = document.createElement('canvas');
    var kctx = null;
    try { kctx = keep.getContext('2d', { alpha: false }); } catch (e2) { kctx = null; }

    var lostCv = false;
    var W = 0, H = 0, dpr = 1, hz = 0, sunX = 0, sunR = 0, keepTop = 0;
    /* a CSS length that is a whole number of DEVICE pixels */
    function snapPx(v) { return Math.round(v * dpr) / dpr; }
    var travel = opts.travel || 0;
    var blurOK = false;
    try { blurOK = (typeof ctx.filter === 'string'); } catch (e3) { blurOK = false; }

    /* ---- palette, read from the stylesheet ------------------- */
    var P = {};
    function palette() {
      var ground = cvar('--ground', '#0A0F14');
      P.dark = lum(ground) < 0.5;
      P.zenith = cvar('--sun-zenith', '#0A1124');
      P.indigo = cvar('--sun-indigo', '#1E2140');
      P.magenta = cvar('--sun-magenta', '#5A2652');
      P.coral = cvar('--sun-coral', '#B8434A');
      P.orange = cvar('--sun-orange', '#DE6A33');
      P.gold = cvar('--sun-gold', '#F0913F');
      P.flare = cvar('--sun-flare', '#F9B95E');
      P.disc = cvar('--sun-disc', '#FFF3D8');
      P.cloud = cvar('--sun-cloud', '#1A1630');
      P.sea = cvar('--sun-sea', '#191621');
      P.deep = cvar('--sun-deep', '#07090F');
      P.land = cvar('--sun-land', '#090B12');
      P.star = cvar('--ink-hi', '#ECE5D7');
      P.ramp = skyRamp(P);
      /* how hard the light may push. On paper the whole evening is
         high-key — the type there is ink-black and has to read over it —
         so the fire is a wash rather than a furnace. */
      P.k = P.dark ? 1 : 0.42;
    }

    function skyAt(t) {                      // t: 0 at the horizon, 1 overhead
      var r = P.ramp, i;
      t = clamp(t, 0, 1);
      for (i = 1; i < r.length; i++) {
        if (t <= r[i][0]) {
          var u = (t - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
          return mix(r[i - 1][1], r[i][1], u);
        }
      }
      return r[r.length - 1][1];
    }

    /* ---- the first stars, high up and nearly out of it -------- */
    var stars = [], venus = null;
    function makeStars() {
      stars = [];
      var n = phone ? 44 : 90, r = rng(90917);
      for (var i = 0; i < n; i++) {
        var t = 0.52 + Math.pow(r(), 0.7) * 0.48;      // the top half of the sky only
        var x = -W * 0.1 + r() * W * 1.2;
        var y = hz - t * hz;
        var mag = Math.pow(r(), 2.2);
        stars.push({ x: x, y: y, r: 0.45 + mag * 1.0, a: (0.10 + mag * 0.30) * (P.dark ? 1 : 0.30) });
      }
      /* the evening star: the one bright thing allowed above the fire */
      venus = { x: sunX + W * 0.145, y: hz - hz * 0.615, r: 1.5 };
    }

    /* ---- the cloud bands --------------------------------------
       Long, flat, soft-edged: bands of ink lying in the air, lit on
       their undersides by a sun that is below them. They crowd and
       thin towards the horizon, which is the only perspective in the
       picture and the reason it has depth. */
    var clouds = [];
    function makeClouds() {
      clouds = [];
      var n = phone ? 7 : 11;
      for (var i = 0; i < n; i++) {
        var r = rng(7100 + i * 613);
        var u = (i + 0.18 + r() * 0.5) / n;             // never an even ladder
        var th = H * (0.0030 + Math.pow(u, 1.30) * 0.024);
        clouds.push({
          t: 0.013 + Math.pow(u, 1.72) * 0.47,          // height in the sky
          th: th,
          tbl: noiseTable(3301 + i * 271),
          brk: noiseTable(8800 + i * 331),
          /* three frequencies: the long form, where the band BREAKS, and
             the wobble of its centreline. A band with no wobble is a ruled
             line, which is exactly what a sky never has. */
          fLong: (1.4 + u * 2.4) / Math.max(320, W),
          fBrk: (0.9 + r() * 0.8) / Math.max(320, W),
          wob: th * (0.9 + r() * 1.5) + H * 0.003,
          x0: r() * 40,
          tilt: (r() - 0.5) * 0.060,
          a: 0.34 + r() * 0.38
        });
      }
      clouds.sort(function (a, b) { return b.t - a.t; });   // high ones first
    }

    /* ---- the bay ----------------------------------------------
       Three ranges, all of them standing IN the horizon, opened in the
       middle so the sea and the sun have the centre of the frame. The
       mask is what makes it a bay rather than a skyline: the land runs
       out of the picture at the sides and falls to the waterline before
       it reaches the light. */
    var ranges = [], wideRanges = null;
    function makeRanges() {
      var x0 = -W * 0.20, x1 = W * 1.20;
      /* A VERTEX EVERY COUPLE OF DEVICE PIXELS. At one every eight the
         outline can only be a smooth hump however much noise is under
         it, which is exactly what it looked like: a blob. */
      var pts = Math.max(110, Math.min(1500, Math.round((x1 - x0) * dpr / (phone ? 3 : 2))));
      ranges = rangesOver(x0, x1, pts);
      wideRanges = null;
    }
    /* THE SAME THREE RANGES, OUT PAST THE FRAME. The ascent (js/ascent.js)
       climbs out of this very bay, so it is handed these outlines rather
       than drawing headlands of its own: at sea level its land IS this
       land, vertex for vertex, and from altitude it sees round the sides
       of the frame. The extra vertices are laid on the same spacing,
       which keeps every one of the hero's own at the same x with the same
       height, so the overlap is not a copy of the hero's land, it is it. */
    function rangesWide(over) {
      if (wideRanges && wideRanges.over === over) return wideRanges;
      var x0 = -W * 0.20, x1 = W * 1.20;
      var pts = Math.max(110, Math.min(1500, Math.round((x1 - x0) * dpr / (phone ? 3 : 2))));
      var dx = (x1 - x0) / pts, k = Math.max(0, Math.ceil(over / dx));
      wideRanges = { over: over, k: k, dx: dx, list: rangesOver(x0 - k * dx, x1 + k * dx, pts + 2 * k) };
      return wideRanges;
    }
    function rangesOver(x0, x1, pts) {
      var out = [];
      var defs = [
        { seed: 1471, amp: 0.105, oct: 4, freq: 3.1, tone: 0.40, l: 0.36, rr: 0.585 },
        { seed: 9311, amp: 0.148, oct: 4, freq: 2.2, tone: 0.18, l: 0.27, rr: 0.700 },
        { seed: 5527, amp: 0.200, oct: 5, freq: 1.5, tone: 0.00, l: 0.175, rr: 0.835 }
      ];
      for (var k = 0; k < defs.length; k++) {
        var d = defs[k], tbl = noiseTable(d.seed);
        var px = new Float32Array(pts + 1), py = new Float32Array(pts + 1);
        var hh = new Float32Array(pts + 1);
        var amp = H * d.amp;
        /* the near range carries the most detail and the far one the
           least — that is what distance does to an outline, and it is
           done in the SHAPE and in the COLOUR, never by softening an edge */
        var near = k / Math.max(1, defs.length - 1);
        var oct = d.oct + (phone ? 1 : 2) + Math.round(near * 2);
        for (var i = 0; i <= pts; i++) {
          var x = x0 + (x1 - x0) * (i / pts), u = x / W;
          /* land at the left edge and at the right edge; open water between */
          var mL = 1 - sstep(d.l - 0.26, d.l, u);
          var mR = sstep(d.rr, d.rr + 0.30, u);
          var m = Math.pow(Math.max(mL, mR), 1.25);
          var n = ridged(x * (d.freq * (phone ? 2.4 : 5.2) / W) + k * 13.7, tbl, oct);
          /* a long slow swell under the detail: real ranges are not even */
          n = n * 0.74 + fbm(x * (d.freq * 0.85 / W) + k * 5.1, tbl, 2) * 0.40;
          /* crags a few pixels across, biting hardest where the range
             comes DOWN to the water: a coast gets there in steps and
             spurs, and this was a clean ramp */
          var foot = 1 - clamp((m - 0.08) / 0.50, 0, 1);
          var cr = ridged(x * (d.freq * (phone ? 11 : 26) / W) + k * 3.3, tbl, 2);
          n *= 1 - (0.10 + 0.26 * foot) * (1 - cr) * (0.55 + 0.45 * near);
          px[i] = x; hh[i] = amp * m * n;
        }
        /* THE FOOT: A SHELF, NOT A WEDGE AND NOT A WALL. Left to the side
           mask alone the land comes down to nothing over hundreds of
           pixels, so its last stretch is a sliver one or two device
           pixels tall and the antialiasing of that sliver is the smear.
           A cliff is not the answer either: a headland SHELVES into a
           bay. So the last part of the descent is held to about twenty
           degrees, the crags still poke through it, and it ends on a
           crisp foot a few device pixels tall rather than tapering off. */
        var face = 3 / dpr;                             // the foot itself: 3 device px
        var capH = Math.max(18 / dpr, H * 0.014);       // where the shelf meets the hill
        var tanS = 0.34 + 0.12 * near;                  // 19-25 degrees from the water
        var dxs = (x1 - x0) / pts;                      // one point, in CSS px
        var S = Math.max(2, Math.round((capH - face) / (tanS * dxs)));
        var iMid = Math.round((((d.l + d.rr) / 2) * W - x0) / (x1 - x0) * pts);
        iMid = Math.max(0, Math.min(pts, iMid));
        var q, cL = -1, cR = -1, eL = -1, eR = -1;
        for (q = iMid; q >= 0; q--) if (hh[q] >= capH) { cL = q; break; }
        for (q = iMid; q <= pts; q++) if (hh[q] >= capH) { cR = q; break; }
        if (cL >= 0) { for (q = cL; q <= pts; q++) if (hh[q] < face) { eL = q; break; } if (eL < 0) eL = pts; }
        if (cR >= 0) { for (q = cR; q >= 0; q--) if (hh[q] < face) { eR = q; break; } if (eR < 0) eR = 0; }
        /* the tail is not cut off, it is SQUEEZED: the same descent, with
           the same steps and spurs, done in the length a real slope would
           take. Cutting it left a wall as tall as the hill was where the
           knife fell, which is the "too steep" Owen saw. */
        var lL = eL - cL, lR = cR - eR;
        var sL = Math.min(lL, S), sR = Math.min(lR, S);
        var tL = cL >= 0 && sL > 0 ? cL + sL : -1;
        var tR = cR >= 0 && sR > 0 ? cR - sR : -1;
        for (q = 0; q <= pts; q++) {
          var hv = hh[q], sx;
          if (tL >= 0 && q > cL && q <= tL) {
            sx = Math.round(cL + (q - cL) * (lL / sL));
            hv = hh[Math.max(0, Math.min(pts, sx))];
          } else if (tR >= 0 && q < cR && q >= tR) {
            sx = Math.round(cR - (cR - q) * (lR / sR));
            hv = hh[Math.max(0, Math.min(pts, sx))];
          } else if ((tL < 0 || q > tL) && (tR < 0 || q < tR) && (tL >= 0 || tR >= 0)) {
            /* ONLY the open water between the two feet is cleared: the rule
               for one foot must never run past the other one, or it takes
               the whole of the far side with it */
            hv = 0;
          }
          py[q] = hz - hv;
        }
        out.push({ x: px, y: py, tone: d.tone, amp: amp });
      }
      return out;
    }

    /* ---- the water: direction A's bay, carrying THIS sky -------
       A's sea is a technique and not a palette. It is a still bay:
       it gives the sky back as soft mirrored bands, it gives the
       headlands back squashed, it carries ONE wide path of light
       that dies before it reaches the viewer, and the only thing
       that moves in it is a slow blurred swell. Every colour in it
       here is mixed out of the fire overhead — skyAt(t) is the same
       ramp the sky itself is painted from — so the gold, the coral
       and the magenta lie on the water in the order they stand in
       the air, and the water goes to --sun-deep at our feet.

       The still sea is painted ONCE per resize into an offscreen
       plate, padded above the waterline so a camera lift can never
       open a seam of sky under it. A frame is one drawImage. */
    var seaCv = null, SEA_PAD = 0;

    function plate(w, h) {
      var c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w * dpr));
      c.height = Math.max(2, Math.round(h * dpr));
      var g = c.getContext('2d');
      if (!g) return null;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { cv: c, g: g };
    }

    /* Where the sky's bands land on the water, and how much of each
       one survives the water in front of it. `f` is depth into the
       sea (0 at the waterline), `t` is height in the sky. A bay
       foreshortens hard: the whole lit quarter of the sky comes back
       inside the top half of the water, and everything under that is
       the water's own dark. */
    var SEA_STOPS = [
      /*  depth   sky     into the water */
      [0.000,   0.000,   0.44],
      [0.022,   0.030,   0.49],
      [0.055,   0.075,   0.55],
      [0.105,   0.135,   0.58],
      [0.175,   0.215,   0.63],
      [0.265,   0.320,   0.70],
      [0.380,   0.450,   0.80],
      [0.520,   0.620,   0.91],
      [0.700,   0.800,   0.97],
      [1.000,   1.000,   1.00]
    ];
    function seaAt(i) {
      var s = SEA_STOPS[i];
      return mix(mix(skyAt(s[1]), P.sea, s[2]), P.deep, sstep(0.30, 1.00, s[0]) * 0.95);
    }

    function makeSeaPlate() {
      SEA_PAD = snapPx(H * 0.10);      // so the plate's row 0 is a device row too
      var deep = H - hz;
      var p = plate(W, deep + SEA_PAD * 2);
      if (!p) { seaCv = null; return; }
      var g = p.g, y0 = SEA_PAD, i, k;

      /* the sky, given back */
      var grad = g.createLinearGradient(0, y0, 0, y0 + deep);
      for (i = 0; i < SEA_STOPS.length; i++) grad.addColorStop(SEA_STOPS[i][0], rgb(seaAt(i)));
      g.fillStyle = grad;
      g.fillRect(0, y0, W, deep + SEA_PAD);
      g.fillStyle = rgb(seaAt(0));
      g.fillRect(0, 0, W, y0 + 1);          // headroom: never a seam at the waterline

      /* the far water at the sides is in the headlands' shadow, not in
         the light: without this the bright row at the horizon runs
         straight across in FRONT of the land and the bay reads flat */
      /* the stops follow the bay's own opening: the land runs to u≈0.36
         on the left and picks up again at u≈0.59 on the right, which is
         where the ranges are built */
      var sh = g.createLinearGradient(0, 0, W, 0);
      sh.addColorStop(0.00, rgba(P.deep, 0.90));
      sh.addColorStop(0.14, rgba(P.deep, 0.58));
      sh.addColorStop(0.30, rgba(P.deep, 0.18));
      sh.addColorStop(0.42, rgba(P.deep, 0.02));
      sh.addColorStop(0.56, rgba(P.deep, 0.00));
      sh.addColorStop(0.66, rgba(P.deep, 0.08));
      sh.addColorStop(0.78, rgba(P.deep, 0.34));
      sh.addColorStop(0.90, rgba(P.deep, 0.62));
      sh.addColorStop(1.00, rgba(P.deep, 0.90));
      var slabs = 14;
      for (i = 0; i < slabs; i++) {
        var sf = i / slabs;
        g.globalAlpha = Math.pow(1 - sf, 1.7);
        g.fillStyle = sh;
        g.fillRect(0, y0 + deep * 0.40 * sf, W, deep * 0.40 / slabs + 1);
      }
      g.globalAlpha = 1;

      /* The sun's path. ONE wide soft wedge: wide at the top on purpose,
         because a narrow throat that opens towards the viewer is a
         runway and not a sunset. It comes out of the disc — a low hot
         lobe at the waterline, so the path has no top edge — and it is
         out of the water well before it reaches us. The near water is in
         shadow, which is also what keeps the lede on darkness. */
      var cx = sunX, steps = 72;
      if (P.dark) g.globalCompositeOperation = 'lighter';
      g.save();
      g.translate(cx, y0);
      g.scale(W * 0.30, Math.max(8, deep * 0.34));
      var hg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      hg.addColorStop(0.00, rgba(P.flare, 0.30 * P.k));
      hg.addColorStop(0.32, rgba(P.flare, 0.11 * P.k));
      hg.addColorStop(1.00, rgba(P.flare, 0));
      g.fillStyle = hg;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
      for (i = 0; i < steps; i++) {
        /* EXACTLY abutting, never overlapping: under `lighter` an overlap
           of two strips is a bright rung, and seventy of them is a ladder
           painted down the middle of the sea. */
        var f = i / steps, f2 = (i + 1) / steps;
        var tt = Math.pow(f, 0.85);
        var hw = pathHW(f), fade = pathFade(f);
        var a = 0.185 * P.k * fade * (0.42 + 0.58 * (1 - f));
        if (a <= 0.002) continue;
        var warm = mix(P.flare, P.gold, 0.25 + 0.55 * tt);
        var lg = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
        lg.addColorStop(0.00, rgba(warm, 0));
        lg.addColorStop(0.30, rgba(warm, a * 0.42));
        lg.addColorStop(0.50, rgba(warm, a));
        lg.addColorStop(0.70, rgba(warm, a * 0.42));
        lg.addColorStop(1.00, rgba(warm, 0));
        g.fillStyle = lg;
        g.fillRect(cx - hw, y0 + deep * f, hw * 2, deep * (f2 - f));
      }
      g.globalCompositeOperation = 'source-over';

      /* the headlands given back by the water: mirrored, squashed, and
         gone within a third of the way down. Without them the two sides
         of the bay stop dead at the waterline and the sea reads as a
         floor rather than as water. */
      var rc = mix(mix(P.deep, P.land, 0.58), P.sea, 0.14);   // darker, and a little of the colour taken out
      for (k = 0; k < ranges.length; k++) {
        var R = ranges[k], n = R.x.length, j;
        var nr = k / Math.max(1, ranges.length - 1);
        var sq = 0.38 + 0.06 * nr;                            // 38-44% of the height above it
        g.save();
        g.beginPath();
        for (j = 0; j < n; j++) {
          var ry = y0 + (hz - R.y[j]) * sq;
          /* the water is never flat: the reflection is displaced
             sideways a little more the deeper it goes, which is what
             stops it reading as a squashed copy pasted under the land */
          var rx = R.x[j] + Math.sin((ry - y0) * 0.42 + k * 2.1) * (0.6 + 3.0 * (ry - y0) / Math.max(1, deep * 0.30));
          if (j === 0) g.moveTo(rx, ry); else g.lineTo(rx, ry);
        }
        /* closed exactly ON the waterline, never above it: the rows above
           are the headroom the sea is allowed to show through during a
           camera move, and they have to stay the colour of the water */
        g.lineTo(R.x[n - 1], y0);
        g.lineTo(R.x[0], y0);
        g.closePath();
        var rgr = g.createLinearGradient(0, y0, 0, y0 + deep * 0.34);
        rgr.addColorStop(0.00, rgba(rc, 0.90));
        rgr.addColorStop(0.45, rgba(rc, 0.38));
        rgr.addColorStop(1.00, rgba(rc, 0));
        g.fillStyle = rgr;
        g.fill();
        /* and the swell lies across it: a few flat bands of the water's
           own colour, so it reads as a reflection ON water and not as a
           smear of dark under the headland */
        g.save();
        g.clip();
        var bands = 9, bh = (deep * 0.34) / bands;
        for (j = 0; j < bands; j++) {
          var by = y0 + bh * (j + 0.30 + 0.34 * Math.sin(j * 2.7 + k));
          g.globalAlpha = 0.14 + 0.10 * (0.5 + 0.5 * Math.sin(j * 1.9 + k * 3));
          g.fillStyle = rgb(seaAt(0));
          g.fillRect(0, by, W, Math.max(1 / dpr, bh * 0.20));
        }
        g.globalAlpha = 1;
        g.restore();
        g.restore();
      }
      g.globalAlpha = 1;
      /* THE HEADROOM IS THE WATERLINE ROW, COPIED UP. The sea is allowed
         to start a little above its own horizon so that nothing can ever
         open a gap between it and the sky while the camera is moving;
         for that margin to be invisible it has to be exactly the colour
         of the first row of water, taken AFTER every pass has run. */
      try {
        var yr = Math.round(y0 * dpr);
        if (yr > 0) {
          var rw = document.createElement('canvas');
          rw.width = p.cv.width; rw.height = 1;
          var rg = rw.getContext('2d');
          if (rg) {
            rg.drawImage(p.cv, 0, yr, p.cv.width, 1, 0, 0, p.cv.width, 1);
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, p.cv.width, yr);
            g.drawImage(rw, 0, 0, p.cv.width, 1, 0, 0, p.cv.width, yr);
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
        }
      } catch (e) {}
      seaCv = p.cv;
    }

    /* ---- the brush --------------------------------------------
       A stroke of water drawn as a rectangle has two hard ends and two
       hard edges, and forty of them read as a venetian blind rather
       than a sea. So the swell is painted with a brush: one small
       sprite whose alpha is a bell across and a bell down, tinted once
       per band and then only stretched. One drawImage, and no edge. */
    var brush = [], brushWarm = null, BRUSH_N = 6;
    function brushSprite(col) {
      var w = 96, h = 12;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      if (!g) return null;
      var im = g.createImageData(w, h), d = im.data, x, y;
      for (y = 0; y < h; y++) {
        var fy = Math.pow(Math.sin(Math.PI * (y + 0.5) / h), 1.7);
        for (x = 0; x < w; x++) {
          var fx = Math.pow(Math.sin(Math.PI * (x + 0.5) / w), 0.52);
          var i = (y * w + x) * 4;
          d[i] = col[0] | 0; d[i + 1] = col[1] | 0; d[i + 2] = col[2] | 0;
          d[i + 3] = Math.round(255 * fx * fy);
        }
      }
      g.putImageData(im, 0, 0);
      return c;
    }
    function makeBrushes() {
      brush = [];
      /* the swell is the sky on the water too: warm near the horizon,
         the sea's own indigo by the time it reaches us */
      var band = mix(mix(P.gold, P.orange, 0.45), P.sea, 0.42);
      var deepC = mix(P.sea, P.indigo, 0.55);
      for (var k = 0; k < BRUSH_N; k++) {
        brush.push(brushSprite(mix(band, deepC, k / (BRUSH_N - 1))));
      }
      brushWarm = brushSprite(mix(P.flare, P.disc, 0.30));
    }

    /* ---- the swell: the one thing that moves -------------------
       Rows of water, crowded towards the horizon. The near ones break
       into strokes, the far ones stay whole — the sky's bands lying on
       the sea. One slow wave travels through all of them; nothing here
       is noise per pixel and nothing is a shader. */
    var rows = [], NROW = phone ? 24 : 44;
    function makeRows() {
      rows = [];
      var r = rng(1553), deep = H - hz;
      for (var i = 0; i < NROW; i++) {
        var u = (i + 0.5) / NROW;
        var tt = Math.pow(u, 1.68);
        var whole = tt < 0.075;
        var d = [];
        var n = whole ? 1 : (2 + ((r() * 3) | 0));
        for (var j = 0; j < n; j++) {
          if (whole) { d.push([-W * 0.2, W * 1.4]); continue; }
          var w = W * (0.07 + r() * 0.42) * (0.55 + 1.15 * tt);
          d.push([-W * 0.18 + r() * (W * 1.26 - w), w]);
        }
        /* only about half the rows carry a glint, and each carries one or
           two: an even glint on every row is a ladder, not water */
        var glint = r() < 0.46;
        var gx = [], gw = [], gn = 1 + ((r() * 2) | 0);
        for (var q = 0; q < gn; q++) { gx.push(r()); gw.push(0.30 + r() * 0.56); }
        rows.push({
          y: hz + tt * deep, tt: tt,
          th: Math.max(0.9, deep * (0.0028 + 0.0320 * tt)),
          bobA: deep * (0.0028 + 0.0240 * tt),
          bobB: deep * (0.0010 + 0.0068 * tt),
          d: d, ph: r() * 6.2832,
          glint: glint, gx: gx, gw: gw,
          bi: Math.min(BRUSH_N - 1, Math.round(sstep(0, 0.40, tt) * (BRUSH_N - 1)))
        });
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
      metKill(); metMaskOK = null;
      var r = host.getBoundingClientRect();
      W = Math.max(280, Math.round(r.width || window.innerWidth));
      H = Math.max(360, Math.round(r.height || window.innerHeight));
      dpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px';
      cvs.style.height = H + 'px';
      /* the sea's horizon sits low: everything above it is the sky the
         name is set across, and the fire is the 0.16 H directly under
         the name's feet. index.html positions the type to match. */
      /* THE WATERLINE IS A DEVICE ROW. Rounded to a whole CSS pixel it
         lands on HALF a device pixel at 125% Windows scaling (dpr 1.25),
         and then the sky's last row and the sea's first row are each
         drawn 50% over the same physical row: a thin dark line, all the
         way across, at that zoom and no other. Snapped to the device
         grid instead, every layer's horizon is the same whole row at
         any DPR. */
      hz = snapPx(H * (phone ? 0.700 : 0.780));
      sunX = Math.round(W * (phone ? 0.545 : 0.565));
      sunR = Math.round(H * (phone ? 0.048 : 0.056));
      keepTop = snapPx(H * 0.52);
      if (!travel) travel = Math.round(H * 1.25);
      if (kctx) {
        keep.width = cvs.width;
        keep.height = Math.max(2, Math.round((H - keepTop) * dpr));
      }
      palette(); makeStars(); makeClouds(); makeRanges();
      makeBrushes(); makeRows(); makeSeaPlate(); makeGrain();
      bakeClouds();
      bayChanged();
    }
    /* the ascent reads its land and its sea from this bay: tell it when
       they have been made again (a resize, a theme) */
    function bayChanged() {
      try { document.dispatchEvent(new Event('inkbay')); } catch (e) {}
    }

    /* ---- the camera -------------------------------------------- */
    var open = 0;            // 0 → 1 over the opening
    var p = 0, pTarget = 0;  // scroll progress, eased towards the target
    var OPEN_MS = 5200;

    /* THE PULL-BACK TURNS ABOUT THE WATERLINE. The hero scrolls with the
       page now, so every pixel the scene slides down is a pixel the fire
       at the horizon travels DOWN the standfirst that is set on the water
       beneath it — at scrollY 300 the band stood directly behind the
       sentence and cream on it measured 2.5:1. The opening's own lift
       (the `o` term) is untouched, because that motion happens before the
       page has scrolled; the SCROLL's lift is taken about the sea's
       horizon instead, so the waterline keeps one page position from 0
       until the hero leaves and the type never meets the light. Nothing
       about the move itself is lost: the lift is still depth-weighted, so
       the sky, the clouds and the headlands part from the water exactly
       as far as they always did, and the zoom still opens the whole
       picture out. Only the common part — the part that moved the
       horizon and nothing else — is gone. */
    function camAt(depth) {
      var o = 1 - open;                                  // 1 at the start
      var zoom = (1 + o * 1.18) * (1 - p * 0.13);
      var pan = (o * 0.030 - p * 0.02) * W;
      var s = 1 + (zoom - 1) * (0.22 + 0.78 * depth);
      var w = 0.16 + 0.84 * depth;                       // this layer's share of a lift
      var y = (-o * 0.04 * H) * w                        // the opening, as it was
            + (p * 0.40 * H) * (w - (0.16 + 0.84 * D_SEA));
      return { s: s, y: y, x: pan * (0.12 + 0.88 * depth) };
    }
    function apply(depth) {
      var c = camAt(depth);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(W * 0.5 + c.x, hz + c.y);
      ctx.scale(c.s, c.s);
      ctx.translate(-W * 0.5, -hz);
    }
    /* the same, but the horizon of another layer: a layer that MEETS the
       water has to sit on the water's line, not on its own */
    function applyPinned(depth, pin) {
      var c = camAt(depth);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(W * 0.5 + c.x, hz + camAt(pin).y);
      ctx.scale(c.s, c.s);
      ctx.translate(-W * 0.5, -hz);
    }

    /* ---- painting: the sky ------------------------------------ */

    var D_SKY = 0.05, D_CLOUD = 0.12, D_LAND = 0.34, D_SEA = 0.44;

    function paintSky() {
      /* painted straight onto the canvas in screen space, with the
         camera's own scale folded into the gradient, so a camera move
         can never uncover an edge of it */
      var c = camAt(D_SKY);
      var y0 = hz + (0 - hz) * c.s + c.y;               // where the top of the sky lands
      var y1 = hz + c.y;                                // the horizon
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgb(P.zenith);
      ctx.fillRect(0, 0, W, H);
      var g = ctx.createLinearGradient(0, y0, 0, y1);
      var r = P.ramp, i;
      for (i = r.length - 1; i >= 0; i--) g.addColorStop(clamp(1 - r[i][0], 0, 1), rgb(r[i][1]));
      ctx.fillStyle = g;
      /* the sky's own band runs PAST its horizon, by however far the sea's
         horizon has drifted below it on this frame (they are at different
         depths, so a camera move pulls them apart): whatever shows above
         the water is then the colour of the sky at the waterline, never
         the ground behind everything */
      var past = Math.max(8, Math.abs(camAt(D_SEA).y - c.y) + 4);
      ctx.fillRect(0, -Math.abs(H), W, Math.max(0, y1) + Math.abs(H) + past);
      return { y0: y0, y1: y1, s: c.s };
    }

    function paintStars(alpha) {
      if (alpha <= 0.01 || !stars.length) return;
      apply(D_SKY);
      var i;
      ctx.fillStyle = rgb(P.star);
      for (i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.globalAlpha = s.a * alpha;
        ctx.fillRect(s.x - s.r * 0.5, s.y - s.r * 0.5, s.r, s.r);
      }
      if (venus) {
        ctx.globalAlpha = 1;
        var vg = ctx.createRadialGradient(venus.x, venus.y, 0, venus.x, venus.y, venus.r * 5);
        vg.addColorStop(0, rgba(P.star, 0.92 * alpha * (P.dark ? 1 : 0.4)));
        vg.addColorStop(0.28, rgba(P.star, 0.22 * alpha * (P.dark ? 1 : 0.4)));
        vg.addColorStop(1, rgba(P.star, 0));
        ctx.fillStyle = vg;
        ctx.beginPath(); ctx.arc(venus.x, venus.y, venus.r * 5, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* the sun: a small disc, half of it already under the water, and the
       air around it carrying the light. No rays, no star filter, no ring
       — the only reason it reads as a sun is that it is small and the
       sky around it is not. */
    function paintSun(alpha) {
      if (alpha <= 0.01) return;
      apply(D_SKY);
      var lift = P.dark ? 'lighter' : 'source-over';
      ctx.globalCompositeOperation = lift;

      /* the light spread ALONG the horizon: wide and very low */
      ctx.save();
      ctx.translate(sunX, hz);
      ctx.scale(W * 0.62, H * 0.062);
      var eg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      eg.addColorStop(0, rgba(P.flare, 0.26 * alpha * P.k));
      eg.addColorStop(0.36, rgba(P.flare, 0.10 * alpha * P.k));
      eg.addColorStop(1, rgba(P.flare, 0));
      ctx.fillStyle = eg;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();

      /* The aureole: the air around the disc, not a ring on it. One
         gradient with a straight falloff draws its own outline — a
         circle of light with an edge, which is the one thing here that
         read as graphic rather than painted. So it is two lobes, both
         flattened (haze near a horizon spreads sideways, never in a
         circle) and both stepped down fast and then long, so there is
         no radius anywhere at which the light stops. The disc is
         painted after it and stays an object. */
      var lobe = [
        { r: sunR * 3.6, sy: 0.82, a: [0.125, 0.082, 0.040, 0.014] },
        { r: sunR * 9.6, sy: 0.60, a: [0.052, 0.030, 0.012, 0.004] }
      ];
      for (var li = 0; li < lobe.length; li++) {
        var L = lobe[li];
        ctx.save();
        ctx.translate(sunX, hz); ctx.scale(1, L.sy); ctx.translate(-sunX, -hz);
        var ag = ctx.createRadialGradient(sunX, hz, 0, sunX, hz, L.r);
        ag.addColorStop(0.00, rgba(li ? P.flare : P.disc, L.a[0] * alpha * P.k));
        ag.addColorStop(0.20, rgba(P.flare, L.a[1] * alpha * P.k));
        ag.addColorStop(0.44, rgba(P.flare, L.a[2] * alpha * P.k));
        ag.addColorStop(0.70, rgba(P.flare, L.a[3] * alpha * P.k));
        ag.addColorStop(1.00, rgba(P.flare, 0));
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(sunX, hz, L.r, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';

      /* the disc itself, cut off by the water */
      ctx.save();
      ctx.beginPath();
      /* cut on the WATER's line, not on the sky's: they are at different
         depths and a camera move puts them a few pixels apart, which
         would cut the disc short of the water it is setting into */
      var cd = camAt(D_SKY), cw = camAt(D_SEA);
      var cut = hz + (hz + cw.y - hz - cd.y) / (cd.s || 1);
      ctx.rect(-W, cut - H * 2, W * 3, H * 2);
      ctx.clip();
      if (blurOK) ctx.filter = 'blur(' + (sunR * 0.035 + 0.4).toFixed(2) + 'px)';
      var dg = ctx.createRadialGradient(sunX, hz - sunR * 0.2, 0, sunX, hz, sunR);
      dg.addColorStop(0, rgba(mix(P.disc, [255, 255, 255], 0.5), alpha));
      dg.addColorStop(0.55, rgba(P.disc, alpha));
      dg.addColorStop(0.86, rgba(mix(P.disc, P.gold, 0.45), 0.99 * alpha));
      dg.addColorStop(1, rgba(mix(P.gold, P.orange, 0.35), 0.94 * alpha));
      ctx.fillStyle = dg;
      ctx.save();
      ctx.translate(sunX, hz); ctx.scale(1, 0.92); ctx.translate(-sunX, -hz);
      ctx.beginPath(); ctx.arc(sunX, hz, sunR, 0, 6.2832); ctx.fill();
      ctx.restore();
      if (blurOK) ctx.filter = 'none';
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* one band of cloud: a long soft form with the light underneath it */
    /* The bands are BAKED, once per resize and once per theme change, into
       their own transparent layer. They are the most expensive thing in the
       picture — eleven blurred paths, twice each — and they never change
       shape: only the camera moves them. Painting them live cost 60-300 ms
       a frame on a software rasteriser, which is the whole opening stuttering
       for a layer that is identical in every one of those frames. */
    var cloudCv = document.createElement('canvas'), cctx = null;
    try { cctx = cloudCv.getContext('2d'); } catch (e4) { cctx = null; }
    var cloudsBaked = false;

    function bakeClouds() {
      cloudsBaked = false;
      if (!cctx) return;
      cloudCv.width = cvs.width; cloudCv.height = cvs.height;
      var was = ctx;
      ctx = cctx;                                   // the painter writes to the layer
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      try { drawClouds(1); cloudsBaked = true; } catch (e) { cloudsBaked = false; }
      ctx = was;
    }

    function paintClouds(alpha) {
      if (alpha <= 0.01) return;
      apply(D_CLOUD);
      if (cloudsBaked) {
        /* the baked layer is the canvas's own size in DEVICE pixels; at
           rest it goes back one for one, so the bands keep the edge they
           were painted with instead of being resampled by the fraction
           of a pixel that W*dpr is off a whole number */
        var cc = camAt(D_CLOUD);
        if (cc.s === 1 && cc.x === 0 && cc.y === 0) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = clamp(alpha, 0, 1);
          ctx.drawImage(cloudCv, 0, 0);
        } else {
          ctx.globalAlpha = clamp(alpha, 0, 1);
          ctx.drawImage(cloudCv, 0, 0, W, H);
        }
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return;
      }
      drawClouds(alpha);                            // no layer: paint them live
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawClouds(alpha) {
      var steps = phone ? 54 : 80;
      for (var k = 0; k < clouds.length; k++) {
        var C = clouds[k];
        var cy = hz - C.t * hz;
        var top = cy - C.th * 1.6, bot = cy + C.th * 1.5;
        /* the colour of the air the band is lying in, and the light it
           takes from underneath: the lower the band, the hotter its belly */
        var above = skyAt(C.t + 0.05);
        var ink = mix(P.cloud, above, 0.30);
        var litT = clamp(1 - C.t / 0.34, 0, 1);
        var lit = mix(mix(P.coral, P.magenta, 0.35), P.flare, Math.pow(litT, 1.25));
        var a = C.a * alpha * (P.dark ? 1 : 0.5);
        top -= C.wob; bot += C.wob;

        if (blurOK) ctx.filter = 'blur(' + (1.1 + C.th * 0.10).toFixed(2) + 'px)';
        var g = ctx.createLinearGradient(0, top, 0, bot);
        g.addColorStop(0, rgba(ink, 0.30 * a));
        g.addColorStop(0.42, rgba(ink, 0.80 * a));
        g.addColorStop(0.78, rgba(mix(ink, lit, 0.30), 0.62 * a));
        g.addColorStop(1, rgba(mix(ink, lit, 0.55), 0.34 * a));
        ctx.fillStyle = g;

        /* sample the band once; the two edges are read back off the same
           arrays, so the top and the bottom can never disagree */
        var i, x, u, n, br, th;
        var mid = [], up = [], dn = [];
        for (i = 0; i <= steps; i++) {
          u = i / steps;
          x = -W * 0.22 + u * W * 1.44;
          n = fbm(x * C.fLong * 3.1 + C.x0, C.tbl, 3);
          /* where the band simply is not: a long slow noise cut at a
             threshold, so it thins away to nothing and starts again
             further along instead of ruling a line across the sky */
          br = sstep(0.36, 0.60, fbm(x * C.fBrk + C.x0 * 0.7, C.brk, 2));
          th = C.th * br * (0.26 + 1.30 * n);
          mid.push(cy + C.tilt * (x - W * 0.5)
                      + C.wob * (fbm(x * C.fLong * 1.15 + 31.7, C.brk, 2) - 0.5) * 2);
          up.push(th); dn.push(th * 0.52);
        }
        ctx.beginPath();
        for (i = 0; i <= steps; i++) {
          ctx.lineTo(-W * 0.22 + (i / steps) * W * 1.44, mid[i] - up[i]);
        }
        for (i = steps; i >= 0; i--) {
          ctx.lineTo(-W * 0.22 + (i / steps) * W * 1.44, mid[i] + dn[i]);
        }
        ctx.closePath();
        ctx.fill();

        /* THE UNDERSIDE. The sun is below these bands, so the light is on
           their bellies and nowhere else. It follows the band's own lower
           edge — a gradient across the whole band would smear it wherever
           the centreline wanders — and it is a soft ribbon, never a rim:
           blurred wider than it is thick, and gone where the band is. */
        if (litT > 0.02) {
          var rb = Math.max(1.0, C.th * 0.55);
          if (blurOK) ctx.filter = 'blur(' + (rb * 0.9 + 0.8).toFixed(2) + 'px)';
          ctx.fillStyle = rgba(lit, (0.30 + 0.52 * litT) * a * (P.dark ? 1 : 0.7));
          ctx.beginPath();
          for (i = 0; i <= steps; i++) {
            x = -W * 0.22 + (i / steps) * W * 1.44;
            ctx.lineTo(x, mid[i] + dn[i] - (up[i] > 0.3 ? rb : 0));
          }
          for (i = steps; i >= 0; i--) {
            x = -W * 0.22 + (i / steps) * W * 1.44;
            ctx.lineTo(x, mid[i] + dn[i] + (up[i] > 0.3 ? rb * 0.42 : 0));
          }
          ctx.closePath();
          ctx.fill();
        }
        if (blurOK) ctx.filter = 'none';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rangePath(R, flipAt) {
      var n = R.x.length, i;
      ctx.beginPath();
      if (flipAt != null) {
        ctx.moveTo(R.x[0], 2 * flipAt - R.y[0]);
        for (i = 1; i < n; i++) ctx.lineTo(R.x[i], 2 * flipAt - R.y[i]);
        ctx.lineTo(R.x[n - 1], flipAt + H * 2);
        ctx.lineTo(R.x[0], flipAt + H * 2);
      } else {
        ctx.moveTo(R.x[0], R.y[0]);
        for (i = 1; i < n; i++) ctx.lineTo(R.x[i], R.y[i]);
        /* the land runs on under the water: the sea is painted after it,
           so the two can never leave a seam of sky between them */
        ctx.lineTo(R.x[n - 1], hz + H);
        ctx.lineTo(R.x[0], hz + H);
      }
      ctx.closePath();
    }

    function paintRanges(alpha) {
      if (alpha <= 0.01) return;
      /* THE LAND IS PINNED TO THE WATERLINE. It keeps its own depth for
         the pan and the zoom, but its vertical offset is the SEA's, so
         the foot of every range and the top of the water are the same
         line on every frame; at its own depth they drift apart while the
         camera moves and the near-black foot shows above the water. */
      applyPinned(D_LAND, D_SEA);
      for (var k = 0; k < ranges.length; k++) {
        var R = ranges[k];
        /* nearly black, and the further one only a little less so: at this
           hour land has no colour of its own left, it is a hole in the light */
        var crest = mix(P.land, mix(P.coral, P.magenta, 0.5), R.tone * 0.30);
        var foot = mix(P.land, P.flare, R.tone * 0.16);
        var g = ctx.createLinearGradient(0, hz - R.amp, 0, hz + 2);
        g.addColorStop(0, rgb(P.dark ? crest : mix(crest, P.flare, 0.42)));
        g.addColorStop(1, rgb(P.dark ? foot : mix(foot, P.flare, 0.50)));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        rangePath(R, null);
        ctx.fill();
      }
      /* the haze the light leaves along the waterline: the ranges have to
         dissolve into it, not sit on it like cut paper. It belongs to the
         LAND — pulled out of the middle of the bay, where washing the air
         would cost the sun its edge and turn the open water to mud. */
      ctx.globalAlpha = 1;
      if (P.dark) ctx.globalCompositeOperation = 'lighter';
      var side = [[W * 0.06, W * 0.30], [W * 0.97, W * 0.26]];
      for (var s = 0; s < 2; s++) {
        ctx.save();
        ctx.translate(side[s][0], hz - H * 0.010);
        ctx.scale(side[s][1], H * 0.042);
        var hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        hg.addColorStop(0, rgba(P.flare, 0.26 * alpha * P.k));
        hg.addColorStop(0.42, rgba(P.flare, 0.10 * alpha * P.k));
        hg.addColorStop(1, rgba(P.flare, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* How wide the sun's path is at depth `f` (0 at the waterline, 1 at
       the bottom of the frame), and how much light is left in it. It is
       WIDE where it leaves the sun and it only opens a little on the way
       down: a narrow throat that widens towards the viewer is a runway.
       And it dies before it reaches us — on a laptop the lede sits at the
       left gutter and the path runs down the middle, so they never meet,
       but a phone's lede is the full width of the window, so there the
       light is out of the water by the upper third. */
    function pathHW(f) {
      return W * (0.088 + 0.100 * Math.pow(f, 0.85));
    }
    function pathFade(f) {
      return 1 - sstep(phone ? 0.04 : 0.24, phone ? 0.44 : 0.80, f);
    }

    /* the still water: one blit of the plate, on one depth, so the
       waterline is one line across the whole frame */
    function paintWater(alpha) {
      if (alpha <= 0.01 || !seaCv) return;
      var c = camAt(D_SEA);
      var wy = hz + c.y, ws = c.s;
      if (wy > H + 4) return;
      /* ONE WATERLINE FOR THE WHOLE FRAME. The sea starts on its own
         horizon and never a row above it: its headroom exists so that a
         resample cannot pull a stale row down, and it must never be the
         top-most paint on any row — shown above the waterline on a
         moving frame it is a pale band with stepped edges where the sun
         path is. Nothing opens a gap under it either, because the LAND
         is pinned to this same line (paintRanges) and the sky's band is
         painted past it (paintSky), both on every frame. */
      var top = Math.max(0, wy);
      /* AT REST the sea is one pixel-for-pixel blit in device space. Going
         through the CSS transform rescales it by the fraction of a pixel
         that W*dpr is off a whole number, which is what softened every
         reflection in it — and it put the waterline between two device
         rows. Whole rows, no resample. */
      if (ws === 1 && c.y === 0 && alpha > 0.995 && seaCv.width === cvs.width) {
        var wl = Math.round(top * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, wl, cvs.width, cvs.height - wl + 2); ctx.clip();
        ctx.drawImage(seaCv, 0, Math.round((hz - SEA_PAD) * dpr));
        ctx.restore();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return wy;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      /* the clip edge on a whole device row: half a row of coverage is
         half a row of whatever is underneath, which is a thin dark line */
      ctx.beginPath(); ctx.rect(-1, snapPx(top), W + 2, H - top + 2); ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.drawImage(seaCv, 0, wy - SEA_PAD * ws, W, ((H - hz) + SEA_PAD * 2) * ws);
      ctx.globalAlpha = 1;
      ctx.restore();
      return wy;
    }

    /* ---- the swell -------------------------------------------- */
    function paintSwell(time, alpha) {
      if (alpha <= 0.01 || !rows.length) return;
      var c = camAt(D_SEA);
      var wy = hz + c.y, ws = c.s;
      if (wy > H + 4) return;
      var top = Math.max(0, wy), i, j, k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      /* the same whole-device-row clip as the water it rides on */
      ctx.beginPath(); ctx.rect(-1, snapPx(top), W + 2, H - top + 2); ctx.clip();

      /* pass one: the water itself — long soft strokes, nearly still */
      for (i = 0; i < rows.length; i++) {
        var R = rows[i];
        var phase = time * 0.165 * 6.2832 - R.tt * 4.3 + R.ph * 0.16;
        var s1 = Math.sin(phase);
        var s2 = Math.sin(phase * 1.73 + 1.1);
        var y = wy + (R.y - hz) * ws + (R.bobA * s1 * 0.5 + R.bobB * s2 * 0.35) * ws;
        if (y < top - 2 || y > H + 3) continue;
        var a = alpha * (P.dark ? 0.32 : 0.20) * (0.40 + 0.60 * (0.5 + 0.5 * s1))
                      * (0.55 + 0.55 * (1 - R.tt));
        if (a < 0.012) continue;
        var img = brush[R.bi];
        if (!img) continue;
        ctx.globalAlpha = Math.min(0.70, a);
        var th = Math.max(1.4, R.th * ws * 2.6);
        for (j = 0; j < R.d.length; j++) {
          var dx = (R.bobA * 1.9) * Math.sin(phase * 0.7 + j * 1.9);
          ctx.drawImage(img, R.d[j][0] + dx, y - th * 0.5, R.d[j][1], th);
        }
      }

      /* Pass two: the glitter in the sun's path. Added, never laid over —
         it is light on water. One or two short glints per row at their own
         offsets, so it reads as broken light and never as the rungs of a
         ladder down the middle of the picture. */
      if (P.dark) ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < rows.length; i++) {
        var Q = rows[i];
        if (!Q.glint || !brushWarm) continue;
        var fade = pathFade(Q.tt);
        if (fade <= 0.02) continue;
        var ph2 = time * 0.165 * 6.2832 - Q.tt * 4.3 + Q.ph * 0.16;
        var g1 = Math.sin(ph2);
        var yy = wy + (Q.y - hz) * ws + (Q.bobA * g1 * 0.5) * ws;
        if (yy < top - 2 || yy > H + 3) continue;
        var hw = pathHW(Q.tt);
        for (k = 0; k < Q.gx.length; k++) {
          var g2 = Math.sin(ph2 * 1.9 + Q.gx[k] * 7.3);
          var ga = alpha * (P.dark ? 0.145 : 0.09) * P.k * fade
                         * (0.5 + 0.5 * g2) * (1 - 0.45 * Q.tt);
          if (ga < 0.010) continue;
          var seg = Math.max(3, hw * Q.gw[k] * (0.55 + 0.45 * (0.5 + 0.5 * g2)));
          var off = (hw - seg) * (Q.gx[k] * 2 - 1) * (0.6 + 0.4 * Math.sin(ph2 * 0.41 + Q.ph));
          var gh = Math.max(1.6, Q.th * 2.2 * ws);
          ctx.globalAlpha = Math.min(0.40, ga);
          ctx.drawImage(brushWarm, sunX + off - seg * 0.5, yy - gh * 0.5, seg, gh);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

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
        ctx.globalAlpha = P.dark ? 0.038 : 0.024;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      /* the corners fall away, so the picture has a middle */
      var v = ctx.createRadialGradient(sunX, hz - H * 0.10, Math.min(W, H) * 0.26,
                                       sunX, hz - H * 0.10, Math.max(W, H) * 0.86);
      v.addColorStop(0, rgba(P.zenith, 0));
      v.addColorStop(1, rgba(P.zenith, P.dark ? 0.52 : 0.18));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    /* ---- the meteors -------------------------------------------
       Owen asked for shooting stars, and for some of them to come into
       the air and burn up. They are the one thing in this sky that
       ARRIVES: a thin streak every 12-24 s (rare is what makes one worth
       looking up for), over in about a second, and
       about one in five a slower one that enters lower, brightens,
       flares and breaks into two or three sparks that drift and go out.

       Three rules hold the whole thing together.
       - They live only in the dark upper sky: between the nav's last
         pixel and the top edge of the name's box, both read off the DOM
         at every spawn, with a margin. No glyph ever has one behind it,
         the fire band is never crossed, and nothing about the type's
         contrast can move.
       - They cost nothing when none is in the air. A meteor captures the
         small rectangle of sky it will cross into a plate the moment it
         is born; every frame after that is one blit of that rectangle
         and a few paths inside it. They also never ask for a frame: they
         ride the swell's own ~33 fps frames and stop with them the
         instant the hero leaves the screen.
       - Nothing under reduced motion, and nothing once the page has
         started to move (p > 0.10), where the camera would drag them.
     */
    var MET = null;                      // the one meteor in the air, or null
    var mpl = null, mplc = null, mplBad = true;   // the plate of sky under it
    var mrx = 0, mry = 0, mrw = 0, mrh = 0;
    var metAt = -1;                      // clock time of the next one
    var metPaints = 0;                   // how many times one has been painted
    var mclock = 0;                      // the meteors' own clock (timeScale)

    /* Every number a meteor is made of, in one plain object of numbers so
       it can be dialled live (window.__world.tune) and the values that
       read right can be written back in here. Sizes are FRACTIONS of the
       window's shorter side, never pixels, so the same object reads the
       same on a phone and on a 4K monitor. */
    var TUNE_DEF = {
      timeScale: 1,        // the meteor clock only; 1 = real time
      rate: 1,             // how often one comes (higher = more often)
      speed: 1,            // path per second (life is divided by it)
      lifeStreak: 1.05,    // seconds, before the spread
      lifeBurn: 2.00,      // seconds, the burn-up event itself
      trainHold: 2.20,     // seconds the burn-up's train lingers after
      length: 1,           // path length
      width: 1,            // line thickness
      tail: 1,             // the bright tail behind the head
      halo: 1,             // the streak's small halo
      flare: 1,            // the burn-up's terminal widening
      sparks: 1,           // the fragments that carry on after it
      train: 1             // the train's weight
    };
    var TUNE = {};
    (function () { for (var kk in TUNE_DEF) if (Object.prototype.hasOwnProperty.call(TUNE_DEF, kk)) TUNE[kk] = TUNE_DEF[kk]; })();
    function tn(k) {
      var v = TUNE[k];
      return (typeof v === 'number' && isFinite(v)) ? v : TUNE_DEF[k];
    }
    /* the window's own unit: the shorter side, with a floor so a phone
       streak is still a line you can see and not a hair */
    function metS() { return Math.max(320, Math.min(W, H)); }
    var metNone = true;                  // nothing has come over yet this session
    var mrnd = rng(((((Date.now() & 0xffffff) ^ 0x5F3A1B) >>> 0) || 7));

    /* Where the name's INK starts, which is not where its box starts.
       The line box is 0.84em on an em of more than 1.2, so the glyphs sit
       well inside it, and on a wide short window that difference is the
       entire difference between having a strip of sky and having none:
       at 1920x1080 the box begins at y=107 with the nav ending at 56,
       and the first cream pixel is at 155. The canvas can be asked, and
       its answer is the conservative one — it read 128 there, 27 px above
       the real ink — and we take at most 0.055em below the box whatever
       it says, so a font that fails to load in the canvas still cannot
       open the strip onto a glyph. */
    var metCtx = null;
    function nameTop() {
      var el = document.getElementById('hero-name');
      if (!el) return H * 0.20;
      var bb = el.getBoundingClientRect(), r = host.getBoundingClientRect();
      if (!(bb.height > 0)) return H * 0.20;
      var top = bb.top - r.top;
      try {
        var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 0;
        if (!metCtx) metCtx = document.createElement('canvas').getContext('2d');
        metCtx.font = cs.font || (cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
        var t = metCtx.measureText((el.textContent || '').trim() || 'Owen Silva');
        var ch = t.fontBoundingBoxAscent + t.fontBoundingBoxDescent;
        if (ch > 0 && t.actualBoundingBoxAscent > 0 && fs > 0) {
          var ink = top + (bb.height - ch) / 2 + t.fontBoundingBoxAscent - t.actualBoundingBoxAscent;
          if (ink > top) return Math.min(ink, top + fs * 0.055);
        }
      } catch (e) {}
      return top;
    }

    /* The bottom of the QUIET sky: the top edge of the highest cloud band,
       read off the same objects the sky is painted from, with the ramp's
       own turn towards colour as a floor in case there are no bands. Below
       this line is the fire, the clouds and the sun, and no meteor goes
       there at any size. */
    function quietBottom() {
      var y = hz * 0.55, i, t;
      for (i = 0; i < clouds.length; i++) {
        t = hz - clouds[i].t * hz - clouds[i].th * 1.6 - clouds[i].wob;
        if (t < y) y = t;
      }
      return y;
    }

    /* Can we build a mask of the name's glyphs? The type is opaque and the
       canvas is under it, so a meteor that crosses the name must simply
       not be painted where a letter already covers the pixel: the picture
       is identical either way — the streak goes into a letter and comes
       out the other side — and the ink the name's contrast is measured
       over cannot move at all. The mask is canvas text, so it is only
       trusted when the canvas lays the line out at the same width the
       element actually has. */
    var metMaskOK = null;
    function metFont(el, cs) {
      if (!metCtx) metCtx = document.createElement('canvas').getContext('2d');
      metCtx.font = cs.font || (cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
      try { metCtx.letterSpacing = cs.letterSpacing; } catch (e) {}
      return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }
    function checkMask() {
      try {
        var el = document.getElementById('hero-name');
        if (!el) return false;
        var bb = el.getBoundingClientRect();
        if (!(bb.width > 0 && bb.height > 0)) return false;
        var cs = getComputedStyle(el), txt = metFont(el, cs);
        if (!txt || !('letterSpacing' in metCtx)) return false;
        var w = metCtx.measureText(txt).width;
        return w > 0 && Math.abs(w - bb.width) <= bb.width * 0.12;
      } catch (e) { return false; }
    }

    /* The sky a meteor is allowed into: from under the nav down to the top
       of the cloud bands. It may cross the name — that is the whole point,
       a streak that goes behind a letter reads as depth — but never the
       fire, the clouds, the sun, the lede or the readout. */
    var MET_MIN = 26;
    function metBand() {
      var top = H * 0.03, r = host.getBoundingClientRect(), b, el;
      try {
        el = document.querySelector('.nav');
        if (el) { b = el.getBoundingClientRect(); if (b.height > 0) top = Math.max(top, b.bottom - r.top + Math.max(8, H * 0.010)); }
      } catch (e) {}
      if (metMaskOK === null) metMaskOK = checkMask();
      /* with a mask the whole quiet sky is ours; without one we cannot
         promise the glyphs are untouched, so we stay above them */
      var bot = metMaskOK ? quietBottom() : nameTop();
      bot -= Math.max(12, H * 0.016);
      try {
        var other = [document.getElementById('hero-sub'), document.getElementById('scene-state')];
        for (var i = 0; i < other.length; i++) {
          if (!other[i]) continue;
          b = other[i].getBoundingClientRect();
          if (b.height > 0) bot = Math.min(bot, b.top - r.top - 12);
        }
      } catch (e2) {}
      return { a: top, b: Math.min(bot, hz - 4) };
    }

    function skyPt(x, y) {               // the sky layer's coords → screen
      var c = camAt(D_SKY);
      return [(x - W * 0.5) * c.s + W * 0.5 + c.x, (y - hz) * c.s + hz + c.y];
    }

    function makeMeteor(kind) {
      var rn = mrnd, burn = kind === 'burn', band = metBand();
      var h = band.b - band.a, S = metS(), spd = Math.max(0.05, tn('speed'));
      if (!(h > MET_MIN) || !(W > 0)) return null;
      var dir = rn() < 0.5 ? -1 : 1;
      var y0 = band.a + h * (burn ? 0.30 + rn() * 0.26 : 0.04 + rn() * 0.30);
      /* room kept under the end point for the fragments that carry on */
      var spark = burn ? Math.min(S * 0.030 * Math.max(0, tn('sparks')), h * 0.16) : 0;
      var room = band.b - y0 - Math.min(10, h * 0.10) - spark;
      if (room < 6) return null;
      /* a somewhat longer path AND a longer life: the streak reads slower
         than it used to, about two thirds of the speed, without turning
         into something drifting */
      var want = S * (burn ? 0.26 + rn() * 0.08 : 0.62 + rn() * 0.22) * Math.max(0.1, tn('length'));
      /* The strip decides the angle, not the other way round. A meteor
         wants 9-19 degrees, but it only gets them if the sky is deep
         enough to hold a streak of a decent length at that pitch; on a
         thin strip it flattens out instead of being thrown away, which
         is what used to happen on every wide short window. */
      var minRun = Math.min(want, S * (burn ? 0.08 : 0.12));
      var maxAng = Math.asin(clamp(room / Math.max(minRun, 1), 0.02, 1));
      var ang = Math.min((burn ? 16 + rn() * 12 : 9 + rn() * 10) * Math.PI / 180, maxAng);
      var run = Math.min(want, room / Math.sin(ang));
      if (run < Math.max(24, S * 0.045)) return null;
      var dx = Math.cos(ang) * run * dir, dy = Math.sin(ang) * run;
      var span = Math.abs(dx);
      var left = span > W ? -(span - W) * rn() : rn() * (W - span);
      var m = {
        kind: burn ? 'burn' : 'streak',
        x0: dir > 0 ? left : left + span, y0: y0,
        dx: dx, dy: dy, dir: dir, ang: ang, run: run,
        tail: Math.min(run * 0.46, S * 0.17),
        /* the head runs the whole event and eases to a stop at hE, so
           there is no jump where it ends; the streak is constant speed */
        hE: burn ? 0.88 : 1, hExp: burn ? 1.30 : 1,
        life: (burn ? tn('lifeBurn') * (0.78 + rn() * 0.45)
                    : tn('lifeStreak') * (0.80 + rn() * 0.55)) / spd,
        train: burn ? Math.max(0, tn('trainHold')) : 0,
        w: Math.max(1, S * 0.0016) * (burn ? 1.05 : 1),
        reach: spark,
        born: 0, hold: null, sp: null, twk: null, tn: null, th: null,
        px: 0, py: 0, pt: -1
      };
      m.life = clamp(m.life, 0.12, 12);
      m.total = m.life + m.train;
      if (burn) {
        /* what is left of it carries ON, nearly along the same line: two
           or three fragments that decelerate and are gone inside a third
           of a second. Nothing flies sideways, nothing bursts. */
        var fy = y0 + dy, n = rn() < 0.5 ? 2 : 3, i, s = [];
        for (i = 0; i < n; i++) {
          var ao = (rn() - 0.5) * 0.15;                    // under five degrees
          var d = spark * (0.45 + rn() * 0.55);
          var ey = Math.sin(ang + ao) * d;
          if (fy + ey > band.b - 2) d = Math.max(0, (band.b - 2 - fy) / Math.max(0.05, Math.sin(ang + ao)));
          s.push({ ao: ao, d: d, r: 0.42 + rn() * 0.30,
                   t0: 0.84 + rn() * 0.05, len: 0.13 + rn() * 0.05 });
        }
        m.sp = s;
        /* the train's unevenness: it does not fade as one thing, it goes
           in patches, so each length of it has its own weight and its own
           hold. Fixed at birth so it never shimmers frame to frame. */
        var tnA = [], thA = [], j, q1 = rn(), q2 = rn();
        for (j = 0; j < 26; j++) {
          /* smoothed, so it goes in PATCHES — a length of it holding on
             while the length next to it has already gone — instead of
             every other segment dropping out, which reads as a dashed line */
          q1 = q1 * 0.62 + rn() * 0.38;
          q2 = q2 * 0.55 + rn() * 0.45;
          tnA.push(0.20 + q1 * 1.10);
          thA.push(0.50 + q2 * 0.90);
        }
        m.tn = tnA; m.th = thA;
      }
      /* a star it goes past may blink once. Nothing else in the sky reacts. */
      var tw = [], j;
      for (j = 0; j < stars.length && tw.length < 3; j++) {
        var q = skyPt(stars[j].x, stars[j].y);
        var t = ((q[0] - m.x0) * dx + (q[1] - y0) * dy) / (run * run);
        if (t < 0.04 || t > 0.98) continue;
        var px = m.x0 + dx * t - q[0], py = y0 + dy * t - q[1];
        if (px * px + py * py < 64) tw.push({ i: j, u: t });
      }
      m.twk = tw.length ? tw : null;
      return m;
    }

    /* the glyphs of the name over this meteor's own rectangle, dilated a
       little so a canvas that cannot reproduce the type's variable-font
       axes still covers every pixel of it */
    var mmask = null, mmc = null, mdraw = null, mdc = null;
    function metBuildMask() {
      mmask = null;
      var el = document.getElementById('hero-name'), r, bb, top;
      /* if the meteor never meets the name's box there is nothing to mask;
         if it does and the mask cannot be made, the meteor does not happen
         — we never paint on a pixel the type covers */
      try {
        if (!el) return true;
        r = host.getBoundingClientRect(); bb = el.getBoundingClientRect();
        top = bb.top - r.top;
        if (!(bb.height > 0) || top > mry + mrh || top + bb.height < mry) return true;
      } catch (e0) { return false; }
      if (!metMaskOK) return false;
      try {
        var left = bb.left - r.left;
        var cs = getComputedStyle(el), txt = metFont(el, cs);
        if (!txt) return false;
        var t = metCtx.measureText(txt);
        var ch = t.fontBoundingBoxAscent + t.fontBoundingBoxDescent;
        if (!(ch > 0) || !(t.width > 0)) return false;
        var base = top + (bb.height - ch) / 2 + t.fontBoundingBoxAscent;
        var kx = clamp(bb.width / t.width, 0.88, 1.14);
        var fs = parseFloat(cs.fontSize) || 40;
        if (!mmc) { mmask = document.createElement('canvas'); mmc = mmask.getContext('2d'); }
        else { mmask = mmc.canvas; }
        mmask.width = Math.max(1, Math.round(mrw * dpr));
        mmask.height = Math.max(1, Math.round(mrh * dpr));
        mmc.setTransform(dpr, 0, 0, dpr, -mrx * dpr, -mry * dpr);
        mmc.clearRect(mrx, mry, mrw, mrh);
        mmc.translate(left, 0); mmc.scale(kx, 1); mmc.translate(-left, 0);
        mmc.font = metCtx.font;
        try { mmc.letterSpacing = cs.letterSpacing; } catch (e3) {}
        mmc.textBaseline = 'alphabetic';
        mmc.fillStyle = '#000'; mmc.strokeStyle = '#000';
        mmc.lineJoin = 'round'; mmc.lineWidth = Math.max(5, fs * 0.022) / kx;
        mmc.strokeText(txt, left, base);
        mmc.fillText(txt, left, base);
        if (!mdc) { mdraw = document.createElement('canvas'); mdc = mdraw.getContext('2d'); }
        else { mdraw = mdc.canvas; }
        if (!mdc) { mmask = null; return false; }
        mdraw.width = mmask.width; mdraw.height = mmask.height;
      } catch (e) { mmask = null; return false; }
      return !!mmask;
    }

    function metCapture(m) {
      var S = metS();
      var g = (m.kind === 'burn' ? Math.max(16, S * 0.028) + m.reach : Math.max(7, S * 0.012))
            + m.w * 5 * Math.max(1, tn('width'));
      var x1 = m.x0 + m.dx, y1 = m.y0 + m.dy;
      mrx = Math.max(0, Math.floor(Math.min(m.x0, x1) - g));
      mry = Math.max(0, Math.floor(Math.min(m.y0, y1) - g));
      mrw = Math.min(W, Math.ceil(Math.max(m.x0, x1) + g)) - mrx;
      mrh = Math.min(H, Math.ceil(Math.max(m.y0, y1) + g)) - mry;
      if (!(mrw > 1 && mrh > 1)) return false;
      if (!metBuildMask()) return false;
      mplBad = true;
      if (!keepOK) { return true; }       // every frame there is a full repaint
      try {
        if (!mpl) { mpl = document.createElement('canvas'); mplc = mpl.getContext('2d', { alpha: false }); }
        if (!mplc) { mpl = null; return true; }
        mpl.width = Math.max(1, Math.round(mrw * dpr));
        mpl.height = Math.max(1, Math.round(mrh * dpr));
        mplc.setTransform(1, 0, 0, 1, 0, 0);
        mplc.drawImage(cvs, Math.round(mrx * dpr), Math.round(mry * dpr), mpl.width, mpl.height,
                            0, 0, mpl.width, mpl.height);
        mplBad = false;
      } catch (e) { mpl = null; }
      return true;
    }

    function metRestore() {
      if (!mpl || mplBad) return;
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(mpl, 0, 0, mpl.width, mpl.height,
                           Math.round(mrx * dpr), Math.round(mry * dpr), mpl.width, mpl.height);
      } catch (e) {}
    }

    /* it is over: the sky goes back exactly as it was under it */
    function metDrop() {
      if (!MET) return;
      if (ctx && !killed) metRestore();
      MET = null;
    }
    /* the canvas was repainted from scratch (resize, theme): the plate is
       stale, so let the meteor go without putting anything back */
    function metKill() { MET = null; mplBad = true; mmask = null; }

    /* cx is whichever surface it is going onto — the canvas itself, or the
       small offscreen the name's mask is then punched out of — and ox/oy
       move screen coordinates into that surface. */
    /* how a thing coming into the air looks as it heats: white-hot, then
       gold, then orange, then red. Every colour but the first is a token
       the sky itself is painted from, so the fire is this evening's fire
       and not a new palette. */
    /* how a thing coming into the air looks as it heats — and the whole
       drift is LOW saturation: cream, then a warm gold with the cream
       still in it, then a dull ember that has the land's darkness mixed
       back in. No neon, no red rim, nothing a firework would do. */
    function metCream() {
      return P.dark ? mix(P.star, [255, 255, 255], 0.62) : mix(P.indigo, [4, 6, 12], 0.30);
    }
    function heatCol(t) {
      var cream = metCream();
      var gold = mix(P.gold, cream, 0.34);
      var ember = mix(mix(P.orange, P.gold, 0.40), P.land, 0.28);
      var mid = mix(gold, ember, 0.55);
      if (t < 0.38) return mix(cream, gold, t / 0.38);
      if (t < 0.80) return mix(gold, mid, (t - 0.38) / 0.42);
      return mix(mid, ember, (t - 0.80) / 0.20);
    }

    /* where the head is at this instant, from the clock — one place, so
       the painter and anything that asks (metInfo, the probes) agree */
    function metHead(m) {
      if (!m) return null;
      var age = m.hold != null ? m.hold * m.life : (mclock - m.born);
      var u = clamp(age / m.life, 0, 1);
      /* one easing all the way through: the head eases to a stop where it
         breaks up, so there is no instant anywhere in it where the speed
         or the brightness steps */
      var hu = clamp(1 - Math.pow(1 - clamp(u / m.hE, 0, 1), m.hExp), 0, 1);
      return { u: u, hu: hu, age: age, x: m.x0 + m.dx * hu, y: m.y0 + m.dy * hu };
    }
    /* when the head went past the fraction f of the path (the inverse of
       the easing) — the train needs it to know how old each length is */
    function metAgeAt(m, f) {
      return m.life * m.hE * (1 - Math.pow(1 - clamp(f, 0, 1), 1 / m.hExp));
    }

    /* the outline of a streak's tail: from the head (hx, hy) back along
       (ux, uy) for tl px, half-width wh at the head falling off on a
       curve to a hair at the end. One path, filled once. */
    function metTaper(cx, hx, hy, ux, uy, nx, ny, tl, wh) {
      var K = 10, j, s, w;
      cx.beginPath();
      for (j = 0; j <= K; j++) {
        s = j / K; w = wh * (Math.pow(1 - s, 1.7) * 0.97 + 0.03 * (1 - s));
        if (j === 0) cx.moveTo(hx + nx * w, hy + ny * w);
        else cx.lineTo(hx + ux * tl * s + nx * w, hy + uy * tl * s + ny * w);
      }
      for (j = K; j >= 0; j--) {
        s = j / K; w = wh * (Math.pow(1 - s, 1.7) * 0.97 + 0.03 * (1 - s));
        cx.lineTo(hx + ux * tl * s - nx * w, hy + uy * tl * s - ny * w);
      }
      cx.closePath();
    }

    function metDraw(cx, ox, oy) {
      var m = MET;
      if (!m) return;
      var hd = metHead(m), u = hd.u, age = hd.age;
      var burn = m.kind === 'burn';
      var cream = metCream();
      var col = cream, S = metS();
      var k = P.dark ? 1 : 0.8, i;
      var wpx = Math.max(0.6, m.w * Math.max(0.1, tn('width')));
      cx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
      cx.globalCompositeOperation = 'source-over';
      cx.lineCap = 'round';
      cx.lineJoin = 'round';

      if (m.twk && u < 1) {
        for (i = 0; i < m.twk.length; i++) {
          var w = m.twk[i], d0 = Math.abs(u - w.u);
          if (d0 > 0.15) continue;
          var st = stars[w.i], q = skyPt(st.x, st.y);
          cx.globalAlpha = clamp((1 - d0 / 0.15) * 0.55 * k, 0, 1);
          cx.fillStyle = rgb(P.star);
          cx.fillRect(q[0] - st.r * 0.8, q[1] - st.r * 0.8, st.r * 1.6, st.r * 1.6);
        }
        cx.globalAlpha = 1;
      }

      var hu = hd.hu, hx = hd.x, hy = hd.y;
      var ux = -Math.cos(m.ang) * m.dir, uy = -Math.sin(m.ang);   // back along the path
      var nx = -uy, ny = ux;

      /* THE TRAIN. The one thing that makes a burn-up read as burning up
         is not the head, it is what stays behind: a faint, smoke-like
         line lying along the path it took, still there a couple of
         seconds after the head has gone, and dissolving in patches
         rather than fading all at once. Very low alpha, a little wider
         than the streak, and it never glows. */
      /* ONE STRIP, NOT A ROW OF STROKES. Each length of it used to be its
         own round-capped stroke, and every cap overlapped the next one at
         a fraction of an alpha: the train came out as a string of beads.
         Now it is a single filled outline — its width at each length is
         how far that length has spread — with ONE gradient along it that
         carries each length's own weight, so nothing is painted twice. */
      if (m.train > 0 && m.tn) {
        var tcol = P.dark ? mix(cream, P.gold, 0.30) : cream;
        var N = m.tn.length, base = 0.22 * k * Math.max(0, tn('train'));
        var tf = [], ta = [], tw = [], live = 0;
        for (i = 0; i <= N; i++) {
          var fi = Math.min(i / N, hu), ii = Math.min(i, N - 1);
          var old = age - metAgeAt(m, fi);            // how long ago it passed
          var q0 = clamp(old / Math.max(0.05, m.train * m.th[ii]), 0, 1);
          /* it thins and spreads as it goes, and it comes in as the head
             passes rather than appearing whole */
          var a = base * (0.42 + 0.58 * m.tn[ii]) * Math.pow(1 - q0, 1.25);
          /* AND IT STARTS WHERE THE METEOR STARTED TO BURN. The head comes
             in dim, so the train it leaves is born thin and faint there
             and thickens along the path; it used to begin at its widest,
             cut off square, a grey bar laid on the sky */
          var ent = sstep(0, 0.24, fi);
          a *= ent;
          tf.push(fi); ta.push(clamp(a, 0, 1)); tw.push(wpx * (0.60 + 1.05 * q0) * (0.30 + 0.70 * ent));
          if (a > 0.004) live++;
          if (fi >= hu) break;
        }
        var TN = tf.length;
        if (live && TN > 1 && hu > 0.004) {
          var sx0 = m.x0, sy0 = m.y0, ex0 = m.x0 + m.dx * hu, ey0 = m.y0 + m.dy * hu;
          var tg = cx.createLinearGradient(sx0, sy0, ex0, ey0);
          for (i = 0; i < TN; i++) tg.addColorStop(clamp(tf[i] / hu, 0, 1), rgba(tcol, ta[i]));
          var tnx = -Math.sin(m.ang) * m.dir, tny = Math.cos(m.ang);   // across the path
          cx.fillStyle = tg;
          /* SOFT ACROSS, NOT A RIBBON. One strip of one alpha has a hard
             edge, and a hard-edged band reads as a thing laid on the sky
             rather than smoke in it. Three nested strips of the same
             outline — full, two thirds, a third as wide — at a third of
             the weight each: the centre line carries what the one strip
             did and it falls away to nothing at the sides. */
          var LW = [1, 0.64, 0.30], LA = [0.30, 0.34, 0.36];
          for (var ly = 0; ly < 3; ly++) {
            var sw = LW[ly];
            cx.globalAlpha = LA[ly];
            cx.beginPath();
            for (i = 0; i < TN; i++) {
              var px0 = m.x0 + m.dx * tf[i], py0 = m.y0 + m.dy * tf[i];
              if (i === 0) cx.moveTo(px0 + tnx * tw[i] * sw, py0 + tny * tw[i] * sw);
              else cx.lineTo(px0 + tnx * tw[i] * sw, py0 + tny * tw[i] * sw);
            }
            for (i = TN - 1; i >= 0; i--) {
              cx.lineTo(m.x0 + m.dx * tf[i] - tnx * tw[i] * sw, m.y0 + m.dy * tf[i] - tny * tw[i] * sw);
            }
            cx.closePath();
            cx.fill();
          }
          cx.globalAlpha = 1;
        }
      }

      var env, bright, fk = 0, heat = 0, tailEnd = col;
      if (burn) {
        /* it comes in dim, brightens as the air takes hold of it, widens
           and brightens once at the end — a quiet terminal flare, not a
           burst — and is out. The colour drifts cream, gold, ember. */
        env = sstep(0, 0.10, u) * (1 - sstep(0.86, 1.00, u));
        bright = 0.34 + 0.66 * sstep(0.05, 0.50, u);
        fk = sstep(0.68, 0.90, u) * (1 - sstep(0.90, 1.00, u)) * Math.max(0, tn('flare'));
        heat = clamp(u / 0.90, 0, 1);
        col = heatCol(heat);
        tailEnd = mix(col, mix(P.orange, P.land, 0.35), 0.5);
      } else {
        env = sstep(0, 0.10, u) * (1 - sstep(0.66, 1, u));
        bright = 1; tailEnd = col;
      }

      /* how far the head has come since the last frame: the streak is
         drawn over AT LEAST that, so the path it swept is continuous at
         any frame rate instead of a row of dots */
      var step = 0;
      if (m.pt >= 0) step = Math.hypot(hx - m.px, hy - m.py);

      if (env > 0.004) {
        var tl = Math.min(m.tail * Math.max(0, tn('tail')), m.run * hu);
        tl = Math.max(tl, step + wpx);
        var lum0 = clamp(env * bright * k, 0, 1), px1 = 1 / dpr;
        /* the hottest part is nearly white on ink; on paper the streak is
           ink, and stays it */
        var hot = P.dark ? mix(col, [255, 251, 242], 0.55) : col;
        if (tl > 1.2) {
          /* THE TAIL: widest just behind the head and drawn in to nothing
             along a CURVE (metTaper), so it reads as speed and not as a
             ruled line; its colour cools from the head's white through
             cream to the evening's gold before it is gone */
          var warmT = burn ? tailEnd : (P.dark ? mix(mix(P.gold, P.coral, 0.35), col, 0.30) : col);
          var wh = Math.max(wpx * (burn ? 0.72 + 0.95 * fk : 0.60), px1 * 0.6);
          var g = cx.createLinearGradient(hx, hy, hx + ux * tl, hy + uy * tl);
          g.addColorStop(0, rgba(hot, clamp(0.95 * lum0, 0, 1)));
          g.addColorStop(0.10, rgba(col, clamp(0.68 * lum0, 0, 1)));
          g.addColorStop(0.38, rgba(mix(col, warmT, 0.55), clamp(0.28 * lum0, 0, 1)));
          g.addColorStop(0.72, rgba(warmT, clamp(0.08 * lum0, 0, 1)));
          g.addColorStop(1, rgba(warmT, 0));
          cx.fillStyle = g;
          metTaper(cx, hx, hy, ux, uy, nx, ny, tl, wh);
          cx.fill();
          if (P.dark && !burn) {
            /* and under it, wider and faint over its first half: the
               blur of a thing moving faster than the eye, not a glow */
            var g2 = cx.createLinearGradient(hx, hy, hx + ux * tl * 0.5, hy + uy * tl * 0.5);
            g2.addColorStop(0, rgba(col, clamp(0.13 * lum0, 0, 1)));
            g2.addColorStop(1, rgba(warmT, 0));
            cx.fillStyle = g2;
            metTaper(cx, hx, hy, ux, uy, nx, ny, tl * 0.5, wh * 2.4);
            cx.fill();
          }
        }

        if (burn) {
          /* THE HEAD: a short bright segment lying along the path, not a
             disc and not a dot with a bloom round it. It is brightest
             just behind its leading edge, and at the end it widens and
             brightens a little and goes out. */
          var hl = wpx * (3.2 + 5.0 * fk) + step * 0.5;
          var bx = hx + ux * hl, by = hy + uy * hl;
          var hgw = cx.createLinearGradient(hx, hy, bx, by);
          hgw.addColorStop(0.00, rgba(mix(col, cream, 0.30), clamp(0.45 * env * bright * k, 0, 1)));
          hgw.addColorStop(0.22, rgba(mix(col, cream, 0.45 * (1 - heat)), clamp(1.00 * env * bright * k, 0, 1)));
          hgw.addColorStop(1.00, rgba(col, 0));
          cx.strokeStyle = hgw;
          cx.lineWidth = wpx * (1.15 + 1.15 * fk);
          cx.beginPath(); cx.moveTo(hx, hy); cx.lineTo(bx, by); cx.stroke();
        } else {
          /* THE HEAD, MOVING: a bright core drawn out along the path by the
             distance it covered since the last frame (what a shutter does
             to it; round only when it is barely moving), and one tight
             bloom no wider than a few of its own widths */
          var hr = Math.max(wpx * 0.80, px1 * 0.9);
          var hlen = Math.max(hr * 1.6, Math.min(step, wpx * 14));
          var halo = 0.12 * Math.max(0, tn('halo'));
          if (halo > 0.002) {
            var hg = cx.createRadialGradient(hx, hy, 0, hx, hy, hr * 4.2);
            hg.addColorStop(0, rgba(col, clamp(halo * env * k, 0, 1)));
            hg.addColorStop(0.45, rgba(col, clamp(halo * 0.35 * env * k, 0, 1)));
            hg.addColorStop(1, rgba(col, 0));
            cx.fillStyle = hg;
            cx.beginPath(); cx.arc(hx, hy, hr * 4.2, 0, 6.2832); cx.fill();
          }
          var hgx = cx.createLinearGradient(hx, hy, hx + ux * hlen, hy + uy * hlen);
          hgx.addColorStop(0, rgba(hot, lum0));
          hgx.addColorStop(1, rgba(col, lum0 * 0.35));
          cx.strokeStyle = hgx;
          cx.lineWidth = hr * 2;
          cx.beginPath(); cx.moveTo(hx, hy); cx.lineTo(hx + ux * hlen, hy + uy * hlen); cx.stroke();
        }
      }

      /* what is left of it: two or three fragments carrying ON along
         nearly the same line, slowing, and gone inside a third of a
         second. Nothing flies sideways. */
      if (burn && m.sp && u >= 0.80) {
        var fx = m.x0 + m.dx, fy = m.y0 + m.dy;
        for (i = 0; i < m.sp.length; i++) {
          var s2 = m.sp[i];
          if (u < s2.t0) continue;
          var vv = clamp((u - s2.t0) / s2.len, 0, 1);
          if (vv >= 1) continue;
          var ee = 1 - (1 - vv) * (1 - vv);            // decelerating
          var th = m.ang + s2.ao;
          var ex = fx + Math.cos(th) * s2.d * ee * m.dir, ey = fy + Math.sin(th) * s2.d * ee;
          var ea = clamp(Math.pow(1 - vv, 1.4) * 0.80 * k, 0, 1);
          var ec = mix(heatCol(0.92), mix(P.orange, P.land, 0.42), clamp(vv * 1.3, 0, 1));
          var elen = wpx * (1.8 + 1.4 * s2.r) * (1 - vv * 0.5);
          cx.globalAlpha = ea;
          cx.strokeStyle = rgb(ec);
          cx.lineWidth = wpx * (0.70 + 0.55 * s2.r);
          cx.beginPath();
          cx.moveTo(ex, ey);
          cx.lineTo(ex + ux * elen, ey + uy * elen);
          cx.stroke();
        }
        cx.globalAlpha = 1;
      }

      if (m.hold == null) { m.px = hx; m.py = hy; m.pt = age; }
      cx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* the overlay, and it only exists while one is alive. Where the meteor
       crosses the name it is painted into its own small surface first and
       the glyphs are taken back out of it, so not one pixel the type
       covers is ever touched — which is also why the name's contrast
       cannot move no matter where a meteor goes. */
    function metPaint() {
      if (!MET) return;
      metPaints++;
      metRestore();
      if (mmask && mdraw && mdc) {
        mdc.setTransform(1, 0, 0, 1, 0, 0);
        mdc.globalCompositeOperation = 'source-over';
        mdc.clearRect(0, 0, mdraw.width, mdraw.height);
        metDraw(mdc, mrx, mry);
        mdc.setTransform(1, 0, 0, 1, 0, 0);
        mdc.globalCompositeOperation = 'destination-out';
        mdc.drawImage(mmask, 0, 0);
        mdc.globalCompositeOperation = 'source-over';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(mdraw, 0, 0, mdraw.width, mdraw.height,
                             Math.round(mrx * dpr), Math.round(mry * dpr), mdraw.width, mdraw.height);
      } else {
        metDraw(ctx, 0, 0);
      }
    }

    /* how long until the next one, and how long this one is around for
       (the burn-up is not over when the head is: its train is still in
       the sky and has to be painted until it has gone) */
    function metGap() { return (12 + mrnd() * 12) / Math.max(0.05, tn('rate')); }

    /* between swell frames: the meteor alone advances and repaints, inside
       its own small rectangle. The sky under it has not changed, so this
       is one blit of the plate and a few paths — the swell keeps its own
       ~33 fps and its whole-canvas cost, and the streak runs at whatever
       the display can do. Nothing here asks for a frame of its own. */
    function metFrame() {
      if (!MET || !ctx || killed || reduced) return;
      if (MET.hold != null) return;
      if (mclock - MET.born >= MET.total) { metDrop(); metAt = mclock + metGap(); return; }
      metPaint();
    }

    function metTick(settled) {
      if (reduced) return;
      if (MET && MET.hold != null) return;             // a probe is holding one still
      if (!settled || !mayRoll() || p > 0.10) { metDrop(); metAt = -1; return; }
      if (MET) {
        if (mclock - MET.born >= MET.total) { metDrop(); metAt = mclock + metGap(); }
        return;
      }
      /* the first one 2-4 s after the hero has settled, so a visitor
         who stays for a moment sees one; random from then on */
      if (metAt < 0) { metAt = mclock + 2 + mrnd() * 2; return; }
      if (mclock < metAt) return;
      /* the first one is the burn-up, so a visitor who stays four seconds
         sees the signature event; after that it is one in four */
      var m = makeMeteor(metNone || mrnd() < 0.25 ? 'burn' : 'streak');
      if (m) metNone = false;
      if (m) { m.born = mclock; MET = m; if (!metCapture(m)) MET = null; }
      if (!MET) { metAt = mclock + metGap(); saySt(); }   // it failed: say why
    }

    /* what the meteors are doing, for anything that wants to check it
       (the readout gets the same answer through metReason) */
    function metInfo() {
      var b = metBand(), hd = metHead(MET), d = {}, kk;
      for (kk in TUNE_DEF) if (Object.prototype.hasOwnProperty.call(TUNE_DEF, kk)) d[kk] = TUNE_DEF[kk];
      return { a: Math.round(b.a), b: Math.round(b.b), h: Math.round(b.b - b.a),
               min: MET_MIN, nameTop: Math.round(nameTop()), quiet: Math.round(quietBottom()),
               mask: !!metMaskOK, masked: !!mmask, reason: metReason(),
               alive: MET ? MET.kind : null,
               /* the head as it is right now, so a probe can measure the motion */
               hx: hd ? +hd.x.toFixed(3) : null, hy: hd ? +hd.y.toFixed(3) : null,
               phase: hd ? +hd.u.toFixed(5) : null, clock: +mclock.toFixed(4),
               t: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
               /* and where the head actually WAS the last time one was
                  painted — the only honest measure of how smooth it is */
               phx: MET && MET.pt >= 0 ? +MET.px.toFixed(3) : null,
               phy: MET && MET.pt >= 0 ? +MET.py.toFixed(3) : null,
               /* where each layer's horizon is on THIS frame, in device
                  rows: they are at different depths, so a camera move
                  pulls them apart, and anything that meets the water has
                  to be checked against the sea's own line */
               seaY: Math.round((hz + camAt(D_SEA).y) * dpr),
               skyY: Math.round((hz + camAt(D_SKY).y) * dpr),
               landY: Math.round((hz + camAt(D_LAND).y) * dpr),
               painted: metPaints, unit: Math.round(metS()),
               box: MET ? [Math.round(mrx), Math.round(mry), Math.round(mrw), Math.round(mrh)] : null,
               life: MET ? +MET.life.toFixed(3) : null,
               total: MET ? +MET.total.toFixed(3) : null,
               run: MET ? Math.round(MET.run) : null,
               tune: TUNE, tuneDefaults: d };
    }

    /* debug only, and never called from anywhere in here: a probe can
       ask for one on demand, and with a phase it is held at that instant
       so a screenshot can catch the flare. window.__world.spawnMeteor(). */
    function metDebug(kind, phase) {
      if (reduced || killed || !ctx) return false;
      metDrop();
      var m = makeMeteor(kind === 'burn' ? 'burn' : 'streak');
      if (!m) return false;
      MET = m;
      m.born = mclock;
      /* the phase is in units of the EVENT, and a burn-up's event is over
         before its train is: 1.5 holds it half a train after the head has
         gone, which is the only way to shoot the train on its own */
      if (typeof phase === 'number') m.hold = clamp(phase, 0.001, m.total / m.life - 0.001);
      if (!metCapture(m)) { MET = null; return false; }
      metPaint();
      metAt = mclock + metGap();
      wake();
      return true;
    }

    /* the whole picture, minus the swell */
    function paintStill() {
      if (!ctx) return;
      var o = open;
      var aSky = clamp(o / 0.16, 0, 1);
      var aStar = clamp((o - 0.06) / 0.44, 0, 1);
      var aSun = clamp((o - 0.20) / 0.36, 0, 1);
      var aCloud = clamp((o - 0.10) / 0.44, 0, 1);
      var aLand = clamp((o - 0.06) / 0.42, 0, 1);
      var aWater = clamp((o - 0.24) / 0.40, 0, 1);
      /* as the camera climbs the evening dims out of the page's way */
      var away = 1 - p * 0.86;

      paintSky();
      paintStars(aStar * away * (1 - p * 0.4));
      paintSun(aSun * away);
      paintClouds(aCloud * away);
      paintRanges(aLand * away);
      paintWater(aWater * away);
      paintGrainAndEdge();
      paintVeil();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      stillA = aWater * away;
      if (aSky < 1) { /* the first frames are the sky arriving; nothing to do */ }

      /* keep the lower half, so a swell frame is a copy and some rectangles */
      if (kctx) {
        try {
          kctx.setTransform(1, 0, 0, 1, 0, 0);
          kctx.clearRect(0, 0, keep.width, keep.height);
          kctx.drawImage(cvs, 0, Math.round(keepTop * dpr), keep.width, keep.height,
                              0, 0, keep.width, keep.height);
          keepOK = true;
        } catch (e) { keepOK = false; }
      }
      /* whatever a meteor had captured is now underneath a fresh painting */
      mplBad = true;
      /* AFTER the keep is cached, never before: the cache holds the raw
         picture and the ease is laid on fresh every frame, so a change of
         theme under the page cannot leave a stale foot behind */
      handover();
    }
    var keepOK = false, stillA = 1;

    /* ---- the handover to the painting below --------------------
       The pull-back turns about the waterline, so the FOOT of this canvas
       is a different colour at every scroll — cool grey-blue at one scroll
       position, warm cream at another — while the painting underneath
       opens on one fixed colour per theme. Butted together that is a
       ruler-drawn cut straight across the page (+11 to +13 luma and a hue
       flip on paper at scrollY 300). So the last HO_H css px are eased
       towards the painting's own first row: COLOUR ONLY, on a smoothstep
       that is 0 where the ramp starts and 1 on the last row, so nothing
       above the ramp is touched, there is no band to see, and the very
       last row IS the painting's first row at every scroll.

       The colour is READ FROM THE PAINTING (#journey's first strip, the
       average of its row 0), not copied here as a number: a number would
       drift silently the day that palette changes. It is read once per
       size and theme and cached; while the strip is missing or still
       blank the ease is skipped for that frame and the reason is in
       window.__world.handover. */
    var HO_H = 48;
    var hoC = null, hoKey = '', hoAt = -1e9, hoCost = 0, hoN = 0;
    var hoRead = false, hoReadMs = null;     // the readback is not the per-frame cost; it is timed apart
    var hoWhy = 'the painting below has not mounted yet';

    function hoColour() {
      var s = document.querySelector('#journey canvas');
      if (!s || !s.width) { hoC = null; hoKey = ''; hoWhy = 'the painting below has not mounted yet'; return null; }
      var key = s.width + 'x' + s.height + '|' +
                (document.documentElement.getAttribute('data-theme') || 'auto');
      if (hoC && key === hoKey) return hoC;
      /* a readback is not a per-frame cost: while the strip is blank this
         asks again a couple of times a second, never on every frame */
      var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - hoAt < 400) return null;
      hoAt = now;
      hoRead = true;
      var g = null, d = null;
      try { g = s.getContext('2d'); if (g) d = g.getImageData(0, 0, s.width, 1).data; }
      catch (e) { hoC = null; hoKey = ''; hoWhy = 'the painting below could not be read: ' + e; return null; }
      if (!d) { hoC = null; hoKey = ''; hoWhy = 'the painting below is not a 2d canvas'; return null; }
      var r = 0, gg = 0, b = 0, n = 0, i;
      for (i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;            // nothing painted there yet
        r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
      }
      if (n < s.width * 0.5) { hoC = null; hoKey = ''; hoWhy = 'the painting below has not painted its first row yet'; return null; }
      hoKey = key;
      hoC = [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
      hoWhy = 'the foot hands over to the painting below';
      return hoC;
    }

    function handover() {
      if (!ctx || !(H > 8)) return;
      var t0h = typeof performance !== 'undefined' ? performance.now() : 0;
      hoRead = false;
      var c = hoColour();
      if (c) {
        var h = Math.min(HO_H, H * 0.25);
        var y0 = H - h, y1 = H - 0.5 / dpr, i, t;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        var g = ctx.createLinearGradient(0, y0, 0, Math.max(y0 + 1, y1));
        for (i = 0; i <= 8; i++) {
          t = i / 8;
          g.addColorStop(t, rgba(c, t * t * (3 - 2 * t)));   // smoothstep: no edge where it starts
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, W, h + 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (t0h) {
        var dt = performance.now() - t0h;
        if (hoRead) hoReadMs = +dt.toFixed(3);      // once per size and theme, not per frame
        else { hoCost += dt; hoN++; }
      }
    }

    /* the still frame reduced motion gets: the whole picture, and ONE
       frame of the swell so the water has crests in it. A sea with no
       texture at all is not a calmer picture, it is a flat one. */
    function paintFrozen() {
      paintStill();
      paintSwell(0, stillA);
      handover();                 // the swell runs to the foot; the ease goes last
    }

    /* a frame while nothing but the water is moving */
    function paintMoving(time) {
      if (!keepOK || !kctx) { paintStill(); paintSwell(time, stillA); metPaint(); handover(); return; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(keep, 0, 0, keep.width, keep.height,
                          0, Math.round(keepTop * dpr), keep.width, keep.height);
      paintSwell(time, stillA);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      metPaint();
      handover();
    }

    /* ---- the loop ---------------------------------------------
       It runs for the opening, for camera moves, and — the site's one
       allowed exception — for the swell, but ONLY while the hero is on
       screen and the tab is visible. The moment either stops being true
       the loop is dropped and the page is at 0 rAF again. */
    var raf = 0, t0 = 0, tPrev = 0, running = false, paused = false, killed = false;
    var onScreen = true, frames = 0, cost = 0, worst = 0, settledSaid = false;
    var settledPaint = false;            // has a full frame been painted AT REST?
    var clock = 0, lastWater = -1e9;

    function mayRoll() {
      return !reduced && !paused && !killed && onScreen && !document.hidden;
    }

    function step(now) {
      raf = 0;
      if (killed || paused) { running = false; return; }
      var f0 = performance.now();
      if (!t0) { t0 = now; tPrev = now; }
      var dt = Math.min(0.5, Math.max(0.001, (now - tPrev) / 1000));
      tPrev = now;
      clock += dt;
      mclock += dt * Math.max(0, tn('timeScale'));
      if (open < 1) open = reduced ? 1 : clamp(outQuint(clamp((now - t0) / OPEN_MS, 0, 1)), 0, 1);
      var dp = pTarget - p;
      p += dp * (1 - Math.pow(0.00006, dt));
      if (Math.abs(dp) < 0.0012) p = pTarget;

      var still = open >= 1 && p === pTarget;
      /* THE WATERLINE. Every layer sits at its own depth, so while the
         camera is moving the sky's horizon and the sea's horizon are a
         fraction of a pixel apart and the dark ground shows between them
         — harmless, it is gone the next frame. But the lower half of the
         LAST moving frame is what gets cached for the swell to paint
         over, so that one hairline was frozen into the picture and never
         repainted: a thin dark line along the waterline for as long as
         the page was open. The moment the world comes to rest it gets
         one more full frame, at rest, and THAT is what is cached. */
      if (!still) settledPaint = false;
      /* the swell is a slow one, so it is painted at ~33 fps and not at
         whatever the display can do: half the raster for a roll nobody can
         see the difference in. The camera's own frames are never gated. */
      if (still && now - lastWater < 28) {
        /* the swell is gated, a meteor is not: while one is in the air it
           advances and repaints on EVERY frame, inside its own rectangle,
           so it is smooth at whatever the display runs at. It still never
           asks for a frame — this is a frame the swell had already taken. */
        if (MET) metFrame();
        raf = requestAnimationFrame(step);
        return;
      }
      lastWater = now;
      metTick(still);
      if (still && settledPaint) paintMoving(clock);
      else { paintStill(); paintSwell(clock, stillA); metPaint(); handover(); settledPaint = still; }

      var c = performance.now() - f0;
      frames++; cost += c; if (c > worst) worst = c;
      window.__world = { frames: frames, avgMs: +(cost / frames).toFixed(2), maxMs: +worst.toFixed(2),
                         lastMs: +c.toFixed(3), totalMs: +cost.toFixed(2),
                         stars: stars.length, settled: still, rolling: still && mayRoll(),
                         meteor: MET ? MET.kind : null, spawnMeteor: metDebug, metInfo: metInfo,
                         /* the foot's ease onto the painting below: what it is doing and what it costs */
                         handover: hoWhy, handoverRGB: hoC, hoReadMs: hoReadMs,
                         hoMs: hoN ? +(hoCost / hoN).toFixed(4) : null, hoFrames: hoN,
                         tune: TUNE };
      if (still && !settledSaid) { settledSaid = true; saySt(); }
      if (still && !mayRoll()) { running = false; return; }     // the sea is the only reason to keep a frame
      raf = requestAnimationFrame(step);
    }

    /* Nothing here is allowed to fail quietly. The readout says what the
       meteors are doing AND why, in the same voice as the rest of it. */
    function metReason() {
      if (reduced) return 'no meteors: reduced motion';
      if (!ctx || killed || lostCv) return 'no meteors: the sky is not being drawn';
      if (paused) return 'no meteors: the world is paused';
      var b = metBand();
      if (!(b.b - b.a > MET_MIN)) return 'no meteors: no quiet sky above the fire at this size';
      if (!onScreen) return 'no meteors: the hero is off screen';
      return 'a meteor now and then';
    }

    function line() {
      return reduced
        ? 'a sunset over the bay · still frame, no meteors (reduced motion)'
        : 'a sunset over the bay · the swell rolls only while this is on screen · ' + metReason();
    }

    /* one voice, one element: the same readout the scene already writes */
    var lastSaid = '';
    function saySt() {
      if (lostCv) return;
      var s = line();
      if (s === lastSaid) return;
      lastSaid = s;
      say(s);
    }

    function wake() {
      if (killed || paused || running || !ctx) return;
      if (open >= 1 && p === pTarget && !mayRoll()) return;
      running = true;
      t0 = t0 || 0; tPrev = 0;
      raf = requestAnimationFrame(function (n) { tPrev = n; step(n); });
    }
    function stop() {
      running = false;
      metDrop();                 // a meteor never outlives the frames it rides
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    /* ---- inputs ------------------------------------------------ */
    function setProgress(v) {
      v = clamp(+v || 0, 0, 1);
      if (Math.abs(v - pTarget) < 0.0004) return;
      pTarget = v;
      if (reduced) { p = v; paintFrozen(); return; }
      wake();
    }

    var onScroll = null;
    if (opts.auto !== false) {
      onScroll = function () {
        setProgress((window.scrollY || window.pageYOffset || 0) / travel);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* the gate on the swell: the hero's own box, not this host (the host
       is fixed to the viewport and would always be on screen) */
    var io = null;
    var gate = document.getElementById('hero') || host;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) {
          var vis = es[i].isIntersecting;
          if (vis === onScreen) continue;
          onScreen = vis;
          if (vis) wake(); else if (open >= 1 && p === pTarget) stop();
          if (settledSaid) saySt();
        }
      }, { threshold: 0 });
      io.observe(gate);
    }

    var rt = 0;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (killed) return;
        size();
        if (onScroll) onScroll();
        paintStill();
        wake();
        /* the strip of sky changes shape with the window, and on a wide
           short one it closes altogether: say so */
        if (settledSaid) saySt();
      }, 180);
    }
    window.addEventListener('resize', onResize);
    function onTheme() {
      setTimeout(function () {
        if (killed) return;
        metKill();
        palette(); makeBrushes(); makeSeaPlate(); bakeClouds(); bayChanged(); paintStill(); wake();
        if (settledSaid) saySt();
      }, 20);
    }
    document.addEventListener('inkthemechange', onTheme);
    function onVis() { if (document.hidden) stop(); else wake(); }
    document.addEventListener('visibilitychange', onVis);
    /* the painting below says when its first strip has been painted. If this
       canvas has already settled and dropped its loop (or never had one:
       reduced motion paints once at boot), the foot still carries its raw
       colour: read the row afresh — the cached colour may be the OLD theme's,
       read in the gap between a theme change and the strip's repaint — and
       lay the ease once more. One frozen frame, then nothing. */
    function onJourney() {
      if (killed) return;
      hoKey = ''; hoAt = -1e9;
      if (hoColour() && !running) paintFrozen();
    }
    document.addEventListener('journeypaint', onJourney);

    /* ---- go ---------------------------------------------------- */
    size();
    if (onScroll) onScroll();
    if (reduced) {
      open = 1; p = pTarget;
      paintFrozen();
      window.__world = { frames: 1, avgMs: 0, maxMs: 0, lastMs: 0, totalMs: 0,
                         stars: stars.length, settled: true, reduced: true, rolling: false,
                         meteor: null, spawnMeteor: metDebug, metInfo: metInfo,
                         tune: TUNE };   // spawnMeteor returns false: no meteors here
      saySt();
    } else {
      open = 0;
      paintStill();
      running = true;
      raf = requestAnimationFrame(step);
      say('a sunset over the bay · the camera is pulling back…');
    }

    var api = {
      failed: false,
      stars: function () { return stars.length; },
      settled: function () { return open >= 1 && p === pTarget; },
      setProgress: setProgress,
      pause: function () { paused = true; stop(); if (settledSaid) saySt(); },
      resume: function () { if (killed) return; paused = false; paintFrozen(); wake(); if (settledSaid) saySt(); },
      repaint: function () { if (!killed) { size(); paintFrozen(); wake(); } },
      /* the bay, for the ascent to climb out of: this frame's layout, the
         three ranges carried `over` px past each side of it, and the sea
         plate. Read-only; nothing in here changes when it is asked. */
      bay: function (over) {
        if (killed || lostCv || !(W > 0)) return null;
        var wr = rangesWide(Math.max(0, +over || 0));
        /* the cloud plate is empty above its highest band: the row where
           that band's ink can start at the worst (its tilt across the
           frame, its wobble, its thickest stretch and three sigmas of its
           blur), so the ascent blits the bands and not a sky of nothing */
        var cTop = hz;
        for (var ci = 0; ci < clouds.length; ci++) {
          var C = clouds[ci];
          cTop = Math.min(cTop, hz - C.t * hz - Math.abs(C.tilt) * W * 0.72 - C.wob -
                                C.th * 1.6 - 3 * (1.1 + C.th * 0.10) - 2);
        }
        return { W: W, H: H, hz: hz, dpr: dpr, phone: phone, sunX: sunX, sunR: sunR,
                 ranges: wr.list, sea: seaCv, seaPad: SEA_PAD,
                 clouds: cloudsBaked ? cloudCv : null, cloudTop: Math.max(0, Math.floor(cTop)) };
      },
      destroy: function () {
        if (killed) return;
        killed = true; stop();
        if (io) { try { io.disconnect(); } catch (e) {} }
        window.removeEventListener('resize', onResize);
        document.removeEventListener('inkthemechange', onTheme);
        document.removeEventListener('visibilitychange', onVis);
        document.removeEventListener('journeypaint', onJourney);
        if (onScroll) window.removeEventListener('scroll', onScroll);
        try { host.removeChild(cvs); } catch (e) {}
      },
      canvas: cvs
    };
    return api;
  }

  var current = null;

  /* Two doors, on purpose — see the note in the deep-ink original: the
     ambient engine (scene.js) offers ITS host to `InkWorld.mount`, and the
     front page declines it, because this world belongs to the HERO and one
     screen of it. `mount` is only published where there is no hero host. */
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
