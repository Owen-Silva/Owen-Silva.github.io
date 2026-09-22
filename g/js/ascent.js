/* ============================================================
   ascent.js — THE ASCENT. The world under the whole page.

   The hero (js/world.js) is a bay in the last ten minutes of the
   light, painted from sea level. This file is the same bay, and
   the same evening, seen from a camera that keeps going up: the
   page's scroll is the camera's ALTITUDE. By the foot of the page
   the camera is six hundred kilometres over the water, the bay is
   a coastline with a town on it, the sunset is a sliver of fire
   along the planet's limb, and the meteors are burning up BELOW.

   It is one 2D canvas, fixed behind <main>, no library.

   WHAT IS REAL IN HERE
     The geometry is not a parallax stack. There is a sphere of
     radius 6,371 km, a pinhole camera at height h above one point
     on it, and everything — the horizon and its curve, how far
     you can see, where a headland's crest stands against the sky,
     when a town over the bulge comes into view, where a cloud at
     nine kilometres sits once you are above it — falls out of that
     one projection. Which is why the ascent reads: the horizon
     bows because it IS the rim of a ball, the coast opens because
     you really can see further, and the clouds pass you.

       dip   = acos(R / (R + h))      the horizon, below level
       proj  = pinhole, pitch only, no yaw and no roll
       seen  = the segment camera→point misses the sphere

   HOW A FRAME IS PAINTED (back to front)
     · the sky, as ~56 vertical strips, each one offset to the
       horizon's own height at that column — which is how the
       curve gets into a flat gradient for nothing;
     · the stars, a celestial sphere turning on its own axis, with
       the Milky Way as real dust rather than a painted smear, cut
       off at the horizon line, dimmed by the air near it;
     · the sun, the fire, and the arc that hugs the curve;
     · the sea and the night side, the same 56 strips again;
     · the glint, the coast, the town, the cloud deck, a meteor;
     · the quiet: one blit of a plate baked from the page's own
       text rectangles, so nothing bright is ever under a word.

   THE HAND-OVER
     For the first 150 px of scroll this world is LOCKED to the
     document exactly as the hero's own canvas is (it is absolute,
     it scrolls away) — same horizon row, same ramp, same sun, same
     headlands — so the hero's dissolve over those 150 px is a
     dissolve between two copies of one picture and there is no
     seam to find. Past that the lock releases into the climb.

   window.Ascent.mount(host, opts) -> api
   window.__scroll                  the knobs (freeze, unfreeze, setY,
                                    setClock, step, snap, repaint, and
                                    km, hzY, ms, maxMs, frames, rafs)
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- small helpers (world.js's, so the voice is one voice) ---- */

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
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) { var p = m[1].split(','); return [+p[0] | 0, +p[1] | 0, +p[2] | 0]; }
    return [0, 0, 0];
  }
  function mix(a, b, t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function lum(c) { return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; }
  function cvar(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return hex(v && v.trim() ? v : fb);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function sstep(a, b, x) { return a === b ? (x < a ? 0 : 1) : smooth(clamp((x - a) / (b - a), 0, 1)); }

  function noiseTable(seed) {
    var r = rng(seed), t = new Float32Array(512), i;
    for (i = 0; i < 256; i++) t[i] = t[i + 256] = r();
    return t;
  }
  function vnoise(x, t) {
    var i = Math.floor(x), f = x - i, a = t[i & 255], b = t[(i + 1) & 255];
    return a + (b - a) * smooth(f);
  }
  function fbm(x, t, oct) {
    var v = 0, amp = 1, f = 1, norm = 0, i;
    for (i = 0; i < oct; i++) { v += amp * vnoise(x * f, t); norm += amp; f *= 2.03; amp *= 0.5; }
    return v / norm;
  }
  function ridged(x, t, oct) {
    var v = 0, amp = 1, f = 1, norm = 0, i;
    for (i = 0; i < oct; i++) {
      var n = 1 - Math.abs(vnoise(x * f + i * 7.13, t) * 2 - 1);
      v += amp * n * n; norm += amp; f *= 2.07; amp *= 0.52;
    }
    return v / norm;
  }

  /* the hero's ramp, byte for byte: t is height in the sky, 0 at the
     horizon and 1 overhead, and only t < 0.25 is allowed to be bright */
  function skyRamp(P) {
    return [
      [0.000, P.flare], [0.028, P.gold], [0.070, P.orange], [0.130, P.coral],
      [0.210, mix(P.coral, P.magenta, 0.62)], [0.320, P.magenta],
      [0.450, mix(P.magenta, P.indigo, 0.62)], [0.620, P.indigo],
      [0.800, mix(P.indigo, P.zenith, 0.62)], [1.000, P.zenith]
    ];
  }

  var R_EARTH = 6371;            // km
  var TAU = Math.PI * 2;

  /* =========================================================== */

  function build(host, opts) {
    opts = opts || {};
    var say = opts.onState || function () {};
    var reduced = opts.reduced != null ? opts.reduced : REDUCED;

    var cvs = document.createElement('canvas');
    cvs.className = 'ascent__cv';
    cvs.setAttribute('aria-hidden', 'true');
    var ctx = null, dead = '';
    try {
      ctx = cvs.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('a 2D canvas context could not be created');
    } catch (e) { dead = (e && e.message) || 'the canvas could not be drawn on'; }
    if (dead) {
      say('failed: the ascent could not be drawn (' + dead + '). The page keeps the same evening as a CSS gradient.', true);
      return { failed: true, setY: function () {}, relayout: function () {}, destroy: function () {} };
    }
    host.appendChild(cvs);
    cvs.addEventListener('contextlost', function (ev) {
      ev.preventDefault(); lostCv = true; stop(); cvs.style.display = 'none';
      say('failed: the ascent lost its canvas mid-flight. The page keeps the same evening as a CSS gradient.', true);
    });

    var lostCv = false, killed = false, paused = false;
    var W = 0, H = 0, dpr = 1, narrow = false, budget = 0;

    /* ---- palette ------------------------------------------- */
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
      /* space is not black: it is the colour a camera records it, which
         is a very dark blue with nothing in it at all */
      P.space = P.dark ? [4, 6, 13] : [186, 196, 210];
      P.night = P.dark ? [5, 7, 12] : [206, 210, 214];   // the planet's unlit side
      P.air = P.dark ? [78, 134, 200] : [150, 178, 214]; // the atmosphere, edge on
      P.lamp = P.dark ? [255, 198, 138] : [214, 160, 104];
      P.k = P.dark ? 1 : 0.42;
    }
    function skyAt(t) {
      var r = P.ramp, i; t = clamp(t, 0, 1);
      for (i = 1; i < r.length; i++) {
        if (t <= r[i][0]) { var u = (t - r[i - 1][0]) / (r[i][0] - r[i - 1][0]); return mix(r[i - 1][1], r[i][1], u); }
      }
      return r[r.length - 1][1];
    }

    /* the hero's sea, as a ramp: depth into the water, the height of the
       sky it gives back, and how much of that the water keeps */
    var SEA_STOPS = [
      [0.000, 0.000, 0.44], [0.022, 0.030, 0.49], [0.055, 0.075, 0.55],
      [0.105, 0.135, 0.58], [0.175, 0.215, 0.63], [0.265, 0.320, 0.70],
      [0.380, 0.450, 0.80], [0.520, 0.620, 0.91], [0.700, 0.800, 0.97],
      [1.000, 1.000, 1.00]
    ];
    function seaAt(i) {
      var s = SEA_STOPS[i];
      return mix(mix(skyAt(s[1]), P.sea, s[2]), P.deep, sstep(0.30, 1.00, s[0]) * 0.95);
    }

    /* ---- the climb ------------------------------------------
       Scroll fraction of the document to kilometres, one stop per
       beat of the page. Interpolated in LOG height, because that is
       how altitude reads: the first kilometre is as big a change as
       the next hundred. */
    var KM_STOPS = [
      [0.000, 0.035],
      [0.017, 0.048],   // the hero is still up; the lock holds
      [0.055, 0.60],    // the bay starts to drop away
      [0.100, 2.8],     // the tally: a coastline, not a shore
      [0.165, 8.2],     // the commit river: into the cloud bands
      [0.215, 15.0],    // through them; they are below now
      [0.300, 36.0],    // the count: the arc thins, the curve begins
      [0.430, 95.0],    // the ones with users: the town, far below
      [0.580, 185.0],   // the register: the edge of space
      [0.720, 300.0],   // the features: meteors burning under you
      [0.870, 470.0],   // the numbers
      [1.000, 650.0]    // the colophon: space
    ];
    function kmAt(u) {
      var s = KM_STOPS, i;
      u = clamp(u, 0, 1);
      for (i = 1; i < s.length; i++) {
        if (u <= s[i][0]) {
          var t = smooth((u - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
          return s[i - 1][1] * Math.pow(s[i][1] / s[i - 1][1], t);
        }
      }
      return s[s.length - 1][1];
    }

    /* Where the horizon stands on screen. Driven by the scroll and not by
       the height, so the composition settles once and then holds: the eye
       wants one stable line to read the climb against. */
    var HZ0 = 0.780;
    function hzFracAt(u) { return HZ0 - (HZ0 - 0.622) * sstep(0, 0.160, u) - 0.022 * sstep(0.55, 1, u); }

    /* THE LOCK. The hero's canvas is absolute: it scrolls off with the
       page. For the 150 px in which it dissolves, this world translates
       with it, 1 px for 1 px, so the two are the same picture and the
       dissolve has no seam in it. Then the lock lets go over the next
       thousand pixels and the climb has the camera. */
    var LOCK = 150;
    function offAt(y) {
      if (y <= LOCK) return -y;
      return -LOCK * (1 - sstep(LOCK, 1400, y));
    }

    /* how much of the sky the lit air still fills (it thins as you leave
       it), and how much of what is left is space */
    /* How much of the sky the lit air still fills. On the water it is the
       whole of it; by thirty kilometres the sky overhead is already black
       and the evening is a band along the rim; from orbit it is a sliver
       a few pixels deep. These three curves ARE the ascent. */
    function compressAt(km) { return 1 / (1 + Math.pow(km / 4.2, 0.94) * 1.62); }
    function spaceAt(km) { return sstep(1.6, 40, km); }
    function nightAt(km) { return sstep(0.8, 46, km); }

    /* ---- the stars ------------------------------------------
       A celestial sphere: unit directions, turning slowly about an axis
       of its own. The Milky Way is 60% of them, crowded on to a great
       circle, most of them under a pixel and nearly out — dust, which is
       what it is, rather than a blurred band painted on the sky. */
    var SKY_AXIS = (function () {
      var a = [0.78, 0.34, 0.24], L = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
      return [a[0] / L, a[1] / L, a[2] / L];
    })();
    var stX, stY, stZ, stA, stR, stN = 0, stMW;
    /* the draw is bucketed by alpha: setting globalAlpha a thousand times
       a frame is a thousand canvas state changes, and it was most of an
       eight-millisecond frame */
    var NB = 11, bufX = [], bufY = [], bufR = [], bufN = [];
    function makeStars() {
      /* THERE HAVE TO BE TENS OF THOUSANDS OF THEM. The frame is about a
         thirteenth of the whole sky, so a field of 1,700 put twenty on
         screen and the first shot from orbit had a nearly empty sky. The
         loop is cheap because the very first thing each star is asked is
         whether it is in front of the camera at all — three multiplies —
         and five in six are not. */
      var n = Math.round(clamp(budget / 175, 3000, 15500));
      stN = n;
      stX = new Float32Array(n); stY = new Float32Array(n); stZ = new Float32Array(n);
      stA = new Float32Array(n); stR = new Float32Array(n); stMW = new Uint8Array(n);
      var r = rng(20260921), i;
      /* THE GALAXY'S POLE IS ALSO THE SKY'S POLE. Built on any other axis
         the band drifts out of the frame and the finale is a plain
         scatter of stars (it was); built on this one it lies across the
         picture on a diagonal, stays there, and the whole sky turns
         about it — which is what a sky actually does about ITS pole. */
      var wx = SKY_AXIS[0], wy = SKY_AXIS[1], wz = SKY_AXIS[2];
      var ux = -wy, uy = wx, uz = 0;
      var ul = Math.sqrt(ux * ux + uy * uy) || 1; ux /= ul; uy /= ul;
      var vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
      for (i = 0; i < n; i++) {
        var inMW = i < n * 0.52;
        var x, y, z;
        if (inMW) {
          var th = r() * TAU;
          /* a band with a soft edge and a dust lane down the middle */
          var g = (r() + r() + r() - 1.5) * 0.072;
          g += (r() < 0.14 ? (r() - 0.5) * 0.26 : 0);
          var cw = Math.cos(th), sw = Math.sin(th);
          x = ux * cw + vx * sw + wx * g; y = uy * cw + vy * sw + wy * g; z = uz * cw + vz * sw + wz * g;
          var L = Math.sqrt(x * x + y * y + z * z); x /= L; y /= L; z /= L;
        } else {
          do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.02);
          var L2 = Math.sqrt(x * x + y * y + z * z); x /= L2; y /= L2; z /= L2;
        }
        var mag = Math.pow(r(), inMW ? 3.4 : 2.1);
        stX[i] = x; stY[i] = y; stZ[i] = z;
        stR[i] = inMW ? 0.6 + mag * 1.0 : 0.65 + mag * 1.6;
        stA[i] = (inMW ? 0.11 + mag * 0.50 : 0.13 + mag * 0.87);
        stMW[i] = inMW ? 1 : 0;
      }
      var cap = Math.max(600, Math.round(n * 0.22)), b;
      bufX = []; bufY = []; bufR = []; bufN = new Int32Array(NB);
      for (b = 0; b < NB; b++) { bufX.push(new Float32Array(cap)); bufY.push(new Float32Array(cap)); bufR.push(new Float32Array(cap)); }
    }

    /* ---- the cloud deck -------------------------------------
       Real cloud, at a real height, at a real distance. From the water
       the near ones stand high in the sky and the far ones crowd on to
       the horizon — which is the hero's ladder of bands, for free. Climb
       past nine kilometres and the same cloud is under you. */
    var clouds = [];
    function makeClouds() {
      clouds = [];
      var bands = narrow ? 13 : 17, r = rng(88121), b, i;
      for (b = 0; b < bands; b++) {
        var u = (b + 0.25) / bands;
        /* ground distance, pushed out hard so most of them crowd the rim */
        var dist = 5.5 * Math.pow(58, u);                 // 5.5 km → 320 km
        var per = Math.max(3, Math.round((narrow ? 5 : 8) * (0.45 + u)));
        for (i = 0; i < per; i++) {
          var az = (r() - 0.5) * 2.6;
          var d = dist * (0.72 + r() * 0.66);
          /* A CLOUD HAS A SIZE IN KILOMETRES, and the picture gets its
             perspective from dividing that by how far away it is. Scaling
             the size WITH the distance — which the first pass did — makes
             every cloud the same size on screen and throws the depth away.
             A band is thin and very long: a few hundred metres deep and
             tens of kilometres from end to end, which from the water is a
             line across the sky and from the rim is a streak. */
          clouds.push({
            phi: d / R_EARTH,
            az: az,
            alt: 3.2 + r() * 9.4,
            thick: 0.16 + r() * 0.42,
            len: 16 + Math.pow(r(), 0.8) * 84,
            spr: (r() * 8) | 0,
            a: 0.40 + r() * 0.44,
            dz: (r() - 0.5) * 0.9,                       // its own drift
            ph: r() * TAU
          });
        }
      }
      /* and the low deck over the night side: big, broken, almost out.
         From the water it is under the horizon and there is nothing of it
         to see; from a hundred kilometres up it is what stops the dark
         side of the planet reading as a hole cut in the page. */
      var r2 = rng(33107), j;
      var nd = narrow ? 80 : 150;
      for (j = 0; j < nd; j++) {
        var dd = 90 * Math.pow(26, Math.pow(r2(), 0.75));
        clouds.push({
          phi: dd / R_EARTH, az: (r2() - 0.5) * 2.9,
          alt: 1.4 + r2() * 4.0,
          thick: 0.4 + r2() * 0.8,
          len: 26 + Math.pow(r2(), 0.7) * 190,
          spr: (r2() * 8) | 0,
          a: 0.13 + r2() * 0.20,
          deck: 1, dz: (r2() - 0.5) * 0.7, ph: r2() * TAU
        });
      }
      clouds.sort(function (x, y) { return y.phi - x.phi; });   // far ones first
    }

    /* EIGHT soft, broken shapes; two lightings each. A cloud is never a
       clean ellipse, and a ruled edge is the thing that gives a sprite
       away, so the alpha is cut by noise along its length. Four was not
       enough: looking DOWN on the deck from orbit there are eighty of
       them in the frame at once, and the eye found the repeat. The bake
       is once per resize and theme, so the extra four cost nothing a
       frame. */
    var SPR = [], SPRW = 168, SPRH = 64;
    function makeSprites() {
      SPR = [];
      var body = mix(P.cloud, P.zenith, 0.25);
      var under = mix(P.gold, P.coral, 0.42);
      var over = P.dark ? mix(P.flare, P.cloud, 0.46) : mix(P.flare, P.zenith, 0.3);
      for (var s = 0; s < 8; s++) {
        for (var lit = 0; lit < 2; lit++) {
          var c = document.createElement('canvas');
          c.width = SPRW; c.height = SPRH;
          var g = c.getContext('2d');
          if (!g) { SPR.push(null); continue; }
          var tbl = noiseTable(4400 + s * 137), t2b = noiseTable(9100 + s * 311), x, y;
          var im = g.createImageData(SPRW, SPRH), d = im.data;
          var edge = lit ? over : under;
          for (y = 0; y < SPRH; y++) {
            var vy = (y / (SPRH - 1)) * 2 - 1;
            for (x = 0; x < SPRW; x++) {
              var vx = (x / (SPRW - 1)) * 2 - 1;
              /* the body: a long lens, thinned by two noise frequencies */
              var prof = 1 - vx * vx;
              if (prof <= 0) continue;
              var nf = fbm(x * 0.055 + s * 9.1, tbl, 3);
              var nb = fbm(x * 0.017 + s * 3.3, tbl, 2);
              var th = prof * (0.30 + 0.70 * nb) * (0.55 + 0.75 * nf);
              /* AND THE SPINE WANDERS. With the thickness alone modulated
                 the silhouette is a clean symmetric lens, and a lens
                 squashed flat — which is what every cloud in the deck is,
                 looked down on from orbit — is a DIAMOND. A hundred and
                 fifty identical diamonds is not weather. Shifting the
                 centre line per column costs nothing at bake time and the
                 shape stops being one shape. */
              var yo = (fbm(x * 0.031 + s * 5.7, t2b, 2) - 0.5) * 0.62 * prof;
              var a = 1 - Math.abs(vy - yo) / Math.max(0.06, th);
              if (a <= 0) continue;
              a = Math.pow(clamp(a, 0, 1), 0.85);
              /* the light is on one face only — under it from the water,
                 on top of it from above; never all over it */
              var vyc = vy - yo;                      // the light reads off the spine too
              var face = lit ? clamp((-vyc) / Math.max(0.08, th) * 0.5 + 0.5, 0, 1)
                             : clamp((vyc) / Math.max(0.08, th) * 0.5 + 0.5, 0, 1);
              face = Math.pow(face, 2.4);
              var col = mix(body, edge, face * 0.92);
              var o = (y * SPRW + x) * 4;
              d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
              d[o + 3] = Math.round(a * 255 * (lit ? (0.24 + face * 0.86) : 1));
            }
          }
          g.putImageData(im, 0, 0);
          SPR.push(c);
        }
      }
    }

    /* ---- the coast ------------------------------------------
       Two headlands closing the bay, the way the hero has them, and a
       far shore behind them that only the height ever shows you. Each
       one is a shoreline (on the water) and a crest (up in the air):
       from the water you see the crest over the bulge and the shore is
       hidden; from a hundred kilometres the crest is nothing and the
       shore is the drawing. The same two curves do both. */
    var lands = [];
    function makeLands() {
      lands = [];
      function coast(def) {
        var n = def.n || (narrow ? 110 : 190), i, t = noiseTable(def.seed), t2 = noiseTable(def.seed + 91);
        var az = new Float32Array(n), sh = new Float32Array(n), cr = new Float32Array(n),
            ht = new Float32Array(n), fr = new Float32Array(n);
        for (i = 0; i < n; i++) {
          var u = i / (n - 1);
          az[i] = def.a0 + (def.a1 - def.a0) * u;
          /* zero at the open-water end, full at the outside: a headland
             SHELVES into a bay, it does not stand up out of it */
          var m = Math.pow(sstep(0, def.taper, def.flip ? (1 - u) : u), 1.15);
          var wob = (fbm(u * 5.2, t, 3) - 0.5);
          var shore = def.shore * (1 + wob * 0.34);
          /* AND THE LAND CLOSES AT THAT END TOO. Tapering only the height
             left the headland standing as a flat band of ground thirty
             kilometres deep that stopped dead in mid-air: from the water
             the bulge hides the flat, but from a kilometre up you see on
             to it, and the band read as a black rectangle with a straight
             edge cut down one side. A coast ends in a spit, so the far
             side of it comes in to meet the shore. */
          var e = sstep(0, 0.13, def.flip ? (1 - u) : u);
          sh[i] = shore / R_EARTH;
          cr[i] = (shore + def.width * (0.55 + fbm(u * 3.1, t2, 2) * 0.9) * e) / R_EARTH;
          fr[i] = (shore + def.width * (2.1 + fbm(u * 2.2, t2, 2) * 1.4) * e) / R_EARTH;
          /* the crags: ridged noise, biting hardest where the range comes
             down to the water. Normalised, or the peaks come out at half
             the height they were asked for and the bay is closed by two
             rolling hills instead of two headlands. */
          var rd = ridged(u * def.rough, t, 5) * 1.34 - 0.10;
          rd = rd * 0.74 + fbm(u * 2.4, t2, 2) * 0.46;
          /* and a few metres of spur on top of the smooth descent, so the
             outline has steps in it rather than one clean ramp */
          rd *= 1 - 0.26 * (1 - ridged(u * def.rough * 3.1, t2, 2));
          ht[i] = def.h * m * clamp(rd, 0, 1.25);
        }
        lands.push({ az: az, sh: sh, cr: cr, fr: fr, ht: ht, n: n, tone: def.tone || 0, far: !!def.far });
      }
      /* the left headland: from the frame's edge in to the open water */
      coast({ seed: 1471, a0: -1.30, a1: -0.290, shore: 30, width: 11, h: 4.6, rough: 26, taper: 0.62, flip: true, tone: 0.10 });
      /* the right: it reaches further into the bay and stands lower */
      coast({ seed: 9311, a0: 0.214, a1: 1.34, shore: 28, width: 13, h: 4.2, rough: 31, taper: 0.66, flip: false, tone: 0.06 });
      /* the far shore: nothing from the water, the whole coastline from up */
      coast({ seed: 5527, a0: -1.45, a1: 1.45, shore: 132, width: 46, h: 1.5, rough: 9, taper: 0.30, flip: false, tone: 0.24, far: true });
    }

    /* the town: warm grains along the far shore and in the fold between
       the headlands. Nothing from the water — it is over the bulge — and
       a small scatter from two hundred kilometres up, which is exactly
       what a town is from there. */
    var town = null;
    function makeTown() {
      var n = Math.round(clamp(budget / 2700, 280, 1050));
      var phi = new Float32Array(n), az = new Float32Array(n), a = new Float32Array(n),
          ph = new Float32Array(n), wm = new Float32Array(n), nearby = new Uint8Array(n);
      var r = rng(60613), i;
      /* eight or nine seeds, and the rest strung between them: settlement
         follows a coast and a road, it does not scatter evenly */
      var seeds = [];
      for (i = 0; i < 11; i++) {
        seeds.push({ d: 320 * Math.pow(7.2, i / 10) * (0.7 + r() * 0.7), az: (r() - 0.5) * 2.7, s: 0.10 + r() * 0.22 });
      }
      for (i = 0; i < n; i++) {
        var d, azm, near = 0;
        var pick = r();
        if (pick < 0.40) {
          /* the bay's own town, on the far shore: the first lights to come
             on, and the only ones you can see from the water at all */
          if (r() < 0.55) { d = 118 + r() * 34; azm = -0.30 + (r() - 0.5) * 0.52; }
          else { d = 128 + r() * 46; azm = 0.34 + (r() - 0.5) * 0.66; }
          near = 1;
        } else {
          /* and then the rest of the coast, out to two and a half thousand
             kilometres: from orbit this is the only thing that draws the
             planet at all */
          var s = seeds[(r() * seeds.length) | 0];
          var sp = Math.pow(r(), 1.7);
          d = s.d * (1 + (r() - 0.5) * sp * 0.55);
          azm = s.az + (r() - 0.5) * sp * s.s * 4.2;
        }
        d *= 1 + (r() - 0.5) * 0.09;
        phi[i] = d / R_EARTH; az[i] = azm;
        a[i] = 0.22 + Math.pow(r(), 2.0) * 0.78;
        ph[i] = r() * TAU;
        wm[i] = r();
        nearby[i] = near;
      }
      town = { n: n, phi: phi, az: az, a: a, ph: ph, wm: wm, near: nearby };
    }

    /* ---- the grain ------------------------------------------ */
    var grain = null;
    function makeGrain() {
      var s = 92, c = document.createElement('canvas');
      c.width = s; c.height = s;
      var g = c.getContext('2d');
      if (!g) { grain = null; return; }
      var im = g.createImageData(s, s), d = im.data, r = rng(4242), i;
      for (i = 0; i < d.length; i += 4) {
        var v = 118 + (r() - 0.5) * 150;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      try { grain = ctx.createPattern(c, 'repeat'); } catch (e) { grain = null; }
    }

    /* ---- the quiet ------------------------------------------
       The picture is free to be as loud as it likes where there is
       nothing to read. Under a word it may not be. Every text box on the
       page is baked ONCE, in document coordinates, into a quarter-scale
       plate and blurred there; a frame costs one blit of the slice under
       the window. No box, no edge, and it moves with the text because it
       IS the text's own shape. */
    var qp = null, qctx = null, qH = 0, qScale = 0.25, qWhy = '';
    var QSEL = 'h1,h2,h3,h4,p,li,dt,dd,th,td,pre,code,figcaption,label,button,a,[data-quiet]';
    function makeQuiet() {
      qp = null; qctx = null; qScale = 0.25;
      var docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (!(docH > 0) || !(W > 0)) { qWhy = 'failed: the page has no height to measure text in'; return; }
      var pw = Math.max(8, Math.round(W * qScale)), phh = Math.max(8, Math.round(docH * qScale));
      if (phh > 16000) { qScale = 16000 / docH; phh = 16000; pw = Math.max(8, Math.round(W * qScale)); }
      var c = document.createElement('canvas');
      c.width = pw; c.height = phh;
      var g = c.getContext('2d');
      if (!g) { qWhy = 'failed: the quiet plate could not be drawn on'; return; }
      var sy = window.scrollY || window.pageYOffset || 0;
      var els = document.querySelectorAll('#main ' + QSEL.split(',').join(',#main '));
      var pad = 15, n = 0, i;
      /* A GREY, AND IT IS MULTIPLIED IN. A flat black wash under the type
         is a box: over the dark sky it is the only thing that changes, so
         the eye finds its edges however soft they are (it did, at 150 px:
         four rectangles). Multiplied instead, the wash is proportional —
         invisible where the picture is already dark, and it only bites
         where the light is, which is the only place it was ever for. */
      /* THE TEXT'S OWN SHAPE, NOT THE BOX IT SITS IN. The readouts on this
         page are one right-aligned line inside a full-width <p>: the
         block's rect is 1,216 px across and the ink in it is 20, so the
         plate laid a soft full-width BAND across the sky — the exact
         shape it exists to avoid. A range over the element's contents
         gives the line boxes, which are the ink. */
      /* AND THE PLATE IS AS STRONG AS THE TYPE IS SMALL. One flat grey
         under everything took the sky to a third of its brightness under
         the NAME — two hundred pixels of cream that was never in any
         danger — and that is the one part of the picture a stranger sees
         first. A line box's own height says which it is: display type
         gets a touch, body copy gets the wash it needs. They are laid
         lightest first so the strong one always wins an overlap. */
      var rng = null;
      try { rng = document.createRange(); } catch (e0) { rng = null; }
      /* Only DISPLAY type gets the light touch, and it can afford it: the
         name and the section heads are cream at forty-six pixels and up,
         and they never stand on the fire — the fire is a band at the
         waterline and they are hundreds of pixels above it. Body copy
         keeps very nearly the wash it always had, because body copy is
         the thing that does end up over a lit horizon. */
      var TONE = P.dark ? ['#bcbcbc', '#606060', '#585858']
                        : ['#4a4a4a', '#aeaeae', '#b4b4b4'];
      var bins = [[], [], []];
      function lay(x, y, w, h) {
        if (!(w > 1 && h > 1) || w > W * 1.5) return;
        var k = h >= 46 ? 0 : h >= 30 ? 1 : 2;
        bins[k].push((x - pad) * qScale, (y + sy - pad * 0.7) * qScale,
                     (w + pad * 2) * qScale, (h + pad * 1.4) * qScale);
        n++;
      }
      for (i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest && el.closest('.vh')) continue;
        if (el.classList && el.classList.contains('vh')) continue;
        var rc = el.getBoundingClientRect();
        if (!(rc.width > 2 && rc.height > 2)) continue;
        if (rc.width > W * 1.5) continue;
        var boxes = null;
        if (rng) {
          try { rng.selectNodeContents(el); boxes = rng.getClientRects(); }
          catch (e1) { boxes = null; }
        }
        if (boxes && boxes.length) {
          for (var bi = 0; bi < boxes.length; bi++) {
            var q = boxes[bi];
            lay(q.left, q.top, q.width, q.height);
          }
        } else {
          lay(rc.left, rc.top, rc.width, rc.height);
        }
      }
      if (!n) { qWhy = 'failed: no text was found to keep quiet under'; return; }
      for (var bk = 0; bk < 3; bk++) {
        var bb = bins[bk];
        if (!bb.length) continue;
        g.fillStyle = TONE[bk];
        for (var bj = 0; bj < bb.length; bj += 4) g.fillRect(bb[bj], bb[bj + 1], bb[bj + 2], bb[bj + 3]);
      }
      /* one blur, once, at a quarter scale: a wash with no edge anywhere */
      var b = document.createElement('canvas');
      b.width = pw; b.height = phh;
      var bg = b.getContext('2d');
      if (!bg) { qWhy = 'failed: the quiet plate could not be blurred'; return; }
      var blurred = false;
      try {
        if (typeof bg.filter === 'string') { bg.filter = 'blur(7px)'; bg.drawImage(c, 0, 0); bg.filter = 'none'; blurred = true; }
      } catch (e2) { blurred = false; }
      if (!blurred) {
        /* no filter: one cheap spread of nine offset copies, which has no
           edge either — the point is a wash, not a rectangle */
        bg.globalAlpha = 1 / 9;
        for (var ox = -6; ox <= 6; ox += 3) for (var oy = -6; oy <= 6; oy += 3) bg.drawImage(c, ox * 0.6, oy * 0.6);
        bg.globalAlpha = 1;
      }
      qp = b; qctx = bg; qH = phh;
      qWhy = n + ' text blocks kept quiet' + (blurred ? '' : ' (spread, no blur filter here)');
    }

    /* ---- sizing --------------------------------------------- */
    function size() {
      var r = host.getBoundingClientRect();
      W = Math.max(280, Math.round(r.width || window.innerWidth));
      H = Math.max(360, Math.round(r.height || window.innerHeight));
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      /* PHONE TUNING IS GATED ON THE PICTURE, NOT THE WINDOW. A desktop
         window is never narrow by this test, so nothing here can move it. */
      narrow = (W / H) < 0.72;
      budget = W * H * dpr * dpr;
      HZ0 = narrow ? 0.700 : 0.780;
      NS = Math.round(clamp(W / 22, 28, 72));
      hzArr = new Float32Array(NS + 1);
      palette(); makeStars(); makeClouds(); makeSprites(); makeLands(); makeTown(); makeGrain();
      makeQuiet();
    }

    /* ---- the camera -----------------------------------------
       One pinhole, pitch only. Every number in the picture comes out of
       these six. */
    var km = 0.035, hzY = 0, f = 1, dip = 0, q = 0, sq = 0, cq = 1, cx = 0, cy = 0;
    var NS = 48, hzArr = null, hzX0 = 0, hzStep = 1, PAD = 0;
    var sunAz = 0.06, sunScrX = 0, sunScrY = 0, sunR = 10, arcH = 0;

    function fovAt(k) { return 0.873 + 0.42 * sstep(6, 560, k); }   // 50° → 74°

    function setCam(yScroll, maxScroll) {
      var u = clamp(yScroll / Math.max(1, maxScroll), 0, 1);
      km = kmAt(u);
      hzY = hzFracAt(u) * H + offAt(yScroll);
      cx = W * 0.5; cy = H * 0.5;
      f = (H * 0.5) / Math.tan(fovAt(km) * 0.5);
      dip = Math.acos(clamp(R_EARTH / (R_EARTH + km), -1, 1));
      q = dip - Math.atan((hzY - cy) / f);
      sq = Math.sin(q); cq = Math.cos(q);
      /* the sun keeps its bearing; the hour walks on a little as you
         climb, so it stays a sliver on the rim instead of rising again */
      sunAz = narrow ? 0.055 : 0.093;
      buildHorizon();
      arcH = Math.max(2.5, HZ0 * H * compressAt(km) * 0.30);
      /* THE SUN'S DISC SITS ON THE WATERLINE, half of it already under,
         exactly where the hero has it — and the hour walks on as the
         camera climbs, so it slides under and leaves the arc behind
         instead of rising again as a real sun at altitude would. */
      var sp = projSky(Math.sin(sunAz), -Math.sin(dip), Math.cos(sunAz));
      sunScrX = sp ? sp[0] : cx;
      sunR = Math.max(4, H * (narrow ? 0.048 : 0.056));
      sunScrY = hzAt(sunScrX) + sunR * (0.02 + 2.1 * sstep(0.4, 24, km));
    }

    var _p = [0, 0];
    function proj(x, y, z) {
      var dz = y * (-sq) + z * cq;
      if (dz <= 1e-7) return null;
      var du = y * cq + z * sq;
      _p[0] = cx + f * x / dz; _p[1] = cy - f * du / dz;
      return _p;
    }
    function projSky(x, y, z) { var r = proj(x, y, z); return r ? [r[0], r[1]] : null; }

    /* the horizon, sampled along its own azimuth and resampled to even
       screen columns: this array IS the curve, and every layer reads it */
    function buildHorizon() {
      PAD = W * 0.08;
      hzX0 = -PAD; hzStep = (W + PAD * 2) / NS;
      var cd = Math.cos(dip), sd = Math.sin(dip);
      var NA = 200, i, k = 0, prevX = -1e9, prevY = 0, got = 0;
      var targX = hzX0;
      for (i = 0; i <= NA; i++) {
        var az = -1.5 + 3.0 * (i / NA);
        var r = proj(Math.sin(az) * cd, -sd, Math.cos(az) * cd);
        if (!r) { continue; }
        var X = r[0], Y = r[1];
        if (got && X > prevX) {
          while (k <= NS && targX <= X) {
            var t = (targX - prevX) / Math.max(1e-6, X - prevX);
            hzArr[k] = prevY + (Y - prevY) * t;
            k++; targX = hzX0 + hzStep * k;
          }
        }
        prevX = X; prevY = Y; got = 1;
        if (k > NS) break;
      }
      while (k <= NS) { hzArr[k] = prevY; k++; }
    }
    function hzAt(x) {
      var t = (x - hzX0) / hzStep;
      if (t <= 0) return hzArr[0];
      if (t >= NS) return hzArr[NS];
      var i = t | 0, fr = t - i;
      return hzArr[i] + (hzArr[i + 1] - hzArr[i]) * fr;
    }

    /* is a point on (or over) the surface actually in sight, or is the
       bulge in the way? The segment camera→point must miss the sphere. */
    var EX = 0, EY = 0, EZ = 0, ER2 = 0;
    function setEarth() { EX = 0; EY = -(R_EARTH + km); EZ = 0; ER2 = R_EARTH * R_EARTH * 0.99999; }
    function seen(x, y, z) {
      var dd = x * x + y * y + z * z;
      if (dd < 1e-9) return true;
      var t = (EX * x + EY * y + EZ * z) / dd;
      if (t <= 0 || t >= 1) return true;
      var ax = EX - t * x, ay = EY - t * y, az2 = EZ - t * z;
      return (ax * ax + ay * ay + az2 * az2) >= ER2;
    }
    /* a point on the sphere: phi from the point under the camera, az
       around it, h km above the surface */
    var _s = [0, 0, 0];
    function surf(phi, az, h) {
      var rr = R_EARTH + h, sp = Math.sin(phi), cp = Math.cos(phi);
      _s[0] = rr * sp * Math.sin(az);
      _s[1] = rr * cp - (R_EARTH + km);
      _s[2] = rr * sp * Math.cos(az);
      return _s;
    }

    /* ---- painting ------------------------------------------- */

    function skyGradient() {
      var A = HZ0 * H * compressAt(km);         // the lit air, in screen px
      var sm = spaceAt(km);
      var space = mix(P.zenith, P.space, sm);
      var g = ctx.createLinearGradient(0, -H, 0, 0);
      var r = P.ramp, i;
      g.addColorStop(0, rgb(space));
      var topT = clamp(A / H, 0.02, 1);
      g.addColorStop(clamp(1 - topT, 0, 0.999), rgb(mix(skyAt(1), space, sm * 0.94)));
      for (i = r.length - 1; i >= 0; i--) {
        var off = clamp(1 - r[i][0] * topT, 0, 1);
        var c = r[i][1];
        /* above the fire the air empties out; the fire itself does not */
        c = mix(c, space, sm * 0.94 * sstep(0.02, 0.55, r[i][0]));
        g.addColorStop(off, rgb(c));
      }
      return g;
    }
    /* How deep the water's own ramp runs, in screen pixels. At sea level
       it is exactly the hero's: the 0.22 of the window under the
       waterline. It SHRINKS as the camera climbs, because a sea seen from
       above is foreshortened — the whole bright band the sky lays on it
       crowds into the rim, and everything under that is the dark. Tying
       it to the visible water instead stretched the magenta down the
       whole frame at 150 px, where the hero's is black by two thirds. */
    function seaSpan() { return Math.max(20, (1 - HZ0) * H * (1 - 0.74 * sstep(0.3, 26, km))); }

    function groundGradient() {
      var nm = nightAt(km);
      var vis = seaSpan();
      var g = ctx.createLinearGradient(0, 0, 0, H);
      var i;
      for (i = 0; i < SEA_STOPS.length; i++) {
        var v = SEA_STOPS[i][0];
        var c = seaAt(i);
        /* from up there the sea is the planet's night side, with the last
           of the air lying along the rim */
        var limb = mix(mix(P.magenta, P.indigo, 0.55), P.night, 0.55);
        var earth = mix(limb, P.night, sstep(0, 0.20, v));
        g.addColorStop(clamp(v * vis / H, 0, 1), rgb(mix(c, earth, nm)));
      }
      g.addColorStop(1, rgb(mix(P.deep, P.night, nm)));
      return g;
    }

    /* A STRIP IS SHEARED, NOT STEPPED. Offsetting each column by the
       horizon's height there is what puts the curve into a flat gradient
       for nothing — but offset alone leaves a staircase along the rim,
       and from orbit the rim is the hardest line in the picture (it was
       a flight of orange stairs at 585 km, measured). So each strip
       carries the LOCAL SLOPE as a shear: the ends of one strip land
       exactly where its neighbours' ends do, the gradient inside it
       stays vertical, and the curve is a curve. */
    /* and the strips TILE: each one starts and ends on a whole device
       column, so neighbours meet exactly. Overlapping them by a fraction
       of a pixel was enough to draw a ladder of faint vertical lines down
       the gold, because every layer with alpha in it was blended twice
       along the join. */
    var stripW = 1;
    function stripT(k) {
      var xu = hzX0 + hzStep * k;
      var xa = Math.round(xu * dpr) / dpr;
      var xb = Math.round((xu + hzStep) * dpr) / dpr;
      stripW = xb - xa;
      var y0 = hzArr[k], sl = (hzArr[k + 1] - y0) / hzStep;
      ctx.setTransform(dpr, dpr * sl, 0, dpr, 0, dpr * (y0 - sl * xu));
      return xa;
    }
    /* and each strip fills only the part of itself that is ON the screen:
       a full-height rectangle per strip painted the whole canvas twice
       over, which in software is most of a frame */
    function paintSky(g) {
      ctx.fillStyle = g;
      for (var k = 0; k < NS; k++) {
        var x0 = stripT(k), t = Math.max(hzArr[k], hzArr[k + 1]) + 3;
        if (t > 0) ctx.fillRect(x0, -t, stripW, t);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function paintGround(g) {
      ctx.fillStyle = g;
      for (var k = 0; k < NS; k++) {
        var x0 = stripT(k), b = H - Math.min(hzArr[k], hzArr[k + 1]) + 3;
        if (b > 0) ctx.fillRect(x0, 0, stripW, b);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function paintStars(clock) {
      if (stN < 1) return;
      var sm = spaceAt(km);
      /* the twilight hides all but the brightest of them from the water,
         and lets every one of them out once the air is gone */
      var base = (P.dark ? 1 : 0.16) * (0.13 + 1.55 * sstep(0.5, 34, km));
      if (base <= 0.012) return;
      /* the sphere turns: one revolution in about forty minutes, which is
         slower than anything else on the page and is meant to be */
      var a = clock * 0.0026;
      var ca = Math.cos(a), sa = Math.sin(a);
      var kx = SKY_AXIS[0], ky = SKY_AXIS[1], kz = SKY_AXIS[2];
      var C = 1 - ca;
      var m00 = ca + kx * kx * C, m01 = kx * ky * C - kz * sa, m02 = kx * kz * C + ky * sa;
      var m10 = ky * kx * C + kz * sa, m11 = ca + ky * ky * C, m12 = ky * kz * C - kx * sa;
      var m20 = kz * kx * C - ky * sa, m21 = kz * ky * C + kx * sa, m22 = ca + kz * kz * C;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgb(P.star);
      var i, tw = clock * 1.6;
      /* everything in front of the camera has dz above this; nothing
         behind it is worth another multiply */
      var cone = Math.cos(Math.atan(Math.sqrt(W * W + H * H) * 0.5 / f) + 0.06);
      for (i = 0; i < stN; i++) {
        var x0 = stX[i], y0 = stY[i], z0 = stZ[i];
        var y = m10 * x0 + m11 * y0 + m12 * z0;
        var z = m20 * x0 + m21 * y0 + m22 * z0;
        var dz = y * (-sq) + z * cq;
        if (dz < cone) continue;
        var x = m00 * x0 + m01 * y0 + m02 * z0;
        var px = cx + f * x / dz, py = cy - f * (y * cq + z * sq) / dz;
        if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
        var hy = hzAt(px);
        if (py > hy - 1) continue;                          // under the rim
        /* the air eats them near the horizon, and less of it does the
           higher you are: that alone reads as leaving the atmosphere */
        var above = (hy - py) / Math.max(30, hy);
        var ext = sstep(0, 0.30 * (1 - sm * 0.88), above);
        var al = stA[i] * base * (0.35 + 0.65 * ext);
        if (al < 0.016) continue;
        if (!stMW[i] && stR[i] > 1.4) al *= 0.86 + 0.14 * Math.sin(tw + i);
        if (al > 1) al = 1;
        var b = (al * (NB - 1)) | 0;
        var nn = bufN[b];
        if (nn >= bufX[b].length) continue;
        /* whole device pixels: a star on a half pixel is antialiased into
           four grey ones, which costs more and looks softer */
        bufX[b][nn] = Math.round(px * dpr) / dpr;
        bufY[b][nn] = Math.round(py * dpr) / dpr;
        bufR[b][nn] = Math.max(1 / dpr, Math.round(stR[i] * (1 + sm * 0.22) * dpr) / dpr);
        bufN[b] = nn + 1;
      }
      for (var b2 = 0; b2 < NB; b2++) {
        var cnt = bufN[b2];
        if (!cnt) continue;
        bufN[b2] = 0;
        ctx.globalAlpha = (b2 + 0.5) / NB;
        var bx = bufX[b2], by = bufY[b2], br = bufR[b2], j;
        for (j = 0; j < cnt; j++) ctx.fillRect(bx[j], by[j], br[j], br[j]);
      }
      ctx.globalAlpha = 1;
    }

    /* the sun and the fire it lays along the rim. No rays, no ring: the
       only reason it reads as a sun is that it is small and nothing near
       it is. */
    function paintSun() {
      var sm = spaceAt(km);
      var alive = 1 - sstep(6, 26, km);
      var sr = sunR;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var lift = P.dark ? 'lighter' : 'source-over';

      /* the light spread ALONG the rim: wide, very low, and it thins into
         the arc as the air does */
      ctx.globalCompositeOperation = lift;
      ctx.save();
      ctx.translate(sunScrX, hzAt(sunScrX));
      /* WIDE AND VERY LOW, which is the hero's own number (0.062 H) and
         not a fraction of the arc: tied to the arc it stood 283 px tall
         at sea level and laid a fluorescent strip across the waterline */
      ctx.scale(W * (0.62 - 0.30 * sm), Math.max(5, Math.min(H * 0.062, arcH * 0.55)));
      var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      fg.addColorStop(0, rgba(P.flare, 0.46 * P.k));
      fg.addColorStop(0.36, rgba(P.gold, 0.19 * P.k));
      fg.addColorStop(1, rgba(P.orange, 0));
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      ctx.restore();

      if (alive > 0.01) {
        ctx.save();
        ctx.translate(sunScrX, sunScrY);
        var ag = ctx.createRadialGradient(0, 0, sr * 0.5, 0, 0, sr * 4.6);
        ag.addColorStop(0, rgba(P.flare, 0.42 * alive * P.k));
        ag.addColorStop(1, rgba(P.gold, 0));
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(0, 0, sr * 4.6, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alive;
        var dg = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
        dg.addColorStop(0, rgb(mix(P.disc, P.flare, 0.10)));
        dg.addColorStop(0.72, rgb(mix(P.disc, P.gold, 0.42)));
        dg.addColorStop(1, rgba(mix(P.gold, P.orange, 0.5), 0.42));
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(0, 0, sr, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* the arc: the fire, hugging the curve, hot at the sun's bearing and
       going out towards the ends of it. At sea level it is the hero's
       fire spread across the whole horizon; from orbit it is a sliver. */
    function paintArc() {
      var sm = spaceAt(km);
      var hot = mix(P.gold, P.flare, 0.35);
      var cold = mix(P.magenta, P.indigo, 0.5);
      /* AT SEA LEVEL THE SKY RAMP IS ALREADY THE FIRE — the whole lowest
         quarter of it — so the arc has almost nothing to add and laying
         it on anyway blew the horizon out. It is the story only once the
         ramp has shrunk to a sliver and there is space above it. */
      var arcA = 0.13 + 0.87 * sm;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var gA = ctx.createLinearGradient(0, -arcH, 0, 0);
      gA.addColorStop(0, rgba(hot, 0));
      gA.addColorStop(0.42, rgba(hot, 0.18 * arcA));
      gA.addColorStop(0.86, rgba(hot, 0.50 * arcA));
      gA.addColorStop(1, rgba(hot, 0.62 * arcA));
      /* the air, seen edge on: one thin cold line over the fire, and it
         only exists once there is space above it to see it against */
      var air = 2 + arcH * 0.55;
      var gB = ctx.createLinearGradient(0, -arcH - air, 0, -arcH * 0.35);
      gB.addColorStop(0, rgba(P.air, 0));
      gB.addColorStop(0.55, rgba(P.air, 0.20 * sm));
      gB.addColorStop(1, rgba(P.air, 0));
      var k, x0;
      for (k = 0; k < NS; k++) {
        x0 = stripT(k);
        var xm = x0 + hzStep * 0.5;
        /* how far this column is from the sun, in screen widths */
        var d = Math.abs(xm - sunScrX) / Math.max(1, W * 0.62);
        var fall = Math.pow(clamp(1 - d * 0.74, 0, 1), 1.9);
        var a = (0.16 + 0.84 * fall) * P.k;
        ctx.globalAlpha = a;
        ctx.fillStyle = gA;
        ctx.fillRect(x0, -arcH, stripW, arcH);
        if (sm > 0.02) {
          ctx.globalAlpha = (0.45 + 0.55 * fall) * sm;
          ctx.fillStyle = gB;
          ctx.fillRect(x0, -arcH - air, stripW, air + arcH * 0.7);
        }
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* away from the sun the rim goes cold, not dark: one wash of the
         evening's own blue along the ends of the arc */
      var gC = ctx.createLinearGradient(0, 0, W, 0);
      gC.addColorStop(0, rgba(cold, 0.26 * P.k));
      gC.addColorStop(clamp(sunScrX / Math.max(1, W), 0.01, 0.99), rgba(cold, 0));
      gC.addColorStop(1, rgba(cold, 0.26 * P.k));
      ctx.fillStyle = gC;
      for (k = 0; k < NS; k++) { x0 = stripT(k); ctx.fillRect(x0, -arcH * 1.15, stripW, arcH * 1.15); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* THE TERMINATOR. The planet's own edge takes the last of the light on
       the sun's side and nothing at all away from it: it is the only thing
       that stops the night side reading as a hole cut out of the page. */
    function paintTerminator() {
      var sm = spaceAt(km);
      if (sm < 0.06) return;
      var deep = Math.max(16, seaSpan() * 1.55);
      var warm = mix(P.coral, P.orange, 0.45);
      var g = ctx.createLinearGradient(0, 0, 0, deep);
      g.addColorStop(0, rgba(warm, 0.52));
      g.addColorStop(0.22, rgba(mix(warm, P.magenta, 0.6), 0.20));
      g.addColorStop(0.60, rgba(P.magenta, 0.06));
      g.addColorStop(1, rgba(P.indigo, 0));
      ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
      for (var k = 0; k < NS; k++) {
        var x0 = stripT(k), xm = x0 + hzStep * 0.5;
        var d = Math.abs(xm - sunScrX) / Math.max(1, W * 0.70);
        var fall = Math.pow(clamp(1 - d * 0.82, 0, 1), 2.0);
        ctx.globalAlpha = fall * sm * P.k;
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, stripW, deep);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* THE AIRGLOW. A real thing a real camera records at the limb: a wide,
       very faint layer of light standing above the rim, uneven along its
       length, and the reason a night limb photographs as a layered edge
       rather than a line ruled on black. It is also what keeps the rows of
       sky above the rim from being identical all the way across. */
    var glowTbl = noiseTable(70707);
    function paintGlow(clock) {
      var sm = spaceAt(km);
      if (sm < 0.10) return;
      var hgt = arcH * 2.6 + 30 + H * 0.05 * sm;
      var col = mix(P.air, P.gold, 0.22);
      var g = ctx.createLinearGradient(0, -hgt, 0, 0);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.55, rgba(col, 0.055));
      g.addColorStop(0.88, rgba(col, 0.10));
      g.addColorStop(1, rgba(col, 0.045));
      ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
      for (var k = 0; k < NS; k++) {
        var x0 = stripT(k);
        /* uneven along its length, and it drifts: the layer is weather */
        var n = fbm((x0 / Math.max(80, W)) * 3.4 + clock * 0.006, glowTbl, 3);
        ctx.globalAlpha = sm * P.k * (0.38 + 1.15 * n);
        ctx.fillStyle = g;
        ctx.fillRect(x0, -hgt, stripW, hgt);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* THE RIM. From up there the hardest line in the picture is the one
       where the air stops and space starts. It is a hairline, it is the
       colour of the fire at the sun's bearing and of the last blue away
       from it, and without it the limb is a smudge. */
    function paintRim() {
      var sm = spaceAt(km);
      if (sm < 0.05) return;
      var hot = mix(P.flare, P.disc, 0.30), cold = mix(P.air, P.indigo, 0.45);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
      ctx.lineWidth = Math.max(1, 1.15 * (0.6 + 0.4 * sm));
      for (var k = 0; k < NS; k++) {
        var x0 = hzX0 + hzStep * k, xm = x0 + hzStep * 0.5;
        var d = Math.abs(xm - sunScrX) / Math.max(1, W * 0.66);
        var fall = Math.pow(clamp(1 - d * 0.70, 0, 1), 1.7);
        ctx.strokeStyle = rgba(mix(cold, hot, fall), (0.14 + 0.62 * fall) * sm * P.k);
        ctx.beginPath();
        ctx.moveTo(x0, hzArr[k] - 0.4);
        ctx.lineTo(x0 + hzStep + 0.4, hzArr[k + 1] - 0.4);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* the light on the water: one wide soft path from the sun at sea
       level, dying before it reaches the viewer; a small lens of fire on
       the ocean once the ocean is a long way down. */
    function paintGlint() {
      var low = 1 - sstep(1.2, 70, km);
      var vis = seaSpan() * 1.35;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
      var hy = hzAt(sunScrX);
      ctx.save();
      ctx.translate(sunScrX, hy);
      var wide = W * (0.075 + 0.105 * low), tall = vis * (0.10 + 0.62 * low);
      ctx.scale(wide, tall);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba(P.flare, (0.16 + 0.24 * low) * P.k));
      g.addColorStop(0.30, rgba(P.gold, 0.11 * P.k));
      g.addColorStop(0.68, rgba(P.orange, 0.04 * P.k));
      g.addColorStop(1, rgba(P.coral, 0));
      ctx.fillStyle = g;
      /* IT IS LIGHT ON THE WATER, so it starts at the waterline and goes
         down from there. Centred on the rim it put a 116 px dome of gold
         up into the sky above the horizon, which read as a hill. */
      ctx.beginPath(); ctx.arc(0, 0.985, 1, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* the coast. Top edge = whichever of the crest and the far side of
       the land stands highest and can be seen; bottom edge = the
       shoreline if the bulge is not in the way, and the rim if it is. */
    var _tx = null, _ty = null, _bx = null, _by = null;
    function paintLands() {
      var i, L, n;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var nm = nightAt(km);
      for (L = 0; L < lands.length; L++) {
        var la = lands[L];
        n = la.n;
        if (!_tx || _tx.length < n) {
          _tx = new Float32Array(n); _ty = new Float32Array(n);
          _bx = new Float32Array(n); _by = new Float32Array(n);
        }
        var cnt = 0;
        for (i = 0; i < n; i++) {
          var az = la.az[i];
          /* the crest, up in the air */
          var s1 = surf(la.cr[i], az, la.ht[i]);
          var vis1 = seen(s1[0], s1[1], s1[2]);
          var p1 = proj(s1[0], s1[1], s1[2]);
          if (!p1) continue;
          var tX = p1[0], tY = p1[1];
          /* the far side of it, flat: from height this is what draws the
             land, and from the water it is behind the bulge */
          var s3 = surf(la.fr[i], az, 0);
          if (seen(s3[0], s3[1], s3[2])) {
            var p3 = proj(s3[0], s3[1], s3[2]);
            if (p3 && p3[1] < tY) { tX = p3[0]; tY = p3[1]; }
          }
          if (!vis1 && !seen(s3[0], s3[1], s3[2])) {
            /* nothing of it clears the rim here: pin it to the rim so the
               shape closes without a hole */
            tY = hzAt(tX);
          }
          /* the shoreline */
          var s2 = surf(la.sh[i], az, 0);
          var p2 = proj(s2[0], s2[1], s2[2]);
          var bX = p2 ? p2[0] : tX, bY = p2 ? p2[1] : hzAt(tX);
          if (!p2 || !seen(s2[0], s2[1], s2[2])) { bX = tX; bY = hzAt(tX); }
          if (bY < hzAt(bX)) bY = hzAt(bX);
          if (tY > bY) tY = bY;
          _tx[cnt] = tX; _ty[cnt] = tY; _bx[cnt] = bX; _by[cnt] = bY; cnt++;
        }
        if (cnt < 3) continue;
        var col = mix(P.land, mix(P.indigo, P.night, 0.6), la.tone * (1 - nm * 0.5) + nm * 0.55);
        ctx.fillStyle = rgb(col);
        ctx.beginPath();
        ctx.moveTo(_tx[0], _ty[0]);
        for (i = 1; i < cnt; i++) ctx.lineTo(_tx[i], _ty[i]);
        for (i = cnt - 1; i >= 0; i--) ctx.lineTo(_bx[i], _by[i]);
        ctx.closePath();
        ctx.fill();
      }
    }

    function paintTown(clock) {
      if (!town) return;
      var on = sstep(0.35, 3.2, km) * (P.dark ? 1 : 0.30);
      if (on < 0.02) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgb(P.lamp);
      var i, t = town, px1 = 1 / dpr;
      var r = Math.max(px1, Math.round((1.5 - sstep(24, 320, km) * 0.5) * dpr) / dpr);
      var halo = sstep(30, 160, km);         // from up there a city is a smudge
      var hs = [];
      for (i = 0; i < t.n; i++) {
        var s = surf(t.phi[i], t.az[i], 0);
        if (!seen(s[0], s[1], s[2])) continue;
        var p = proj(s[0], s[1], s[2]);
        if (!p) continue;
        var px = p[0], py = p[1];
        if (px < -2 || px > W + 2 || py < -2 || py > H + 2) continue;
        if (py < hzAt(px)) continue;
        /* they come on one at a time, and they never stop trembling */
        var born = sstep(t.wm[i] * 0.85, t.wm[i] * 0.85 + 0.30, sstep(0.35, 9, km));
        var fl = 0.72 + 0.28 * Math.sin(clock * (0.6 + t.wm[i] * 1.5) + t.ph[i]);
        var a = t.a[i] * on * born * fl;
        if (a < 0.03) continue;
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.fillRect(Math.round(px * dpr) / dpr, Math.round(py * dpr) / dpr, r, r);
        if (halo > 0.05 && t.a[i] > 0.86) hs.push(px, py, a * halo);
      }
      ctx.globalAlpha = 1;
      /* the biggest of them carry a little of their own haze, which is the
         only way a city reads from orbit — a point of light does not */
      if (hs.length) {
        ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
        var hr = 3 + 5 * halo;
        var hg = ctx.createRadialGradient(0, 0, 0, 0, 0, hr);
        hg.addColorStop(0, rgba(P.lamp, 0.36));
        hg.addColorStop(0.42, rgba(P.lamp, 0.11));
        hg.addColorStop(1, rgba(P.lamp, 0));
        for (i = 0; i < hs.length; i += 3) {
          ctx.globalAlpha = hs[i + 2];
          ctx.save(); ctx.translate(hs[i], hs[i + 1]);
          ctx.fillStyle = hg;
          ctx.fillRect(-hr, -hr, hr * 2, hr * 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    /* the cloud, from under it and then from over it */
    function paintClouds(clock, below) {
      if (!clouds.length || !SPR.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var i, gone = sstep(320, 620, km);          // the high bands, lost in the depth
      for (i = 0; i < clouds.length; i++) {
        var c = clouds[i];
        var az = c.az + Math.sin(clock * 0.012 + c.ph) * 0.0022 + clock * 0.000055 * c.dz;
        var phi = c.phi * (1 + Math.sin(clock * 0.009 + c.ph * 1.7) * 0.0035);
        var s = surf(phi, az, c.alt);
        var p = proj(s[0], s[1], s[2]);
        if (!p) continue;
        var px = p[0], py = p[1];
        var hy = hzAt(px);
        var isBelow = py > hy;
        if (isBelow !== below) continue;
        var d = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
        var wpx = f * (c.len * 0.5 / Math.max(0.4, d));
        var hpx;
        if (isBelow) {
          /* looked DOWN on, a cloud is as wide as it is long and the
             picture squashes it: flat to the rim, round underfoot */
          var vis2 = Math.max(24, H - hy);
          hpx = wpx * clamp((py - hy) / (0.62 * vis2), 0.045, 0.9);
        } else {
          hpx = f * (c.thick * 0.5 / Math.max(0.4, d));
        }
        hpx = Math.max(0.8, hpx);
        if (wpx < 2.0) continue;
        if (wpx > W * 3.2) { hpx *= (W * 3.2) / wpx; wpx = W * 3.2; }
        if (px + wpx < -20 || px - wpx > W + 20 || py + hpx < -20 || py - hpx > H + 20) continue;
        /* over the rim or under it, the bulge is the bulge: a cloud far
           enough round the planet is behind it, and drawing it anyway put
           cloud in the sky that the sea was standing in front of */
        if (!seen(s[0], s[1], s[2])) continue;
        /* lit underneath while the sun is over you, on top once it is not */
        var lit = sstep(c.alt * 0.55, c.alt * 1.5, km);
        var a = c.a * (P.dark ? 1 : 0.55);
        /* the low deck only exists once there is height to see it from,
           and it is the one thing that is STILL there at six hundred
           kilometres: the bands thin out with the depth, the deck does
           not, because it is the surface you are looking down at */
        /* the deck comes in EARLY. It used to wait until seventy
           kilometres to be fully there, which left the whole stretch
           between thirty and a hundred — the count and the ones with
           users, two whole beats — looking down at a flat brown field
           with nothing on it. A planet always has weather on it. */
        if (c.deck) a *= sstep(4.5, 34, km); else a *= (1 - gone);
        if (a < 0.02) continue;
        /* the ones you are passing through soften and let go */
        /* 1.7 km, not 2.6: the bands live between three and thirteen
           kilometres, and a window that wide faded ALL of them out at
           once at eight — which is exactly the stop the page spends the
           commit river at, so the one beat that is meant to be spent
           among the clouds had none. You only pass through the one you
           are in. */
        a *= 1 - 0.75 * Math.exp(-Math.pow((km - c.alt) / 1.7, 2));
        if (a < 0.02) continue;
        /* AND A CLOUD THAT IS DOWN TO A HAIRLINE IS AIR. A band three
           hundred kilometres off is a thousand pixels long and less than
           one pixel deep: drawn at full strength that is not a cloud, it
           is a scratch ruled across the sky, and at a kilometre up there
           were a dozen of them. The far ones go out as they thin, which
           is also what the air between actually does to them. Fading them
           linearly from two pixels was not enough — at 1.3 km the upper sky
           still had a dozen faint scratches on it — so the fade runs on the
           SQUARE and starts at four. A cloud with real height on screen is
           untouched by this; only the ones already too thin to read go. */
        if (hpx < 4) { var hf = clamp(hpx / 4, 0, 1); a *= hf * hf; }
        if (a < 0.02) continue;
        var base = SPR[c.spr * 2], top = SPR[c.spr * 2 + 1];
        ctx.globalAlpha = a;
        if (base) ctx.drawImage(base, px - wpx, py - hpx, wpx * 2, hpx * 2);
        if (top && lit > 0.03) {
          ctx.globalAlpha = a * lit;
          ctx.drawImage(top, px - wpx, py - hpx, wpx * 2, hpx * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ---- a meteor, now and then -----------------------------
       In the sky while you are in the air with them; burning up BELOW
       you, over the deck, once you are not. */
    var MET = null, metNext = 6;
    function metGap() { return 7 + Math.random() * 11; }
    function spawnMeteor() {
      var below = km > 105;
      var x0, y0, ang, len;
      var hy = hzY;
      if (below) {
        var lo = hy + 6, hi = H - 10;
        if (hi - lo < 30) return false;
        x0 = W * (0.08 + Math.random() * 0.84);
        y0 = lo + Math.random() * (hi - lo) * 0.7;
        ang = (Math.random() * 0.7 - 0.35) + (Math.random() < 0.5 ? 0 : Math.PI);
        len = W * (0.06 + Math.random() * 0.11);
      } else {
        var top = 10, bot = hy - arcH * 1.8;
        if (bot - top < 60) return false;
        x0 = W * (0.05 + Math.random() * 0.9);
        y0 = top + Math.random() * (bot - top) * 0.72;
        ang = 1.05 + (Math.random() - 0.5) * 0.9;
        len = H * (0.10 + Math.random() * 0.20);
      }
      MET = { x: x0, y: y0, dx: Math.cos(ang), dy: Math.sin(ang), len: len, t: 0,
              life: 0.75 + Math.random() * 0.85, below: below, w: 1 + Math.random() * 0.9 };
      return true;
    }
    function metTick(dt) {
      if (reduced) return;
      if (MET) { MET.t += dt; if (MET.t >= MET.life) MET = null; return; }
      metNext -= dt;
      if (metNext <= 0) { metNext = metGap(); spawnMeteor(); }
    }
    function paintMeteor() {
      if (!MET) return;
      var m = MET, u = m.t / m.life;
      var travel = m.len * 1.55;
      var hx = m.x + m.dx * travel * u, hy = m.y + m.dy * travel * u;
      var tx = hx - m.dx * m.len, ty = hy - m.dy * m.len;
      var a = Math.sin(clamp(u, 0, 1) * Math.PI);
      a *= m.below ? 0.72 : 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
      var g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, rgba(P.coral, 0));
      g.addColorStop(0.55, rgba(mix(P.gold, P.star, 0.4), 0.26 * a));
      g.addColorStop(1, rgba(P.star, 0.92 * a));
      ctx.strokeStyle = g;
      ctx.lineWidth = m.w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---- the quiet, and the grain --------------------------- */
    function paintQuiet(sy) {
      if (!qp) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* the plate is black shapes. On ink that IS the wash. On paper the
         type is ink on a pale evening, so the same shapes are turned into
         cream with `color-dodge` — quiet there means LIGHTER. */
      ctx.globalCompositeOperation = P.dark ? 'multiply' : 'screen';
      ctx.globalAlpha = 1;
      ctx.drawImage(qp, 0, sy * qScale, qp.width, H * qScale, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    /* THE GRAIN IS FOR A FRAME YOU CAN LOOK AT. It is three per cent of an
       OVERLAY blend across the whole canvas — the single most expensive
       thing in a frame — and its whole job is to break the banding in a
       big smooth sky, which nobody can see while the sky is moving. So it
       is painted on the still frames only, and a quarter of the frame
       cost goes with the scroll. */
    function paintGrain() {
      if (!grain || movingNow) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = P.dark ? 0.030 : 0.020;
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---- one frame ------------------------------------------ */
    /* the page's own length, read on a timer and not on a frame: asking
       for scrollHeight inside a paint makes the browser lay the document
       out again, sixty times a second, for a number that changes twice */
    var maxS = 1, maxAt = -1e9;
    function refreshMax() {
      var dh = Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
      maxS = Math.max(1, (dh || H) - H);
      maxAt = performance.now();
    }
    function paint(yScroll, clock) {
      if (performance.now() - maxAt > 900) refreshMax();
      setCam(yScroll, maxS);
      setEarth();
      var gSky = skyGradient(), gGnd = groundGradient();
      paintSky(gSky);
      paintStars(clock);
      paintGlow(clock);
      paintSun();
      paintArc();
      paintClouds(clock, false);
      paintGround(gGnd);
      paintTerminator();
      paintGlint();
      paintLands();
      paintTown(clock);
      paintClouds(clock, true);
      paintRim();
      paintMeteor();
      paintQuiet(yScroll);
      paintGrain();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* ---- the loop -------------------------------------------
       The scroll is a TARGET; the camera eases towards it every frame, so
       a flick of the wheel is a camera move and not a cut. The loop runs
       while the camera is still catching up, and — the site's one allowed
       exception, the same one the hero takes for its swell — while the
       world is on screen and something in it is alive: the cloud drifts,
       the stars turn, the lights tremble, a meteor falls. It stops dead
       when the tab is hidden, when the hero's own canvas is covering it,
       and it never starts at all under reduced motion. */
    var raf = 0, tmr = 0, running = false, t0 = 0, tPrev = 0, clock = 0;
    var sPos = 0, sTarget = 0, frames = 0, cost = 0, worst = 0, rafs = 0;
    var covered = false, frozen = false, lastPaintY = -1e9, movingNow = false;
    var REST_MS = 52;                      // the living frame: 19 a second

    function target() { return window.scrollY || window.pageYOffset || 0; }

    function step(now) {
      raf = 0;
      if (killed || paused || lostCv) { running = false; return; }
      var f0 = performance.now();
      if (!t0) { t0 = now; tPrev = now; }
      var dt = Math.min(0.5, Math.max(0.001, (now - tPrev) / 1000));
      tPrev = now;
      if (!frozen) clock += dt;
      sTarget = target();
      var d = sTarget - sPos;
      /* the ease: fast scrolls arrive smoothly, slow ones feel welded */
      sPos += d * (1 - Math.pow(0.0000035, dt));
      if (Math.abs(d) < 0.4) sPos = sTarget;
      var moving = Math.abs(sTarget - sPos) >= 0.4;
      movingNow = moving;

      var c = 0;
      if (!covered) {
        paint(sPos, clock);
        lastPaintY = sPos;
        c = performance.now() - f0;
        frames++; cost += c; if (c > worst) worst = c;
      }
      publish(c);
      if (!frozen) metTick(dt);

      if (reduced) { running = false; return; }
      if (document.hidden || covered) { running = false; return; }
      if (moving) { rafs++; raf = requestAnimationFrame(step); return; }
      /* at rest the world is still alive, but on its own slow clock: the
         cloud drift, the turning sky and the trembling lights do not need
         sixty frames a second, and a meteor — which does — is over in a
         second and a half */
      tmr = setTimeout(function () { tmr = 0; rafs++; raf = requestAnimationFrame(step); }, MET ? 24 : REST_MS);
    }

    function wake() {
      if (killed || paused || reduced || lostCv) return;
      if (running) return;
      running = true;
      if (tmr) { clearTimeout(tmr); tmr = 0; }
      rafs++;
      raf = requestAnimationFrame(function (n) { tPrev = n; step(n); });
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (tmr) { clearTimeout(tmr); tmr = 0; }
    }

    /* ---- the readout ---------------------------------------- */
    function beat() {
      var k = km;
      if (k < 1.2) return 'on the bay';
      if (k < 6) return 'the bay dropping away';
      if (k < 13) return 'into the cloud bands';
      if (k < 26) return 'above the deck';
      if (k < 70) return 'the arc thinning, the curve beginning';
      if (k < 150) return 'the stratosphere, the town far below';
      if (k < 260) return 'the edge of space';
      if (k < 430) return 'the limb, meteors burning underneath';
      return 'space';
    }
    function kmText() {
      return km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km';
    }
    var lastSaid = '', ema = 0, msShown = 0, msAt = -1e9;
    /* built ONCE — a fresh object with a dozen closures in it, sixty times
       a second, is a garbage collector's idea of a frame budget */
    var KNOBS = {
      engine: '2D canvas', km: 0, hzY: 0, y: 0, target: 0, ms: 0, lastMs: 0, maxMs: 0,
      frames: 0, rafs: 0, covered: false, frozen: false, quiet: '', stars: 0, clouds: 0,
      freeze: function () { frozen = true; return true; },
      unfreeze: function () { frozen = false; wake(); return true; },
      setClock: function (v) { clock = +v || 0; repaintOnce(); return clock; },
      step: function (s) { clock += (+s || 0); repaintOnce(); return clock; },
      setY: function (y) { sPos = sTarget = +y || 0; repaintOnce(); return sPos; },
      snap: function () { sPos = target(); repaintOnce(); return sPos; },
      resetRafs: function () { rafs = 0; return 0; },
      repaint: function () { repaintOnce(); }
    };
    window.__scroll = KNOBS;
    function publish(ms) {
      KNOBS.km = +km.toFixed(2); KNOBS.hzY = Math.round(hzY);
      KNOBS.y = Math.round(sPos); KNOBS.target = Math.round(sTarget);
      KNOBS.ms = frames ? +(cost / frames).toFixed(2) : 0;
      KNOBS.lastMs = +(+ms || 0).toFixed(3); KNOBS.maxMs = +worst.toFixed(2);
      KNOBS.frames = frames; KNOBS.rafs = rafs; KNOBS.covered = covered;
      KNOBS.frozen = frozen; KNOBS.quiet = qWhy; KNOBS.stars = stN; KNOBS.clouds = clouds.length;
      /* the cost is a rolling average, refreshed four times a second: the
         lifetime mean never forgets the first cold frame, and a number
         that changes sixty times a second is a DOM write sixty times a
         second for a line nobody can read that fast */
      var c0 = +ms || 0;
      if (c0 > 0) ema = ema ? ema * 0.9 + c0 * 0.1 : c0;
      var nowP = performance.now();
      if (nowP - msAt > 400) { msAt = nowP; msShown = Math.round(ema * 10) / 10; }
      /* the knobs live on window.__scroll and always will; they are not
         something a visitor came here to read, so they are not printed.
         the reduced-motion line is BUILT here rather than overwriting the
         normal one afterwards, so a `failed: …` reason cannot be dropped
         on the way past */
      var s = reduced
        ? 'the ascent · 2D canvas · still frames, driven by the scroll only (reduced motion) · ' +
          kmText() + ' up · ' + beat() + ' · ' + msShown.toFixed(1) + ' ms a frame'
        : 'the ascent · 2D canvas · ' + kmText() + ' up · ' + beat() +
          ' · ' + msShown.toFixed(1) + ' ms a frame';
      if (qWhy.indexOf('failed') === 0) s += ' · ' + qWhy;
      if (s !== lastSaid) { lastSaid = s; say(s, qWhy.indexOf('failed') === 0); }
    }
    function repaintOnce() {
      if (killed || lostCv) return;
      movingNow = false;                 // a frame asked for by hand is a still one
      var f0 = performance.now();
      paint(sPos, clock);
      var c = performance.now() - f0;
      frames++; cost += c; if (c > worst) worst = c;
      publish(c);
    }

    /* ---- inputs --------------------------------------------- */
    var rmRaf = 0;
    function onScroll() {
      if (reduced) {
        /* still frames, driven by the scroll and nothing else — but one
           per animation frame, not one per scroll event */
        if (rmRaf) return;
        rmRaf = requestAnimationFrame(function () { rmRaf = 0; sPos = sTarget = target(); repaintOnce(); });
        return;
      }
      wake();
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    var rt = 0;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (killed) return;
        size(); sPos = sTarget = target(); repaintOnce(); wake();
      }, 180);
    }
    window.addEventListener('resize', onResize);
    function onTheme() {
      setTimeout(function () {
        if (killed) return;
        palette(); makeSprites(); makeGrain(); makeQuiet(); repaintOnce(); wake();
      }, 20);
    }
    document.addEventListener('inkthemechange', onTheme);
    function onVis() { if (document.hidden) stop(); else wake(); }
    document.addEventListener('visibilitychange', onVis);

    /* ---- go -------------------------------------------------- */
    size();
    sPos = sTarget = target();
    repaintOnce();
    if (!reduced) wake();

    return {
      failed: false,
      setCovered: function (v) {
        v = !!v;
        if (v === covered) return;
        covered = v;
        /* THE CAMERA DOES NOT EASE BEHIND A CLOSED CURTAIN. While the
           hero is opaque over this world the loop stops, so the camera
           stopped easing too and kept whatever altitude it had: jumping
           from the foot of the page to the top left it parked at eight
           kilometres, and the next hand-over played that fall on screen.
           There is nothing to see under the hero, so there is nothing to
           ease: it snaps, and it is always right when the curtain opens. */
        if (covered) { sPos = sTarget = target(); stop(); }
        else { repaintOnce(); wake(); }
      },
      relayout: function () { refreshMax(); makeQuiet(); repaintOnce(); },
      repaint: repaintOnce,
      pause: function () { paused = true; stop(); },
      resume: function () { paused = false; wake(); },
      destroy: function () {
        if (killed) return;
        killed = true; stop();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('inkthemechange', onTheme);
        document.removeEventListener('visibilitychange', onVis);
        try { host.removeChild(cvs); } catch (e) {}
      },
      canvas: cvs
    };
  }

  var current = null;
  window.Ascent = {
    mount: function (el, opts) { current = build(el, opts); return current; },
    get: function () { return current; }
  };
})();
