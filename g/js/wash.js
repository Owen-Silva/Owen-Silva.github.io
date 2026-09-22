/* ============================================================
   wash.js — the ground behind every page.

   Two shaders share one tiny WebGL harness:

   · "wash"  — the original domain-warped ink wash, still used by
               the hero on the index page.
   · "night" — the ambient night: sky depth, a horizon, stars that
               thin out into the haze, one warm band of vermilion
               AT THE HORIZON ONLY, and the plain below it. Every
               page that carries #page-wash gets this, painted with
               THE SAME SEED on every page, so the seven pages are
               seven places under one sky rather than seven
               documents with seven backgrounds.

   Both are painted ONCE per resize (never per frame) at reduced
   resolution and upscaled by CSS. An ink wash is soft, so the
   upscale is part of the look rather than a compromise. Parallax
   is done by translating this canvas (see scene.js) — never by
   repainting it. The same goes for the pointer: the night leans
   toward it by a few pixels, and that lean is a transform driven
   by the camera in scene.js. Nothing here repaints on a pointer
   move — a shader pass per frame would cost more than the whole
   world does at rest, which is nothing.

   No library. Nothing here fails silently: every path that cannot
   draw retires the canvas and reports the real reason.
   ============================================================ */
(function () {
  'use strict';

  /* One seed for the whole site. The sky is the same sky on every page. */
  var NIGHT_SEED = 7.42;

  var VERT =
    'attribute vec2 p;varying vec2 uv;' +
    'void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

  /* ---- shared GLSL ------------------------------------------ */
  var NOISE = [
    'float hash(vec2 p){ p=fract(p*vec2(127.31,311.7)); p+=dot(p,p+34.23); return fract(p.x*p.y); }',
    'float vnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  vec2 u=f*f*(3.0-2.0*f);',
    '  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);',
    '}'
  ].join('\n');

  /* ---- 1. the ink wash (unchanged look) --------------------- */
  var FRAG_WASH = [
    'precision highp float;',
    'varying vec2 uv;',
    'uniform vec2  res;',
    'uniform vec3  cA;',      // deepest ink
    'uniform vec3  cB;',      // mid wash
    'uniform vec3  cC;',      // luminous region
    'uniform float seed;',
    'uniform float grain;',
    'uniform float vig;',
    'uniform float amp;',
    NOISE,

    'float fbm(vec2 p){',
    '  float s=0.0, a=0.5;',
    '  for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(7.1,3.7); a*=0.5; }',
    '  return s;',
    '}',

    'void main(){',
    '  vec2 q = uv;',
    '  q.x *= res.x/res.y;',
    '  q += seed;',
    // two-step domain warp: the wash bleeds into itself
    '  vec2 w1 = vec2(fbm(q*1.9), fbm(q*1.9+vec2(5.2,1.3)));',
    '  vec2 w2 = vec2(fbm(q*2.7+3.4*w1+vec2(1.7,9.2)), fbm(q*2.7+3.4*w1+vec2(8.3,2.8)));',
    '  float n = fbm(q*2.2 + 2.6*w2);',

    // a broad, low light high on the left: paper held near a window
    '  vec2 lp = vec2(0.26*res.x/res.y, 0.30);',
    '  float d = distance(vec2(uv.x*res.x/res.y, uv.y), lp);',
    '  float lum = smoothstep(1.05, 0.05, d);',

    // a second, narrower pool low-right, where the river runs
    '  vec2 lp2 = vec2(0.78*res.x/res.y, 0.80);',
    '  float lum2 = smoothstep(0.72, 0.04, distance(vec2(uv.x*res.x/res.y, uv.y), lp2));',

    '  float f = clamp(n*0.86 + lum*0.30 + lum2*0.16, 0.0, 1.0);',
    '  vec3 col = mix(cA, cB, smoothstep(0.26, 0.62, f));',
    '  col = mix(col, cC, smoothstep(0.58, 0.94, f) * 0.92);',

    // an edge of wet pigment where the wash pools
    '  float edge = smoothstep(0.605, 0.625, f) - smoothstep(0.625, 0.70, f);',
    '  col = mix(col, cC, edge*0.30);',

    // vignette, then dither so a dark ground never bands
    '  col = mix(cA, col, amp);',
    '  col *= 1.0 - vig*pow(distance(uv, vec2(0.5,0.46))*1.32, 2.4);',
    '  col += (hash(gl_FragCoord.xy*1.371) - 0.5) * grain;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ---- 2. the night: sky, horizon, plain -------------------- */
  var FRAG_NIGHT = [
    'precision highp float;',
    'varying vec2 uv;',
    'uniform vec2  res;',
    'uniform vec3  cA;',      // zenith — the deepest part of the sky
    'uniform vec3  cB;',      // the middle air
    'uniform vec3  cC;',      // the haze that gathers at the horizon
    'uniform vec3  cG;',      // the plain below the horizon
    'uniform vec3  cS;',      // starlight / cream
    'uniform vec3  acc;',     // vermilion — the horizon and nothing else
    'uniform float hor;',     // horizon height, 0 = bottom of the canvas, 1 = top
    'uniform float stars;',
    'uniform float seed;',
    'uniform float grain;',
    'uniform float vig;',
    'uniform float amp;',
    'uniform float veil;',    // how much of this night is left over the evening
    NOISE,

    'float fbm(vec2 p){',
    '  float s=0.0, a=0.5;',
    '  for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.07+vec2(5.3,2.9); a*=0.5; }',
    '  return s;',
    '}',

    /* a grid of cells; only `keep` of them hold a star, each one
       placed and weighted by its own hash, so the field never
       reads as a lattice */
    'float starLayer(vec2 p, float cell, float keep, float size){',
    '  vec2 g = p*cell;',
    '  vec2 i = floor(g), f = fract(g);',
    '  float h  = hash(i+vec2(seed, seed*1.7));',
    '  vec2  c  = vec2(0.2+0.6*hash(i+vec2(11.1,5.3)), 0.2+0.6*hash(i+vec2(3.7,19.2)));',
    '  float on = step(1.0-keep, h);',
    '  float mag = 0.30 + 0.70*hash(i+vec2(2.3,7.9));',
    '  return on * mag * smoothstep(size, 0.0, length(f-c));',
    '}',

    'void main(){',
    '  float ar = res.x/res.y;',
    '  vec2  q  = vec2(uv.x*ar, uv.y) + seed;',
    '  float y  = uv.y;',
    '  float above = smoothstep(hor-0.0035, hor+0.0035, y);',

    /* --- the sky: 0 at the horizon, 1 at the zenith --- */
    '  float t = clamp((y-hor)/max(0.02, 1.0-hor), 0.0, 1.0);',
    '  vec3 sky = mix(cC, cB, smoothstep(0.0, 0.42, t));',
    '  sky = mix(sky, cA, smoothstep(0.34, 1.0, t));',

    /* one warp of thin, high cloud — atmosphere, not wallpaper */
    '  vec2 w = vec2(fbm(q*1.6), fbm(q*1.6+vec2(4.1,2.3)));',
    '  float n = fbm(q*2.3 + 1.7*w);',
    '  sky = mix(sky, cC, smoothstep(0.46, 0.96, n) * 0.26 * (1.0 - 0.45*t));',

    /* stars: small, thin, and only well clear of the haze. They are depth,
       not decoration — never a field of lights behind the type. */
    '  float sf = starLayer(q, 62.0, 0.034, 0.17) + 0.55*starLayer(q, 132.0, 0.020, 0.13);',
    '  sf *= stars * smoothstep(0.04, 0.46, t) * (1.0 - 0.70*smoothstep(0.50, 1.0, n));',
    '  sky += cS * sf * 0.55;',

    /* the one warm band. exp() so it is gone a fifth of the way up */
    '  sky = mix(sky, acc, exp(-t*13.0) * 0.17);',
    '  sky = mix(sky, mix(cC, cS, 0.30), exp(-t*46.0) * 0.14);',

    /* --- the plain: 0 at the horizon, 1 at the bottom --- */
    '  float u = clamp((hor-y)/max(0.02, hor), 0.0, 1.0);',
    '  vec3 gnd = mix(mix(cG, cC, 0.22), cG, smoothstep(0.0, 0.30, u));',
    '  gnd = mix(gnd, acc, exp(-u*11.0) * 0.07);',
    '  float gn = fbm(vec2(q.x*2.0, (hor-y)*5.0 + seed));',
    '  gnd = mix(gnd, cG, smoothstep(0.34, 0.86, gn) * 0.38);',

    '  vec3 col = mix(gnd, sky, above);',
    '  col = mix(cA, col, amp);',
    '  col *= 1.0 - vig*pow(distance(uv, vec2(0.5,0.54))*1.24, 2.4);',
    '  col += (hash(gl_FragCoord.xy*1.371) - 0.5) * grain;',
    /* The evening below the fold is laid out in PAGE coordinates by
       css/ink.css, behind this canvas, and this canvas is one screen tall
       and barely moves. So the night stops being the ground here and
       becomes a veil over it: its depth, its high cloud, its horizon haze
       and its grain, at `veil` strength, with the evening's own ramp
       showing through. Premultiplied, because the context is. */
    '  gl_FragColor = vec4(col * veil, veil);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    }
    return s;
  }

  function hexToRgb(str) {
    str = (str || '').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m) {
      var v = parseInt(m[1], 16);
      return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
    }
    m = /rgba?\(([^)]+)\)/i.exec(str);
    if (m) {
      var parts = m[1].split(/[\s,\/]+/).map(parseFloat);
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
    }
    return [0.04, 0.06, 0.08];
  }

  /* a reason string is never allowed to be empty */
  function why(e, fallback) {
    var r = '';
    if (e) r = (e.message || e.statusMessage || (typeof e === 'string' ? e : '') || e.name || '').trim();
    return r || fallback || 'no reason reported';
  }

  /* the ground is CSS; a canvas that cannot paint is REMOVED so the browser
     never draws a lost-context placeholder over it */
  function retire(canvas) {
    try { canvas.classList.remove('is-live'); canvas.hidden = true; canvas.style.display = 'none'; } catch (e) {}
  }

  function isPhone() {
    return matchMedia('(max-width: 600px), (pointer: coarse)').matches;
  }

  /**
   * Paint into `canvas`. Returns { repaint(), ok, reason, mode }.
   *
   * opts.mode       — 'wash' | 'night'. Default: 'night' for #page-wash
   *                   (the site-wide ambient world), 'wash' otherwise.
   * opts.maxPixels  — cap on the internal raster's long side (default 880;
   *                   clamped to 560 on phones, where this layer is lighter)
   * opts.onState    — called with a short status string (never fails silently)
   *
   * In 'night' mode the seed is ignored: every page paints the same sky.
   * The horizon is read from `canvas.__horizon` (0..1 from the TOP of the
   * canvas) each repaint, so scene.js can size and place it.
   */
  function create(canvas, opts) {
    opts = opts || {};
    if (canvas.__inkWash) {                       // idempotent: two scripts may ask
      if (opts.onState && canvas.__inkWashState) opts.onState(canvas.__inkWashState[0], canvas.__inkWashState[1]);
      return canvas.__inkWash;
    }

    var night = opts.mode ? (opts.mode === 'night') : (canvas.id === 'page-wash');
    var maxSide = opts.maxPixels || 880;
    if (night && isPhone()) maxSide = Math.min(maxSide, 560);

    var gl = null, prog = null, loc = {}, ok = false, lastErr = '';
    var UNIFORMS = night
      ? ['res', 'cA', 'cB', 'cC', 'cG', 'cS', 'acc', 'hor', 'stars', 'seed', 'grain', 'vig', 'amp', 'veil']
      : ['res', 'cA', 'cB', 'cC', 'seed', 'grain', 'vig', 'amp'];

    function state(msg, bad) {
      canvas.__inkWashState = [msg, bad];
      if (opts.onState) opts.onState(msg, bad);
    }

    function dead(err) {
      retire(canvas);
      var label = night ? 'the night' : 'ink wash';
      state(label + ': WebGL off (' + err + ') — the horizon and the ground are drawn without it.', true);
      var h = { repaint: function () {}, ok: false, reason: err, mode: night ? 'night' : 'wash' };
      canvas.__inkWash = h;
      return h;
    }

    try {
      gl = canvas.getContext('webgl', {
        antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: true, powerPreference: 'low-power'
      }) || canvas.getContext('experimental-webgl');
    } catch (e) { lastErr = why(e, 'getContext threw'); }

    if (!gl) return dead(lastErr || 'WebGL context could not be created');

    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, night ? FRAG_NIGHT : FRAG_WASH));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
      }
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var aP = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

      UNIFORMS.forEach(function (k) { loc[k] = gl.getUniformLocation(prog, k); });

      canvas.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault(); ok = false;
        retire(canvas);
        state((night ? 'the night' : 'ink wash') +
              ': WebGL context lost — the horizon and the ground are drawn without it.', true);
      });
      ok = true;
    } catch (e) {
      return dead(why(e, 'shader compile or link failed'));
    }

    function repaint() {
      if (!ok) return;
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      var scale = Math.min(0.6, maxSide / Math.max(w, h));
      var iw = Math.max(2, Math.round(w * scale));
      var ih = Math.max(2, Math.round(h * scale));
      if (canvas.width !== iw || canvas.height !== ih) { canvas.width = iw; canvas.height = ih; }

      var cs = getComputedStyle(document.documentElement);
      function v(name) { return hexToRgb(cs.getPropertyValue(name)); }
      var a = v('--wash-a'), b = v('--wash-b'), c = v('--wash-c');
      var dark = (a[0] + a[1] + a[2]) / 3 < 0.5;

      gl.viewport(0, 0, iw, ih);
      gl.useProgram(prog);
      gl.uniform2f(loc.res, iw, ih);
      gl.uniform3fv(loc.cA, a);
      gl.uniform3fv(loc.cB, b);
      gl.uniform3fv(loc.cC, c);
      gl.uniform1f(loc.grain, dark ? 0.020 : 0.012);

      if (night) {
        /* THE EVENING, not the old night. This canvas sits over the page
           ramp css/ink.css lays down in page coordinates, so it is painted
           in the same four colours (--sun-night / --sun-dusk-mid /
           --sun-haze) and can only ever add depth to it — never a second,
           differently lit sky. The stars belong to the page ramp now,
           because only the page knows how far down the reader is, and the
           accent is gone: no vermilion is drawn below the fold. */
        gl.uniform3fv(loc.cA, v('--sun-night'));
        gl.uniform3fv(loc.cB, v('--sun-dusk-mid'));
        gl.uniform3fv(loc.cC, v('--sun-haze'));
        /* the plain reads as land: deeper than the sky in ink, heavier
           than the paper in light */
        gl.uniform3fv(loc.cG, v(dark ? '--sun-night' : '--rule-strong'));
        gl.uniform3fv(loc.cS, v('--ink-hi'));
        gl.uniform3fv(loc.acc, v('--sun-haze'));
        var top = canvas.__horizon == null ? 0.70 : canvas.__horizon;   // from the TOP
        gl.uniform1f(loc.hor, Math.max(0.04, Math.min(0.96, 1 - top))); // shader wants it from the bottom
        gl.uniform1f(loc.stars, 0);
        gl.uniform1f(loc.seed, NIGHT_SEED);
        gl.uniform1f(loc.vig, dark ? 0.26 : 0.08);
        gl.uniform1f(loc.amp, dark ? 1.0 : 0.62);
        /* how much of it is left lying over the evening: a token, so the
           whole site can be turned back into an opaque night with one
           number if a page ever wants one */
        var veil = parseFloat(cs.getPropertyValue('--wash-veil'));
        if (!(veil > 0) || veil > 1) veil = 1;
        gl.uniform1f(loc.veil, veil);
      } else {
        gl.uniform1f(loc.seed, opts.seed == null ? 11.3 : opts.seed);
        gl.uniform1f(loc.vig, dark ? 0.30 : 0.09);
        gl.uniform1f(loc.amp, opts.amp == null ? 1.0 : (dark ? opts.amp : opts.amp * 0.40));
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.classList.add('is-live');      // only now is it safe to show
    }

    repaint();
    var handle = { repaint: repaint, ok: true, reason: '', mode: night ? 'night' : 'wash' };
    canvas.__inkWash = handle;
    return handle;
  }

  window.InkWash = { create: create, NIGHT_SEED: NIGHT_SEED };
})();
