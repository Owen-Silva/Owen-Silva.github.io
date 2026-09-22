/* ============================================================
   scene.js — two engines.

   1. window.Scene — the small engine every rendered SHOWPIECE on
      this site runs on: a 2D canvas capped at DPR 2, a static SVG
      layer for labels and hit targets, one run that starts when
      the scene scrolls into view, a loop that stops the moment the
      scene settles or leaves the screen, a reduced-motion still
      frame, a measured per-frame cost, and a visible reason
      whenever anything fails. A scene that WORKED says nothing:
      the frame cost is in window.__scenes, not on the page.
      opts.done is the one sentence a page may choose to leave in
      the status line once its scene has settled.

   2. window.InkScene — the CAMERA and the WORLD. One night stands
      behind all seven pages; the pages are places in it. Nothing
      here runs a loop while the visitor is still: the world is
      painted once per resize and moved with transforms, and the
      scroll driver shuts itself down as soon as the camera
      settles.

   ------------------------------------------------------------
   window.InkScene — the API the page lanes call
   ------------------------------------------------------------
   Read the camera
     InkScene.y()              → scroll position in px
     InkScene.progress()       → 0..1 down the document (smoothed)
     InkScene.rawProgress()    → 0..1, unsmoothed
     InkScene.vh() / .dh()     → viewport height / scrollable height
     InkScene.reduced          → true under prefers-reduced-motion
     InkScene.phone            → true under (max-width:600px) or coarse pointer

   Follow the camera
     var off = InkScene.onScroll(function (c) { ... });
         c = { y, progress, raw, vh, dh, dir }   dir is -1, 0 or 1.
         Fires once immediately, then on every rAF-coalesced scroll.
         Call off() to unsubscribe. No callback runs while idle.

   Move something with the camera
     InkScene.layer(el, depth, opts)
         depth  — how far the element travels, as a fraction of the
                  viewport height. 0.05 is far away, 0.3 is close.
         opts.mode  'page'     — travel is driven by document progress;
                                 the element is translated by
                                 depth * vh * reach * shape(progress).
                                 For fixed world layers.
                    'viewport' — (default) travel is driven by the
                                 element's own distance from the middle
                                 of the screen. For in-flow blocks.
         opts.axis  'y' (default) or 'x'
         opts.max   px clamp on the translation
         opts.shape { min, max, at(p) } — the travel curve, in units of
                    the amplitude. Default: the straight parallax this
                    engine has always used. The world's own layers use
                    SKY and GROUND (below).
         opts.reach cap on how much a long page multiplies the travel
                    (default 1: no scaling, exactly as before).
         opts.lean  fraction of vh the layer leans toward the pointer.
         returns { release(), amp(px) } — amp() pins the amplitude to the
                 one the caller sized its canvas for.

   The camera travels with the page
     A 12,000 px page used to move the world by the same 312 px a
     2,000 px page did, so a long page held one skyline for its whole
     length. The travel is now multiplied by how many screens the page
     is (capped per layer), and it has a SHAPE: the sky and its horizon
     drift down once, the ranges fall away — opening the space between
     the near land and the horizon — and then return for the last band,
     so every page closes on land. One ease for all of it, the same
     cubic-bezier(.62,.02,.20,1) the stylesheet calls --ease-ink-io.

   Hold something still while the page moves past it
     InkScene.pin(el, { top })   → native sticky inside el's own parent,
                                   so the parent's height IS the pin
                                   distance. Honours reduced motion.
     InkScene.unpin(el)

   Choreograph arrivals (see site.js for the vocabulary)
     InkScene.enter(rootOrSelector)  → claim and run [data-enter] inside
                                       content that was added after load.

   Easing — one family, used by every file in this engine
     InkScene.EASE = { ink, long, io }   InkScene.DUR = { fast, base, long }

   The world
     InkScene.world = { ok, reason, sky, layers[], repaint(), horizon() }
   ============================================================ */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__scenes = window.__scenes || {};

  function el(n, a) {
    var e = document.createElementNS(SVGNS, n);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    return e;
  }
  function text(parent, s, attrs) {
    var t = el('text', attrs);
    t.textContent = s;
    parent.appendChild(t);
    return t;
  }
  function why(e, fallback) {
    var r = '';
    if (e) r = (e.message || (typeof e === 'string' ? e : '') || e.name || '').trim();
    return r || fallback || 'no reason reported';
  }
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || '#888';
  }

  /**
   * opts: { host, canvas, svg, id, report, channel, label,
   *         duration, layout(g), frame(g, t), still(g), onSettle() }
   * `g` carries { ctx, W, H, svg, dpr, data }.
   */
  function make(opts) {
    var host = opts.host, cvs = opts.canvas, svg = opts.svg;
    var id = opts.id || 'scene';
    var report = opts.report || function () {};
    var chan = opts.channel || id;
    var dur = opts.duration || 2400;

    var ctx = null, failed = '';
    if (cvs) {
      try {
        ctx = cvs.getContext('2d');
        if (!ctx) throw new Error('2D context could not be created');
        cvs.addEventListener('contextlost', function (ev) {
          ev.preventDefault(); retire('the canvas context was lost');
        });
      } catch (e) { failed = why(e, 'canvas unavailable'); }
    }

    var g = { ctx: ctx, W: 0, H: 0, dpr: 1, svg: svg, data: opts.data || null, el: el, text: text, css: css };
    var started = false, running = false, done = false, raf = 0, t0 = 0, visible = true;
    var stats = { frames: 0, total: 0, max: 0 };

    function retire(reason) {
      ctx = null; g.ctx = null; running = false; done = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      try { if (cvs) { cvs.classList.remove('is-live'); cvs.hidden = true; cvs.style.display = 'none'; } } catch (e) {}
      report((opts.label || 'this scene') + ' could not draw (' + why(null, reason) +
             '). Everything it shows is written out beside it.', true, chan);
      window.__scenes[id] = { settled: true, failed: true };
    }

    function size() {
      var r = host.getBoundingClientRect();
      g.W = Math.max(240, Math.round(r.width));
      g.H = Math.max(160, Math.round(r.height));
      g.dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cvs && ctx) {
        cvs.width = Math.round(g.W * g.dpr);
        cvs.height = Math.round(g.H * g.dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(g.dpr, g.dpr);
      }
      if (svg) svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);
    }

    function clear() { if (ctx) ctx.clearRect(0, 0, g.W, g.H); }

    function relayout() {
      size();
      if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
      try { if (opts.layout) opts.layout(g); } catch (e) { retire(why(e, 'layout failed')); return false; }
      return true;
    }

    function still() {
      if (!ctx) return;
      try { clear(); if (opts.still) opts.still(g); cvs.classList.add('is-live'); }
      catch (e) { retire(why(e, 'the still frame failed')); }
    }

    function step(now) {
      raf = 0;
      var f0 = performance.now();
      var t = Math.min(1, (now - t0) / dur);
      var more;
      try { clear(); more = opts.frame ? opts.frame(g, t) : false; cvs.classList.add('is-live'); }
      catch (e) { retire(why(e, 'a frame failed')); return; }
      var c = performance.now() - f0;
      stats.frames++; stats.total += c; if (c > stats.max) stats.max = c;
      window.__scenes[id] = {
        frames: stats.frames, avgMs: +(stats.total / stats.frames).toFixed(3),
        maxMs: +stats.max.toFixed(3), settled: false
      };
      if (t < 1 || more) {
        if (!visible) { running = false; return; }
        raf = requestAnimationFrame(step);
        return;
      }
      running = false; done = true;
      still();
      window.__scenes[id] = {
        frames: stats.frames, avgMs: +(stats.total / stats.frames).toFixed(3),
        maxMs: +stats.max.toFixed(3), settled: true
      };
      /* A scene that worked has nothing to tell a visitor. The frame cost
         is still measured and still readable in window.__scenes; it just
         does not belong on the page. Every FAILURE keeps its reason. */
      report(opts.done || '', false, chan);
      if (opts.onSettle) opts.onSettle(g);
    }

    function run() {
      if (started || done) return;
      started = true;
      if (!ctx && cvs) { retire(failed || 'no drawing context'); return; }
      if (REDUCED) {
        still(); done = true;
        window.__scenes[id] = { settled: true, reduced: true };
        report((opts.label || 'scene') + ' · still frame (reduced motion)', false, chan);
        if (opts.onSettle) opts.onSettle(g);
        return;
      }
      t0 = performance.now(); running = true;
      raf = requestAnimationFrame(step);
    }

    /* a scene can be re-run by an interaction (a scrub, a pick) */
    function replay(ms) {
      if (!ctx) return;
      dur = ms || dur;
      done = false; started = true; t0 = performance.now();
      if (REDUCED) { still(); done = true; return; }
      if (!running && visible) { running = true; raf = requestAnimationFrame(step); }
    }

    /* draw one frame out of band, e.g. while a slider is dragged */
    function paint(t) {
      if (!ctx) return;
      try { clear(); if (opts.frame) opts.frame(g, Math.max(0, Math.min(1, t))); cvs.classList.add('is-live'); }
      catch (e) { retire(why(e, 'a frame failed')); }
    }

    window.__scenes[id] = { settled: false };
    if (!relayout()) return { run: function () {}, failed: true };

    if (REDUCED || !('IntersectionObserver' in window)) run();
    else {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) { if (!started) run(); else if (!done && !running) { running = true; raf = requestAnimationFrame(step); } }
        else if (started && !done) {
          // scrolled away mid-play: finish it rather than leave a half-drawn frame
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          running = false; done = true;
          still();
          window.__scenes[id] = {
            frames: stats.frames, avgMs: stats.frames ? +(stats.total / stats.frames).toFixed(3) : 0,
            maxMs: +stats.max.toFixed(3), settled: true
          };
          report(opts.done || '', false, chan);
          if (opts.onSettle) opts.onSettle(g);
        }
      }, { threshold: 0.12 }).observe(host);
    }

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (relayout() && done) still(); }, 160);
    });
    document.addEventListener('inkthemechange', function () {
      setTimeout(function () { if (relayout() && done) still(); }, 20);
    });

    return {
      run: run, replay: replay, paint: paint, relayout: relayout, still: still,
      g: g, stats: function () { return stats; },
      settled: function () { return done; }
    };
  }

  window.Scene = { make: make, el: el, text: text, css: css, why: why, REDUCED: REDUCED };
})();


