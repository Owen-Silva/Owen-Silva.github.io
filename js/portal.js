/* ============================================================
   portal.js — the role boundary drawn as a horizon.

   Four bands of night stacked toward the vanishing point. The
   nearest ground is the family; the furthest is the maintainer's
   console; each band's far edge is a vermilion horizon line, and
   what a role can reach is written on its own ground. Distance
   does the fading, so nothing needs a tab, a button or a frame.

   The names, the sentences and the lists are real text in
   portal.html — this file only paints the land beneath them. It
   measures the rows so every horizon lands exactly on the edge of
   the row it belongs to, runs once when the stage scrolls into
   view, and stops the moment it settles (no loop while idle). A
   still frame under reduced motion; a visible reason in the
   page's status line if the canvas cannot draw.

   The shared engine is optional: window.Ink (the status line) and
   window.InkScene (the camera) are used when they are there and
   the page is correct when they are not.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DUR = 1500;          /* the whole arrival, ms */
  var STAGGER = 0.13;      /* far band first, each one behind the last */
  var RISE = 18;           /* how far the land climbs into place, px */

  /* far -> near. amp is the crest's roughness: distance flattens it. */
  var CREST = [
    { amp: 8,  f: [1.7, 3.3, 5.6], p: [0.35, 2.10, 4.40], sky: 0.20 },
    { amp: 15, f: [1.3, 2.7, 4.6], p: [1.70, 0.60, 3.20], sky: 0.32 },
    { amp: 23, f: [1.0, 2.2, 3.7], p: [2.90, 4.20, 1.10], sky: 0.50 },
    { amp: 33, f: [0.7, 1.7, 3.1], p: [4.80, 2.40, 0.20], sky: 0.78 }
  ];
  /* how much of the far haze each ground carries: distance lightens it.
     The range is the world's own: no band of this scene is lighter than the
     furthest range js/page.js draws, and the nearest is darker than the
     ground, so these four read as ranges in front of that landscape and not
     as a second one. */
  var LIFT = [0.30, 0.185, 0.085, 0];

  function tok(name, fb) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    } catch (e) { return fb; }
  }
  function rgb(h, fb) {
    h = (h || '').trim();
    if (h.charAt(0) === '#') {
      if (h.length === 4) {
        return [parseInt(h.charAt(1) + h.charAt(1), 16),
                parseInt(h.charAt(2) + h.charAt(2), 16),
                parseInt(h.charAt(3) + h.charAt(3), 16)];
      }
      if (h.length >= 7) {
        return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      }
    }
    var m = h.match(/-?\d+(\.\d+)?/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return fb || [136, 136, 136];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function css(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }
  function lum(c) { return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

  function boot() {
    var stage = document.getElementById('hz-stage');
    var cvs = document.getElementById('hz-cv');
    if (!stage || !cvs) return;
    var rows = [].slice.call(stage.querySelectorAll('.pt-band'));
    if (!rows.length) return;

    /* the status line: shared when site.js is there, plain text when it is not */
    var note = document.getElementById('roles-state');
    var report = (window.Ink && window.Ink.reporter)
      ? window.Ink.reporter('roles-state')
      : function (msg, bad) {
          if (!note) return;
          note.textContent = String(msg);
          if (bad) note.setAttribute('data-bad', '1'); else note.removeAttribute('data-bad');
        };

    var ctx = null;
    try {
      ctx = cvs.getContext('2d');
      if (!ctx) throw new Error('2D context could not be created');
    } catch (e) {
      fail((e && e.message) || 'the canvas is unavailable');
      return;
    }
    cvs.addEventListener('contextlost', function (ev) {
      ev.preventDefault(); fail('the canvas context was lost');
    });

    function fail(why) {
      try { cvs.hidden = true; cvs.style.display = 'none'; } catch (e) {}
      stage.classList.remove('is-live');   /* the hairlines come back */
      report('the role horizon could not be drawn (' + why + '). Every role, ' +
             'what it reaches and the boundary between them are written out above.', true, 'horizon');
      window.__scenes = window.__scenes || {};
      window.__scenes.horizon = { settled: true, failed: true };
    }

    var W = 0, H = 0, dpr = 1, tops = [], bottom = 0, stars = [];
    var C = {};

    function palette() {
      var ground = rgb(tok('--ground', '#0A0F14'), [10, 15, 20]);
      var deep = rgb(tok('--ground-deep', '#06090C'), [6, 9, 12]);
      var paper = lum(ground) > 0.5;
      C.ground = ground;
      C.deep = deep;
      /* what the distance mixes toward: haze in the night, light on paper */
      C.far = paper
        ? [255, 255, 255]
        : mix(rgb(tok('--wash-c', '#1C2A32'), [28, 42, 50]),
              rgb(tok('--ink-faint', '#8A959B'), [138, 149, 155]), 0.35);
      C.haze = C.far;
      C.accent = rgb(tok('--accent', '#F0603A'), [240, 96, 58]);
      C.star = rgb(tok('--ink-hi', '#ECE5D7'), [236, 229, 215]);
      C.paper = paper;
    }

    function seedStars() {
      stars = [];
      if (!tops.length) return;
      var top = tops[0];
      if (top < 26) return;
      var n = Math.round(Math.min(30, Math.max(10, W / 52)));
      for (var i = 0; i < n; i++) {
        /* deterministic: the same sky every time the page is opened */
        var a = Math.sin(i * 12.9898) * 43758.5453;
        var b = Math.sin(i * 78.233 + 1.7) * 21421.7231;
        var c = Math.sin(i * 39.425 + 4.1) * 9271.113;
        stars.push({
          x: (a - Math.floor(a)) * W,
          y: 6 + (b - Math.floor(b)) * (top - 14),
          r: 0.5 + (c - Math.floor(c)) * 0.85,
          a: 0.16 + (a - Math.floor(a)) * 0.34
        });
      }
    }

    function measure() {
      var r = stage.getBoundingClientRect();
      W = Math.max(240, Math.round(r.width));
      H = Math.max(200, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      /* offsetTop, not a rect: the rows may be mid-entrance and a rect would
         report where a transform has put them, not where the row lives */
      tops = rows.map(function (el) {
        var y = 0, n = el;
        while (n && n !== stage) { y += n.offsetTop; n = n.offsetParent; }
        if (!n) y = Math.round(el.getBoundingClientRect().top - r.top);
        return Math.round(y);
      });
      bottom = H;
      palette();
      seedStars();
    }

    function crestAt(u, c) {
      var TAU = 6.2831853;
      var s = Math.sin(u * TAU * c.f[0] + c.p[0]) * 0.54
            + Math.sin(u * TAU * c.f[1] + c.p[1]) * 0.30
            + Math.sin(u * TAU * c.f[2] + c.p[2]) * 0.16;
      return (s * 0.5 + 0.5) * c.amp;      /* 0..amp, hanging below the line */
    }

    function paint(p) {
      ctx.clearRect(0, 0, W, H);
      var i, k;

      /* the sky above the furthest horizon is left alone: the world behind
         the page shows through it */
      for (i = 0; i < stars.length; i++) {
        var st = stars[i];
        ctx.globalAlpha = st.a * clamp01(p * 1.4);
        ctx.fillStyle = css(C.star, 1);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, 6.2831853);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      var span = 1 - STAGGER * (CREST.length - 1);
      for (k = 0; k < CREST.length && k < tops.length; k++) {
        var c = CREST[k];
        var t = clamp01((p - STAGGER * k) / span);
        if (t <= 0) continue;
        var e = ease(t);
        var y = tops[k] + (1 - e) * RISE;
        ctx.globalAlpha = e;

        /* the haze that gathers just above a horizon */
        var hz = Math.max(30, Math.min(96, (k === 0 ? 96 : (tops[k] - tops[k - 1]) * 0.55)));
        var gr = ctx.createLinearGradient(0, y - hz, 0, y);
        gr.addColorStop(0, css(C.haze, 0));
        gr.addColorStop(1, css(C.haze, (C.paper ? 0.42 : 0.20) * (1 - k * 0.18)));
        ctx.fillStyle = gr;
        ctx.fillRect(0, y - hz, W, hz);

        /* the ground: a crest hanging under the line, filled to the bottom.
           Nearer ground covers the base of everything behind it. */
        /* the crest of this range, riding the edge of the row it belongs to */
        var steps = Math.max(56, Math.round(W / 11));
        var half = c.amp * 0.5;
        var pts = [];
        for (i = 0; i <= steps; i++) {
          pts.push([(W * i) / steps, y + crestAt(i / steps, c) - half]);
        }

        /* flat, like a range of hills seen against the one behind it: the
           step at the crest is what reads as distance, not a gradient */
        ctx.fillStyle = css(k === CREST.length - 1
          ? mix(C.ground, C.deep, C.paper ? 0.28 : 0.55)
          : mix(C.ground, C.far, LIFT[k]), 1);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(W, bottom + 2);
        ctx.lineTo(0, bottom + 2);
        ctx.closePath();
        ctx.fill();

        /* the boundary itself: the vermilion light along the crest. The light
           falls off at both edges exactly as the world's own horizon does
           (js/scene.js), so this reads as light on a ridge and not as a line
           ruled across the page. A 3px pass under a 1px one — never a glow. */
        var la = c.sky * (C.paper ? 0.9 : 1);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        var rim = ctx.createLinearGradient(0, 0, W, 0);
        rim.addColorStop(0, css(C.accent, 0));
        rim.addColorStop(0.22, css(C.accent, la * 0.18));
        rim.addColorStop(0.68, css(C.accent, la * 0.13));
        rim.addColorStop(1, css(C.accent, 0));
        ctx.strokeStyle = rim;
        ctx.lineWidth = 3.4;
        ctx.stroke();
        var rim2 = ctx.createLinearGradient(0, 0, W, 0);
        rim2.addColorStop(0, css(C.accent, 0));
        rim2.addColorStop(0.22, css(C.accent, la));
        rim2.addColorStop(0.68, css(C.accent, la * 0.72));
        rim2.addColorStop(1, css(C.accent, 0));
        ctx.strokeStyle = rim2;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* ---- the one run, and the stop --------------------------- */
    var raf = 0, t0 = 0, started = false, done = false, visible = true;
    var frames = 0, total = 0;

    function settle(msg) {
      done = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      try { paint(1); } catch (e) { fail((e && e.message) || 'a frame failed'); return; }
      stage.classList.add('is-live');
      window.__scenes = window.__scenes || {};
      window.__scenes.horizon = {
        frames: frames, settled: true,
        avgMs: frames ? +(total / frames).toFixed(3) : 0
      };
      report(msg, false, 'horizon');
    }

    function step(now) {
      raf = 0;
      var f0 = (window.performance && performance.now) ? performance.now() : now;
      var t = Math.min(1, (now - t0) / DUR);
      try { paint(t); } catch (e) { fail((e && e.message) || 'a frame failed'); return; }
      stage.classList.add('is-live');
      frames++;
      total += ((window.performance && performance.now) ? performance.now() : now) - f0;
      if (t < 1) {
        if (!visible) return;                 /* left the screen: hold, do not loop */
        raf = requestAnimationFrame(step);
        return;
      }
      /* the success path says what it is and stops there — the frame cost
         stays on window.__scenes for a report. Every failure string below
         keeps its state AND its reason. */
      settle('the role horizon');
    }

    function run() {
      if (started || done) return;
      started = true;
      if (REDUCED) { settle('the role horizon · still frame (reduced motion)'); return; }
      t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      raf = requestAnimationFrame(step);
    }

    measure();

    if (REDUCED || !('IntersectionObserver' in window)) {
      run();
    } else {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) {
          if (!started) run();
          else if (!done && !raf) raf = requestAnimationFrame(step);
        } else if (started && !done) {
          settle('the role horizon');
        }
      }, { threshold: 0.08 }).observe(stage);
    }

    /* the rows move when the fonts land, when the page is resized and when
       the theme changes: re-measure, repaint once, never start a loop */
    function again() {
      measure();
      if (done) { try { paint(1); } catch (e) { fail((e && e.message) || 'a frame failed'); } }
    }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { setTimeout(again, 30); });
    }
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(again, 200);
    });
    document.addEventListener('inkthemechange', function () { setTimeout(again, 24); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