/* ============================================================
   window.InkScene — the camera and the persistent night.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PHONE = matchMedia('(max-width: 600px), (pointer: coarse)').matches;

  /* the one easing family for this site — "ink" */
  var EASE = {
    ink:  'cubic-bezier(.22,.61,.24,1)',    // arrive and settle
    long: 'cubic-bezier(.16,.84,.26,1)',    // big camera moves
    io:   'cubic-bezier(.62,.02,.20,1)'     // in-out, for things that leave
  };
  var DUR = { fast: 320, base: 560, long: 860 };

  /* where the horizon sits, as a fraction of the viewport height */
  var HOR = PHONE ? 0.705 : 0.675;
  /* how far each layer travels over a whole page, as a fraction of vh */
  var R_SKY = 0.05, R_DEEP = PHONE ? 0.058 : 0.075,
      R_FAR = PHONE ? 0.08 : 0.105, R_NEAR = PHONE ? 0.14 : 0.195;
  /* the still the world holds under reduced motion */
  var STILL_P = 0.32;

  /* The one ease, solved in JS: --ease-ink-io, cubic-bezier(.62,.02,.20,1).
     The camera moves on the same curve the stylesheet uses, so the world
     and the type speak one language. Newton's method, six steps. */
  function bezier(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; }
    function B(a, b) { return 3 * b - 6 * a; }
    function C(a) { return 3 * a; }
    function at(t, a, b) { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function slope(t, a, b) { return 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a); }
    return function (x) {
      if (!(x > 0)) return 0;
      if (x >= 1) return 1;
      var t = x, i, d;
      for (i = 0; i < 6; i++) {
        d = slope(t, x1, x2);
        if (d < 1e-5) break;
        t -= (at(t, x1, x2) - x) / d;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      return at(t, y1, y2);
    };
  }
  var E = bezier(0.62, 0.02, 0.20, 1);

  /* ---- how far the camera travels on THIS page ----------------
     Every page used to move the world by the same 312 px, so a
     2,000 px page and a 12,000 px page held one skyline for their
     whole length. The travel now scales with how many screens the
     page actually is: a short page gets a small move, a long one a
     real descent, with the same shape and the same ease. */
  function screensOf() { return Math.max(1, cam.dh / Math.max(1, cam.vh)); }
  function reachFor(cap) {
    return Math.max(1, Math.min(cap || 1, 0.90 + 0.16 * screensOf()));
  }
  /* the caps are what the canvases can carry without growing absurd */
  var REACH = {
    sky:    PHONE ? 1.60 : 2.00,
    ground: PHONE ? 1.90 : 2.50,
    near:   PHONE ? 1.75 : 2.25
  };

  /* Where the descent turns round and the land comes back up under
     the camera, as a fraction of the page. It is held to about one
     screen of scroll, so a short page never slams it. */
  function turnPoint() {
    return Math.max(0.55, Math.min(0.86, 1 - 0.9 * cam.vh / Math.max(1, cam.dh)));
  }

  /* The three travel shapes. Each is { min, max, at(p) } in units
     of one layer's amplitude; min/max size the canvas that carries it.
       LINEAR — what any other lane gets: the old straight parallax.
       SKY    — one drift, from rest: the horizon and its vermilion
                band settle downward as the reader descends.
       GROUND — the ranges fall away, opening the space between the
                near land and the horizon, and then return for the
                last band so every page closes on land. */
  var LINEAR = { min: -1, max: 1, at: function (p) { return 2 * p - 1; } };
  var SKY = { min: 0, max: 1, at: function (p) { return E(p); } };
  var GROUND = {
    min: -1.15, max: 1,
    at: function (p) {
      var k = turnPoint();
      if (p <= k) return 2 * E(p / k) - 1;
      return 1 - 2.15 * E((p - k) / (1 - k));
    }
  };

  /* the world leans a little toward the pointer — never on a phone,
     never under reduced motion, and it settles in ~0.6 s */
  var FINE = matchMedia('(pointer: fine)').matches;
  var look = { x: 0, y: 0, tx: 0, ty: 0, on: false };

  var subs = [], layers = [];
  var raf = 0, pending = false;
  var cam = { y: 0, progress: 0, raw: 0, vh: 1, dh: 1, dir: 0 };
  var target = 0, lastY = 0;

  function metrics() {
    cam.vh = window.innerHeight || document.documentElement.clientHeight || 1;
    var d = document.documentElement;
    cam.dh = Math.max(1, (d.scrollHeight || 0) - cam.vh);
  }

  function readTarget() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    cam.dir = y === lastY ? 0 : (y > lastY ? 1 : -1);
    lastY = y;
    cam.y = y;
    metrics();
    target = Math.max(0, Math.min(1, y / cam.dh));
    cam.raw = target;
  }

  function ampOf(L) {
    return L.amp != null ? L.amp : L.depth * cam.vh * reachFor(L.reach);
  }

  function applyLayers() {
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i], t = 0, x = 0;
      if (L.mode === 'page') {
        t = ampOf(L) * L.shape.at(cam.progress);
        if (L.lean) { t += L.lean * look.y * cam.vh; x = L.lean * 1.6 * look.x * cam.vh; }
      } else {
        var r = L.el.getBoundingClientRect();
        if (r.bottom < -240 || r.top > cam.vh + 240) continue;   // off camera: leave it
        t = -((r.top + r.height / 2) - cam.vh / 2) * L.depth;
      }
      if (L.max) t = Math.max(-L.max, Math.min(L.max, t));
      t = Math.round(t * 100) / 100;
      x = Math.round(x * 100) / 100;
      if (t === L.last && x === L.lastX) continue;
      L.last = t; L.lastX = x;
      L.el.style.transform = L.axis === 'x'
        ? 'translate3d(' + t + 'px,0,0)'
        : 'translate3d(' + x + 'px,' + t + 'px,0)';
    }
  }

  function emit() {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](cam); } catch (e) { if (window.console) console.error('InkScene subscriber failed', e); }
    }
  }

  /* One driver. It is scheduled by a scroll or a resize, it eases the
     camera toward the real scroll position, and it STOPS as soon as the
     two agree — so an idle page runs zero animation frames. */
  function frame() {
    raf = 0; pending = false;
    var d = target - cam.progress;
    if (Math.abs(d) * cam.dh < 0.5) cam.progress = target;
    else cam.progress += d * 0.18;
    var moving = cam.progress !== target;
    if (look.on) {
      var dx = look.tx - look.x, dy = look.ty - look.y;
      if (Math.abs(dx) < 0.0015 && Math.abs(dy) < 0.0015) { look.x = look.tx; look.y = look.ty; }
      else { look.x += dx * 0.16; look.y += dy * 0.16; moving = true; }
    }
    applyLayers();
    emit();
    if (moving) schedule();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    raf = requestAnimationFrame(frame);
  }

  function onScrollEvent() { readTarget(); if (REDUCED) { cam.progress = target; } schedule(); }

  function onScroll(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    try { fn(cam); } catch (e) {}
    return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
  }

  function layer(elm, depth, opts) {
    if (!elm) return { release: function () {}, amp: function () {} };
    opts = opts || {};
    var L = {
      el: elm, depth: depth == null ? 0.1 : depth,
      mode: opts.mode || 'viewport', axis: opts.axis || 'y',
      max: opts.max || 0, last: null, lastX: null,
      shape: opts.shape || LINEAR, reach: opts.reach || 1,
      lean: opts.lean || 0, amp: null
    };
    function pose() {
      /* one still pose, then never again */
      if (L.mode !== 'page') return;
      var A = L.amp != null ? L.amp : L.depth * (window.innerHeight || 800) * reachFor(L.reach);
      elm.style.transform = 'translate3d(0,' +
        (Math.round(A * L.shape.at(STILL_P) * 100) / 100) + 'px,0)';
    }
    if (REDUCED) {
      pose();
      return {
        release: function () { elm.style.transform = ''; },
        amp: function (px) { L.amp = px; pose(); }
      };
    }
    elm.style.willChange = 'transform';
    layers.push(L);
    schedule();
    return {
      release: function () {
        var i = layers.indexOf(L); if (i >= 0) layers.splice(i, 1);
        elm.style.transform = ''; elm.style.willChange = '';
      },
      /* the world tells its layers the exact amplitude its canvases
         were sized for, so travel can never outrun the paint */
      amp: function (px) { L.amp = px; L.last = null; L.lastX = null; schedule(); }
    };
  }

  function pin(elm, opts) {
    if (!elm || REDUCED) return;
    opts = opts || {};
    if (elm.__pinPrev == null) elm.__pinPrev = elm.style.position + '|' + elm.style.top;
    elm.style.position = 'sticky';
    elm.style.top = (opts.top == null ? 0 : opts.top) + 'px';
    elm.setAttribute('data-pinned', '1');
  }
  function unpin(elm) {
    if (!elm || elm.__pinPrev == null) return;
    var p = elm.__pinPrev.split('|');
    elm.style.position = p[0]; elm.style.top = p[1];
    elm.__pinPrev = null;
    elm.removeAttribute('data-pinned');
  }

  /* ---------------------------------------------------------
     the world: sky (WebGL), two ridges (2D canvas), one CSS
     horizon underneath them both. Each stage is independent, so
     losing WebGL costs detail and never the horizon.
     --------------------------------------------------------- */
  var world = {
    ok: false, reason: '', sky: null, host: null, layers: [], extras: [],
    repaint: function () {}, horizon: function () { return HOR; },
    /* a page may add one more plane of distance behind the others */
    ridge: function () { return null; },
    /* the painting kit, so an extra plane looks like it belongs */
    paintRidge: function (cv, o) { return paintRidge(cv, o); },
    hex: function (n, f) { return hex(n, f); },
    mix: function (a, b, t) { return mix(a, b, t); },
    /* the one ramp: 0 = the near plane, 1 = the furthest (see ONE NIGHT) */
    crestTone: function (d) { return crestTone(d); },
    footTone: function (d) { return footTone(d); },
    rgba: function (c, a) { return rgba(c, a); },
    isDark: function () { return isDark(); }
  };

  function hex(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb || '#101010';
  }
  function rgb(str) {
    str = (str || '').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m) { var v = parseInt(m[1], 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
    m = /rgba?\(([^)]+)\)/i.exec(str);
    if (m) { var p = m[1].split(/[\s,\/]+/).map(parseFloat); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    return [16, 16, 16];
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
                    Math.round(x[1] + (y[1] - x[1]) * t) + ',' +
                    Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function rgba(c, a) { var x = rgb(c); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  function isDark() { var a = rgb(hex('--wash-a')); return (a[0] + a[1] + a[2]) / 3 < 128; }

  /* ---- ONE NIGHT --------------------------------------------
     The same five numbers are written into js/world.js, which paints
     index's hero. Before this, the hero's ranges were near-black and
     neutral while every other page's were steel blue, so a visitor
     going from the front page to about walked into a different place.

     `d` is distance: 0 at the near plane, 1 at the furthest. The near
     plane is the darkest and almost neutral — there is no air in front
     of it — and each plane further away lifts and goes bluer, because
     there is more night between it and the reader. That is the whole
     ramp; nothing else in either file may invent a range colour.

       crest = mix(NEAR, FAR, 0.06 + 0.72 * d^0.9)
       foot  = mix(NEAR, FAR, 0.02 + 0.34 * d)

     Change it HERE AND IN world.js, or the site stops being one night. */
  function nightNear() {
    return isDark() ? mix(hex('--ground-deep'), '#000000', 0.55)
                    : mix(hex('--rule-strong'), hex('--ink-low'), 0.54);
  }
  function nightFar() {
    return isDark() ? hex('--wash-c')
                    : mix(hex('--rule-strong'), hex('--ink-low'), 0.10);
  }
  function crestTone(d) { return mix(nightNear(), nightFar(), 0.06 + 0.72 * Math.pow(d, 0.9)); }
  function footTone(d) { return mix(nightNear(), nightFar(), 0.02 + 0.34 * d); }

  /* a deterministic ridgeline: a few decaying harmonics, no noise texture */
  function crest(seed, terms) {
    var s = seed, A = [], F = [], P = [], norm = 0, i;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (i = 0; i < terms; i++) {
      var a = Math.pow(0.56, i) * (0.75 + 0.5 * rnd());
      A.push(a); F.push(Math.PI * (0.9 + 1.4 * rnd()) * Math.pow(2.04, i)); P.push(rnd() * 6.283);
      norm += a;
    }
    return function (x) {
      var v = 0;
      for (var k = 0; k < terms; k++) v += A[k] * Math.sin(x * F[k] + P[k]);
      return v / norm;
    };
  }

  /* ---- one light, one place ---------------------------------
     The dawn is a PLACE on the horizon, not a stripe across the page: it
     gathers over one stretch of the world, fades, and comes back weaker
     further along. Everything that takes the light — the sky's gather, the
     lit edge, both ranges' crests — is lit by THIS distribution, so a screen
     never shows two light sources; and a light broken into two stretches
     cannot lay a full-width warm row through a paragraph (QA-4 D1). */
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

  /* the distribution as a mask: gain(u) is what the light does at u */
  function lightMask(n, gain) {
    var s = [], i, u;
    for (i = 0; i <= n; i++) {
      u = i / n;
      s.push('rgba(0,0,0,' + gain(u).toFixed(3) + ') ' + (u * 100).toFixed(2) + '%');
    }
    return 'linear-gradient(90deg,' + s.join(',') + ')';
  }

  function paintRidge(cv, o) {
    var ctx;
    try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return false;
    var W = cv.clientWidth || cv.offsetWidth, H = cv.clientHeight || cv.offsetHeight;
    if (W < 2 || H < 2) return false;
    var dpr = Math.min(PHONE ? 1.75 : 2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var f = crest(o.seed, o.terms);
    var base = o.base, amp = o.amp;
    var step = Math.max(3, Math.round(W / 320));
    var x, yv;

    /* The crest, written once. EVERY pass below is cut against it, so the
       world ends on a silhouette and never on a row: the old haze was a
       rectangle whose bottom edge ran flat across the whole viewport, and
       on four pages that edge crossed body text mid-sentence (QA-3 D5).
       A fill that is clipped to one side of the ridge has no edge of its
       own — the ridge is the edge. */
    function cut(land) {
      ctx.beginPath();
      ctx.moveTo(-2, land ? H + 2 : -H - 2);
      for (x = -2; x <= W + 2; x += step) ctx.lineTo(x, base + f(x / W) * amp);
      ctx.lineTo(W + 2, land ? H + 2 : -H - 2);
      ctx.closePath();
    }

    /* atmosphere gathering above the crest, cut off BY the crest. The rect
       runs to the bottom of the canvas and the gradient holds its last
       colour, so there is nothing below it for an edge to form on. */
    ctx.save();
    cut(false);
    ctx.clip();
    var hz = ctx.createLinearGradient(0, base - amp - o.haze, 0, base + amp * 0.4);
    hz.addColorStop(0, rgba(o.hazeColor, 0));
    hz.addColorStop(1, rgba(o.hazeColor, o.hazeAlpha));
    ctx.fillStyle = hz;
    ctx.fillRect(0, base - amp - o.haze, W, H - (base - amp - o.haze) + 4);
    ctx.restore();

    /* the land itself */
    cut(true);
    var fg = ctx.createLinearGradient(0, base - amp, 0, H);
    fg.addColorStop(0, o.fillTop);
    fg.addColorStop(1, o.fillBottom);
    ctx.fillStyle = fg;
    ctx.fill();

    /* The range that stands IN the horizon catches its light: the high
       crests take it, the valleys stay dark, because the light comes from
       the far edge of the world and not from a lamp above the page. It is
       clipped to the land, so again it ends on the silhouette. */
    if (o.rimGlow > 0) {
      ctx.save();
      cut(true);
      ctx.clip();
      var gl = ctx.createLinearGradient(0, base - amp, 0, base + amp * 0.55 + (o.rimFall || 0));
      gl.addColorStop(0, rgba(o.rim, o.rimGlow));
      gl.addColorStop(1, rgba(o.rim, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(0, base - amp - 2, W, amp * 2 + (o.rimFall || 0) + 4);
      ctx.restore();
    }

    /* the crest line itself — the only place vermilion is drawn on the
       land. The light falls off at both edges, so it reads as light on a
       ridge rather than a rule across the page. */
    ctx.beginPath();
    for (x = -2; x <= W + 2; x += step) {
      yv = base + f(x / W) * amp;
      if (x < 0) ctx.moveTo(x, yv); else ctx.lineTo(x, yv);
    }
    var rg = ctx.createLinearGradient(0, 0, W, 0);
    if (o.rimLight) {
      /* Lit by the dawn, in the dawn's places, and only where this range
         stands highest — the same rule the dawn's own edge is masked by, so
         two ranges on one screen read as one light falling on both. */
      var N = 48, lo = 1e9, hi = -1e9, vals = [], si, uu, hh;
      for (si = 0; si <= N; si++) { uu = f(si / N); vals.push(uu); if (uu < lo) lo = uu; if (uu > hi) hi = uu; }
      for (si = 0; si <= N; si++) {
        hh = hi === lo ? 1 : (hi - vals[si]) / (hi - lo);        // 1 at the crest's peaks
        rg.addColorStop(si / N, rgba(o.rim, o.rimAlpha * lightAt(si / N) *
          (0.05 + 0.95 * Math.pow(hh, 1.7))));
      }
    } else if (o.rimStops) {
      /* the shared distribution: this crest is lit by the same dawn */
      for (var sj = 0; sj < o.rimStops.length; sj++) {
        rg.addColorStop(o.rimStops[sj][0], rgba(o.rim, o.rimAlpha * o.rimStops[sj][1]));
      }
    } else {
      rg.addColorStop(0, rgba(o.rim, 0));
      rg.addColorStop(0.22, rgba(o.rim, o.rimAlpha));
      rg.addColorStop(0.68, rgba(o.rim, o.rimAlpha * 0.72));
      rg.addColorStop(1, rgba(o.rim, 0));
    }
    ctx.lineWidth = o.rimWidth || 1;
    ctx.strokeStyle = rg;
    ctx.stroke();

    /* On paper the land has to dissolve back into the sheet below its crest,
       the way a wash runs out of pigment — otherwise dark type ends up sitting
       on a grey hill. On ink there is nothing to dissolve into. */
    if (o.fadeColor && o.fadeAlpha > 0) {
      var fd = ctx.createLinearGradient(0, base - amp, 0, H);
      fd.addColorStop(0, rgba(o.fadeColor, 0));
      fd.addColorStop(1, rgba(o.fadeColor, o.fadeAlpha));
      ctx.fillStyle = fd;
      ctx.fillRect(0, base - amp, W, H - (base - amp));
    }
    return true;
  }

  function mountWorld() {
    var sky = document.getElementById('page-wash');
    if (!sky) return;                       // no host on this page: no world to mount

    /* The host may be a canvas (every page declares one) or a plain div a
       page lane put there. If it is a div, the sky is painted into a canvas
       that fills it, and the div stays the box the camera moves. */
    var skyCanvas = sky;
    if (sky.tagName !== 'CANVAS') {
      skyCanvas = sky.querySelector('canvas');
      if (!skyCanvas) {
        skyCanvas = document.createElement('canvas');
        skyCanvas.setAttribute('aria-hidden', 'true');
        skyCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
        sky.appendChild(skyCanvas);
      }
      sky.style.position = 'fixed';
      sky.style.left = '0'; sky.style.width = '100%';
      sky.style.pointerEvents = 'none';
    }

    var report = null, ids = ['wash-state', 'reg-state', 'lab-state', 'about-state',
                              'map-state', 'pipe-state', 'roles-state', 'rounds-state',
                              'graph-state', 'life-state', 'scene-state', 'river-state'];
    for (var i = 0; i < ids.length && !report; i++) {
      if (document.getElementById(ids[i]) && window.Ink) report = window.Ink.reporter(ids[i]);
    }
    report = report || function () {};

    /* site.js mounts the host and the CSS horizon before the first frame, so
       an arriving page is never flat ink waiting for this file (QA-4 D3).
       Adopt them; build them only if that pass did not run. */
    var host = document.querySelector('.ink-world');
    var line = host ? host.querySelector('.ink-world__line') : null;
    if (!host) {
      host = document.createElement('div');
      host.className = 'ink-world';
      host.setAttribute('aria-hidden', 'true');
      /* inline, at creation: the layout must never depend on whether site.js's
         stylesheet has been injected yet, or this div lands in the flow and
         pushes the nav down */
      host.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;contain:paint;';
      sky.parentNode.insertBefore(host, sky);
      host.appendChild(sky);                     // the sky becomes the back of the world
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'ink-world__line';        // pure CSS: survives with no canvas at all
      line.style.cssText = 'position:fixed;left:0;width:100%;height:0;';
      host.insertBefore(line, host.firstChild);
    }

    var RIDGE_CSS = 'position:fixed;left:0;width:100%;display:block;pointer-events:none;';

    /* ---- the lit horizon --------------------------------------
       QA-3 D4: the one accent the brief reserves for the horizon was
       fainter than the nav's current mark on four pages out of seven,
       and on every page it was gone after the first screen. This is the
       edge itself, at the width of the page: a gradient on a div, so it
       costs no canvas and no repaint, riding on the SKY layer with the
       sky's own warm band and with the CSS hairline underneath — one
       horizon, three ways of drawing it, always the same line. */
    var dawn = document.createElement('div');
    dawn.className = 'ink-world__dawn';
    dawn.style.cssText = RIDGE_CSS + 'opacity:1;' +
      'transition:opacity ' + DUR.long + 'ms ' + EASE.io + ';';
    /* The lit edge: the furthest range of all, the one that is only there
       because it takes the light. A clip-path ribbon, so it stays CSS like
       the rest of the dawn (no canvas, and it survives with WebGL off) and
       follows a crest instead of ruling a line across the page. The blur
       rides the WRAPPER: filter is applied before clip-path, so a shadow on
       the clipped element would be cut away with it. */
    var INSET = 'position:absolute;left:0;top:0;right:0;bottom:0;';
    /* the land that crest belongs to, cut on the same curve: without it the
       lit edge is a wire in an empty sky on the mid-page screens, where the
       three painted ranges have travelled out of frame */
    var land = document.createElement('div');
    land.className = 'ink-world__far';
    land.style.cssText = INSET;
    var gather = document.createElement('div');     // the sky's own light
    gather.className = 'ink-world__gather';
    gather.style.cssText = INSET;
    var edge = document.createElement('div');
    edge.className = 'ink-world__edge';
    edge.style.cssText = INSET + 'pointer-events:none;';
    var edgeCut = document.createElement('div');
    edgeCut.className = 'ink-world__edge-cut';
    edgeCut.style.cssText = INSET;
    edge.appendChild(edgeCut);
    dawn.appendChild(land);
    dawn.appendChild(gather);
    dawn.appendChild(edge);
    host.appendChild(dawn);                      // over the sky, under the land

    var far = document.createElement('canvas');
    far.className = 'ink-world__ridge ink-world__ridge--far';
    far.style.cssText = RIDGE_CSS;
    var near = document.createElement('canvas');
    near.className = 'ink-world__ridge ink-world__ridge--near';
    near.style.cssText = RIDGE_CSS;
    host.appendChild(far);
    host.appendChild(near);

    world.sky = skyCanvas;
    world.host = host;
    world.layers = [far, near];

    /* every layer the camera drives, with the shape and the depth it
       travels on; place() sizes each canvas for exactly that travel */
    var LEAN = { sky: 0.006, deep: 0.008, far: 0.012, near: 0.018 };

    /* the two standard ranges. `r` is half the plane's whole travel, so
       `2*r` cancels the canvas's own overhang and the crest lands on the
       horizon minus its own drop on the first screen, at any page length. */
    /* the middle plane, d = 0.52 on the ONE NIGHT ramp: the range that
       stands in the horizon, and the only one that takes its light */
    function farOpts(H, r, dark) {
      return {
        seed: 1471, terms: 5,
        base: HOR * H + 2 * r - (PHONE ? 0.012 : 0.018) * H,
        amp: (PHONE ? 0.050 : 0.042) * H,
        haze: 0.14 * H,
        hazeColor: hex('--wash-c'), hazeAlpha: dark ? 0.34 : 0.22,
        fillTop: crestTone(0.52), fillBottom: footTone(0.52),
        fadeColor: dark ? null : hex('--ground'), fadeAlpha: dark ? 0 : 0.78,
        /* QA-4 D15: one horizon, one way of drawing it. This range takes the
           dawn's light exactly as the dawn's own crest does. */
        rim: hex('--accent'), rimAlpha: dark ? 0.74 : 0.34,
        rimLight: true,
        rimWidth: dark ? 1.5 : 1,
        /* the wash under the crest stays under the warm threshold on its own:
           it is the colour the light leaves on the land, not a second edge */
        rimGlow: dark ? 0.26 : 0.14, rimFall: 0.020 * H
      };
    }
    /* the near plane, d = 0: the darkest thing on the page, and what a
       huge cream name stands against */
    function nearOpts(H, r, dark) {
      return {
        seed: 90211, terms: 6,
        base: HOR * H + 2 * r + (PHONE ? 0.090 : 0.075) * H,
        amp: (PHONE ? 0.062 : 0.055) * H,
        haze: 0.10 * H,
        hazeColor: hex('--wash-b'), hazeAlpha: dark ? 0.26 : 0.16,
        fillTop: crestTone(0), fillBottom: footTone(0),
        fadeColor: dark ? null : hex('--ground'), fadeAlpha: dark ? 0 : 0.90,
        rim: dark ? hex('--wash-c') : hex('--ink-low'), rimAlpha: dark ? 0.16 : 0.12
      };
    }

    var geomDh = 0;
    var moved = [
      { el: sky,  depth: R_SKY,  shape: SKY,    reach: REACH.sky,    lean: LEAN.sky },
      /* the horizon rides with the sky, so the hairline and the painted
         band it belongs to are never two different horizons; it is a
         0-height rule, so it is moved but never re-sized */
      { el: line, depth: R_SKY,  shape: SKY,    reach: REACH.sky,    lean: LEAN.sky, box: false },
      /* the lit edge rides the same layer as the hairline and the sky's
         own band: three drawings of one horizon, never two horizons */
      { el: dawn, depth: R_SKY,  shape: SKY,    reach: REACH.sky,    lean: LEAN.sky, box: false },
      { el: far,  depth: R_FAR,  shape: GROUND, reach: REACH.ground, lean: LEAN.far,  optsFn: farOpts },
      { el: near, depth: R_NEAR, shape: GROUND, reach: REACH.near,   lean: LEAN.near, optsFn: nearOpts }
    ];

    /**
     * world.ridge(name, depth, opts(H, r, dark) -> paintRidge options)
     * Adds one more plane of landscape BEHIND the two standard ones and
     * keeps it painted and parallaxed with them. `r` is half this plane's
     * total travel, so a painter that writes `base: horizon + 2*r - kH`
     * lands its crest at `horizon - kH` on the first screen whatever the
     * page's length. Returns the canvas.
     */
    world.ridge = function (name, depth, optsFn) {
      if (host.querySelector('.ink-world__ridge--' + name)) return null;   // once
      var cv = document.createElement('canvas');
      cv.className = 'ink-world__ridge ink-world__ridge--' + name;
      cv.style.cssText = RIDGE_CSS;
      host.insertBefore(cv, far);
      var rec = { el: cv, depth: depth, optsFn: optsFn,
                  shape: GROUND, reach: REACH.ground, lean: LEAN.deep };
      world.extras.push(rec);
      moved.push(rec);
      rec.handle = layer(cv, depth, { mode: 'page', shape: GROUND,
                                      reach: REACH.ground, lean: LEAN.deep });
      if (!placeOne(rec, window.innerHeight || 800, true)) cv.style.display = 'none';
      return cv;
    };

    /* A parallel lane may build a richer world, but it only takes the
       GROUND over if it says so in as many words (InkWorld.ground === true).
       index's hero owns an InkWorld of its own: mounting a second one here
       would steal the hero's instance AND leave this page's ranges unpainted,
       which is exactly what it did. */
    var external = null;
    if (window.InkWorld && window.InkWorld.ground === true &&
        typeof window.InkWorld.mount === 'function') {
      try {
        external = window.InkWorld.mount(host, { reduced: REDUCED, phone: PHONE, horizon: HOR }) || true;
      } catch (e) {
        external = null;
        report('the world layer fell back to its own night (' +
               (e && e.message ? e.message : 'InkWorld.mount failed') + ').', true, 'world');
      }
    }

    /* The travel is the canvas's own geometry: a layer of amplitude A on a
       shape spanning [min,max] is hung at -A*max and made H + A*(max-min)
       tall, plus a little padding for the pointer lean, so the camera can
       run its whole descent without ever showing an edge. */
    function placeOne(rec, H, paint) {
      var A = rec.depth * H * reachFor(rec.reach);
      var pad = Math.round((rec.lean || 0) * 1.6 * H) + 2;
      var span = A * (rec.shape.max - rec.shape.min);
      rec.A = A; rec.pad = pad; rec.span = span;
      rec.top = Math.round(A * rec.shape.max) + pad;        // px above the viewport
      rec.h = Math.round(span) + 2 * pad;                   // px taller than the viewport
      if (rec.box !== false) {
        rec.el.style.top = (-rec.top) + 'px';
        rec.el.style.bottom = 'auto';
        rec.el.style.height = 'calc(100% + ' + rec.h + 'px)';
      }
      if (rec.handle) rec.handle.amp(A);
      if (paint && rec.optsFn) return paintRidge(rec.el, rec.optsFn(H, (span + pad) / 2, isDark()));
      return true;
    }

    function recOf(el) {
      for (var i = 0; i < moved.length; i++) if (moved[i].el === el) return moved[i];
      return moved[0];
    }

    /* The lit horizon, restyled whenever the viewport or the theme moves.
       A gather that reaches a quarter of the screen into the sky, the edge
       itself, and the light falling a little way onto the plain below it —
       the shape portal's hero draws in CSS, given to every page.

       The edge was a 2 px background layer at `100% 2px`: a ruled line,
       dead straight across the width while the land under it was not, and
       the full-width warm row that laid itself through a paragraph on every
       mid-page screen of all seven pages (QA-4 D1/D5). It is a crest now —
       the furthest range, four harmonics so it is a profile and not a
       scribble, clipped out of the same light — and the gather is held
       under the warm threshold on its own. Nothing here is a hard edge. */
    var dawnCrest = crest(7717, 4);
    function crestPts(n, G, A) {
      var p = [], i;
      for (i = 0; i <= n; i++) p.push(G + A * dawnCrest(i / n));
      return p;
    }
    /* T > 0: a ribbon along the crest. T = 0: everything under it. */
    function cutAt(n, ys, T) {
      var pts = [], i;
      for (i = 0; i <= n; i++) pts.push((i * 100 / n).toFixed(2) + '% ' + (ys[i] - T / 2).toFixed(1) + 'px');
      if (!T) pts.push('100% 100%', '0% 100%');
      else for (i = n; i >= 0; i--) pts.push((i * 100 / n).toFixed(2) + '% ' + (ys[i] + T / 2).toFixed(1) + 'px');
      return 'polygon(' + pts.join(',') + ')';
    }
    function setClip(el, v) { el.style.webkitClipPath = v; el.style.clipPath = v; }
    function setMask(el, v) { el.style.webkitMaskImage = v; el.style.maskImage = v; }

    /* The dawn's distribution times the crest's own height: the edge is a
       handful of gleams along a silhouette, not a line. */
    function edgeMask(n, ys) {
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      return lightMask(n, function (u) {
        var h = hi === lo ? 1 : (hi - ys[Math.round(u * n)]) / (hi - lo);   // 1 at the peaks
        return lightAt(u) * (0.04 + 0.96 * Math.pow(h, 1.7));
      });
    }

    function paintDawn(H) {
      var dark = isDark();
      var G = Math.round((PHONE ? 0.22 : 0.26) * H);     // sky above the line
      var S = Math.round((PHONE ? 0.09 : 0.10) * H);     // how far the light spills
      var D = Math.round((PHONE ? 0.22 : 0.26) * H);     // how far the land falls away
      var A = Math.round((PHONE ? 0.085 : 0.075) * H);   // how far the crest rides
      var a = hex('--accent'), k = dark ? 1 : 0.55;
      var n = (window.innerWidth || 1280) < 520 ? 60 : 120;
      var ys = crestPts(n, G, A);
      dawn.style.top = (Math.round(HOR * H) - G) + 'px';
      dawn.style.height = (G + D) + 'px';

      gather.style.backgroundImage =
        'linear-gradient(to bottom,' + rgba(a, 0) + ' 0,' +
          rgba(a, 0.030 * k) + ' ' + Math.round(G * 0.42) + 'px,' +
          rgba(a, 0.085 * k) + ' ' + Math.round(G * 0.80) + 'px,' +
          rgba(a, 0.190 * k) + ' ' + G + 'px,' +
          rgba(a, 0.060 * k) + ' ' + (G + Math.round(S * 0.38)) + 'px,' +
          rgba(a, 0) + ' ' + (G + S) + 'px,' + rgba(a, 0) + ' 100%)';
      /* the gather and the edge under one light: the same distribution
         masks both, so they can only ever be the same dawn. The land is
         not masked — light is uneven, a mountain is not. */
      setMask(gather, lightMask(16, lightAt));
      setMask(edge, edgeMask(n, ys));

      var deep = dark ? hex('--wash-a') : hex('--ground');
      land.style.backgroundImage =
        'linear-gradient(to bottom,' + rgba(deep, dark ? 0.72 : 0.34) + ' ' + Math.round(G - A) + 'px,' +
          rgba(deep, dark ? 0.34 : 0.16) + ' ' + Math.round(G + D * 0.34) + 'px,' +
          rgba(deep, 0) + ' 100%)';
      setClip(land, cutAt(n, ys, 0));

      var glow = (PHONE ? 4 : 5), wide = (PHONE ? 11 : 15);
      edge.style.filter =
        'drop-shadow(0 0 ' + glow + 'px ' + rgba(a, 0.42 * k) + ') ' +
        'drop-shadow(0 1px ' + wide + 'px ' + rgba(a, 0.26 * k) + ')';
      edgeCut.style.background = rgba(a, 0.88 * k);
      setClip(edgeCut, cutAt(n, ys, PHONE ? 2.2 : 2.6));
    }

    /* Three pages draw a horizon of their own: portal's full-bleed dawn in
       the hero, index's hero world, about's ridge scene. Theirs is the one
       a visitor sees there — the engine's stands down while it is on
       screen and comes back under the reader once it has gone, so there
       are never two horizons and the journey never loses the first one. */
    var ownHz = document.querySelector('[data-own-horizon], .pt-hero__hz, #world, #ridge-svg');
    var ownTop = 0, ownBot = -1, dawnOff = false;
    function ownBand() {
      if (!ownHz) return;
      var r = ownHz.getBoundingClientRect();
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      /* a 1 px rule still lights a whole band of sky: give a thin element
         the reach portal's gradient actually has */
      var thin = r.height < 24 ? 0.32 * (window.innerHeight || 800) : 0;
      ownTop = r.top + y - thin;
      ownBot = r.top + y + r.height + thin;
    }
    function dawnState() {
      if (ownBot < ownTop) return;
      var off = ownBot > cam.y + 24 && ownTop < cam.y + cam.vh - 24;
      if (off === dawnOff) return;
      dawnOff = off;
      dawn.style.opacity = off ? '0' : '1';
    }

    function place() {
      metrics();
      var H = window.innerHeight || 800;
      for (var i = 0; i < moved.length; i++) placeOne(moved[i], H, false);
      geomDh = cam.dh;
      /* the horizon in the sky canvas's own coordinates: it has to sit on
         HOR while the camera is at rest, at the top of the page */
      var s = recOf(sky);
      skyCanvas.__horizon = (HOR * H + s.top) / (H + s.h);
      line.style.top = Math.round(HOR * H) + 'px';
      paintDawn(H);
      ownBand();
      return { H: H, rs: s.span / 2, rf: recOf(far).span / 2, rn: recOf(near).span / 2 };
    }

    function paint() {
      var m = place();
      var ok = true;

      if (!external) {
        ok = placeOne(recOf(far), m.H, true) && ok;
        ok = placeOne(recOf(near), m.H, true) && ok;
      }

      world.extras.forEach(function (x) {
        if (!placeOne(x, m.H, true)) x.el.style.display = 'none';
        else x.el.style.display = '';
      });

      if (skyCanvas.__inkWash) skyCanvas.__inkWash.repaint();
      if (!ok) {
        far.style.display = near.style.display = 'none';
        report('the landscape could not be drawn (no 2D canvas) — the horizon behind this page is CSS only.', true, 'world');
      }
      host.classList.add('is-live');
      if (skyCanvas !== sky) sky.classList.add('is-live');
      /* only now may the page's own opaque grounds stand down (site.js) */
      document.documentElement.classList.add('has-ink-world');
      world.ok = ok;
      return ok;
    }

    /* parallax: one camera, four depths and the horizon it carries.
       Painted once; moved with transforms. */
    moved.forEach(function (rec) {
      rec.handle = layer(rec.el, rec.depth, {
        mode: 'page', shape: rec.shape, reach: rec.reach, lean: rec.lean
      });
    });

    /* The third, furthest range. EVERY page gets it now — page.js used to
       add it on the four calm pages only, which is why index and atlas
       stood under a shallower night than portal, about, lab and projects. */
    world.ridge('deep', R_DEEP, function (H, r, dark) {
      return {
        seed: 20719, terms: 4,
        base: HOR * H + 2 * r - 0.055 * H,
        amp: 0.028 * H,
        haze: 0.16 * H,
        hazeColor: hex('--wash-c'), hazeAlpha: dark ? 0.42 : 0.26,
        /* the furthest plane, d = 1 on the ONE NIGHT ramp */
        fillTop: crestTone(1), fillBottom: footTone(1),
        fadeColor: dark ? null : hex('--ground'), fadeAlpha: dark ? 0 : 0.62,
        /* the range standing nearest the horizon takes the dawn too, on its
           own peaks: three planes, one light, no second line */
        rim: dark ? hex('--accent') : hex('--ink-low'),
        rimAlpha: dark ? 0.46 : 0.10, rimLight: dark
      };
    });

    world.repaint = paint;
    paint();
    /* one comparison of two numbers per frame while the camera moves, and
       one style write only when the answer changes */
    onScroll(dawnState);
    if (REDUCED && ownHz) {
      /* no camera runs under reduced motion, so the horizon would never
         learn that the page's own had scrolled away and the reader would
         be left with no lit edge at all. One comparison per scroll event,
         no frame scheduled, nothing moved. */
      window.addEventListener('scroll', function () {
        cam.y = window.pageYOffset || document.documentElement.scrollTop || 0;
        dawnState();
      }, { passive: true });
    }

    if (external && typeof window.InkWorld.setProgress === 'function') {
      onScroll(function (c) { try { window.InkWorld.setProgress(c.progress); } catch (e) {} });
    }

    /* nobody else claimed the sky (a page without its own boot): claim it */
    setTimeout(function () {
      if (!skyCanvas.__inkWash && window.InkWash) {
        window.InkWash.create(skyCanvas, {
          mode: 'night',
          onState: function (m, b) { report(m, b, 'wash'); }
        });
        if (skyCanvas.__inkWash && skyCanvas.__inkWash.ok && skyCanvas !== sky) sky.classList.add('is-live');
      }
      if (skyCanvas.__inkWash && !skyCanvas.__inkWash.ok) {
        world.reason = skyCanvas.__inkWash.reason || 'WebGL unavailable';
      }
    }, 0);

    /* A page that grows after load (data arriving, an image landing) is a
       longer page, and a longer page is a longer camera move. Re-place only
       when the change is big enough to matter, and never while idle. */
    var gt = 0;
    onScroll(function (c) {
      if (Math.abs(c.dh - geomDh) < c.vh * 0.35) return;
      clearTimeout(gt);
      gt = setTimeout(paint, DUR.fast);
    });

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { paint(); readTarget(); schedule(); }, DUR.fast);
    });
    document.addEventListener('inkthemechange', function () { setTimeout(paint, 20); });
  }

  /* ---------------------------------------------------------- */
  function boot() {
    readTarget();
    cam.progress = REDUCED ? STILL_P : target;
    try { mountWorld(); } catch (e) {
      if (window.console) console.error('the ambient world did not mount', e);
    }
    if (!REDUCED) {
      window.addEventListener('scroll', onScrollEvent, { passive: true });
      window.addEventListener('resize', function () { readTarget(); schedule(); }, { passive: true });
    }
    /* The night leans toward the pointer: no repaint, no second loop —
       the camera's own driver carries it and stops with it, about 0.6 s
       after the pointer comes to rest. Never on a coarse pointer. */
    if (!REDUCED && FINE) {
      window.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;
        var w = window.innerWidth || 1, h = window.innerHeight || 1;
        look.tx = Math.max(-1, Math.min(1, (ev.clientX / w - 0.5) * 2));
        look.ty = Math.max(-1, Math.min(1, (ev.clientY / h - 0.5) * 2));
        look.on = true;
        schedule();
      }, { passive: true });
      window.addEventListener('pointerleave', function () {
        look.tx = 0; look.ty = 0; schedule();
      }, { passive: true });
    }
    schedule();
  }

  window.InkScene = {
    EASE: EASE, DUR: DUR, reduced: REDUCED, phone: PHONE,
    y: function () { return cam.y; },
    progress: function () { return cam.progress; },
    rawProgress: function () { return cam.raw; },
    vh: function () { return cam.vh; },
    dh: function () { return cam.dh; },
    onScroll: onScroll,
    layer: layer,
    pin: pin,
    unpin: unpin,
    enter: function (root) { if (window.Ink && window.Ink.enter) window.Ink.enter(root); },
    world: world,
    horizon: function () { return HOR; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
