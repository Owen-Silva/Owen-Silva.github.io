/* ============================================================
   atlas.js — two scenes for the Atlas page.

   1. The release history: 10 public releases as ink marks along a
      line, over a current made of the 2,636 Atlas commits.
   2. The 50-node public-safe system map, drawn as an ink diagram
      whose 61 strokes draw in as the page scrolls.

   Own WebGL + generated SVG. No library.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var done = { current: false, map: false, life: false };
  function mark(k) {
    done[k] = true;
    window.__atlasStats = { settled: done.current && done.map && done.life, current: done.current, map: done.map, life: done.life };
  }
  window.__atlasStats = { settled: false, current: false, map: false, life: false };

  function el(n, a) { var e = document.createElementNS(SVGNS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function hex(s) {
    s = (s || '').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m) { var v = parseInt(m[1], 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
    m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) { var q = m[1].split(/[\s,\/]+/).map(parseFloat); return [q[0] / 255, q[1] / 255, q[2] / 255]; }
    return [1, 1, 1];
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function di(s) { var p = s.split('-').map(Number); var t = p.length === 3 ? Date.UTC(p[0], p[1] - 1, p[2]) : Date.UTC(2026, p[0] - 1, p[1]); return (t - Date.UTC(2026, 2, 1)) / 864e5; }

  /* ============ scene 1: the commit current ================= */
  var VS = 'attribute vec2 a_pos;attribute vec2 a_st;uniform vec2 u_res;uniform float u_dpr;varying float v_t;' +
    'void main(){vec2 c=a_pos/u_res*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);gl_PointSize=a_st.x*u_dpr;v_t=a_st.y;}';
  var FS = 'precision mediump float;varying float v_t;uniform vec3 u_c1;uniform vec3 u_c2;uniform float u_a;' +
    'void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.06,d);a=a*a*(0.55+0.45*a);' +
    'if(a<0.004)discard;gl_FragColor=vec4(mix(u_c1,u_c2,v_t),a*u_a);}';

  function shader(gl, t, src) {
    var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  }

  /* a reason is never allowed to be empty */
  function why(e, fallback) {
    var r = '';
    if (e) r = (e.message || (typeof e === 'string' ? e : '') || e.name || '').trim();
    return r || fallback || 'no reason reported';
  }
  /* a canvas that cannot paint is removed, so no lost-context placeholder
     can ever cover the CSS ground underneath it */
  function retire(canvas) {
    try { canvas.classList.remove('is-live'); canvas.hidden = true; canvas.style.display = 'none'; } catch (e) {}
  }

  function buildCurrent(canvas, perDay, state) {
    var recs = [];
    for (var k in perDay) {
      if (!Object.prototype.hasOwnProperty.call(perDay, k)) continue;
      var n = perDay[k], d = di(k);
      for (var j = 0; j < n; j++) recs.push([d, j, n]);
    }
    recs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var N = recs.length;
    var px = new Float32Array(N * 2), tx = new Float32Array(N * 2), st = new Float32Array(N * 2);
    var seed = 12345;
    function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
    var jit = new Float32Array(N * 2);
    for (var i = 0; i < N; i++) { jit[i * 2] = rnd() - 0.5; jit[i * 2 + 1] = rnd() - 0.5; st[i * 2] = 2.4 + rnd() * 1.4; st[i * 2 + 1] = rnd(); }

    var gl, prog, bPos, bSt, uRes, uDpr, uA, uC1, uC2, ok = false, err = '';
    try {
      gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: true });
      if (!gl) throw new Error('WebGL context could not be created');
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
      gl.useProgram(prog);
      bPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
      gl.bufferData(gl.ARRAY_BUFFER, px.byteLength, gl.DYNAMIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      bSt = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bSt);
      gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
      var aSt = gl.getAttribLocation(prog, 'a_st');
      gl.enableVertexAttribArray(aSt); gl.vertexAttribPointer(aSt, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'u_res'); uDpr = gl.getUniformLocation(prog, 'u_dpr');
      uA = gl.getUniformLocation(prog, 'u_a'); uC1 = gl.getUniformLocation(prog, 'u_c1'); uC2 = gl.getUniformLocation(prog, 'u_c2');
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      canvas.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault(); ok = false;
        retire(canvas);
        err = 'WebGL context lost';
        state('the commit current could not draw (' + err + '). Every release is listed in full below.', true, 'current');
      });
      ok = true;
    } catch (e) {
      err = why(e, 'WebGL unavailable');
      retire(canvas);
    }

    var W = 0, H = 0, dpr = 1, baseY = 0;
    var D0 = di('03-28'), D1 = di('09-20');
    function X(d) { return 16 + (d - D0) / (D1 - D0) * (W - 32); }

    function layout() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(280, Math.round(r.width)); H = Math.max(120, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      baseY = H - 30;
      var maxN = 208;
      for (var i = 0; i < N; i++) {
        var d = recs[i][0], s = recs[i][1], n = recs[i][2];
        var amp = (H * 0.42) * Math.sqrt(n / maxN);
        var frac = n > 1 ? s / (n - 1) : 0;
        tx[i * 2] = X(d) + jit[i * 2] * 3.2;
        tx[i * 2 + 1] = baseY - frac * amp + jit[i * 2 + 1] * 2.4;
      }
      if (ok) { gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uRes, W, H); gl.uniform1f(uDpr, dpr); }
      return { X: X, baseY: baseY, W: W, H: H };
    }

    function colours() {
      if (!ok) return;
      var cs = getComputedStyle(document.documentElement);
      gl.uniform3fv(uC1, hex(cs.getPropertyValue('--lane-atlas')));
      gl.uniform3fv(uC2, hex(cs.getPropertyValue('--ink-low')));
    }

    function paint(a) {
      if (!ok) return;
      try {
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uA, a);
        gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, px);
        gl.drawArrays(gl.POINTS, 0, N);
      } catch (e) {
        ok = false; err = why(e, 'the WebGL draw call failed');
        retire(canvas);
        state('the commit current could not draw (' + err + '). Every release is listed in full below.', true, 'current');
        return;
      }
      canvas.classList.add('is-live');
    }

    function snap() { px.set(tx); }

    var ran = false, stats = { frames: 0, total: 0, max: 0 };
    function run() {
      if (ran || !ok) return; ran = true;
      if (REDUCED) { snap(); colours(); paint(0.8); state('2,636 Atlas commits · still frame (reduced motion)', false, 'current'); mark('current'); return; }
      for (var i = 0; i < N; i++) { px[i * 2] = tx[i * 2]; px[i * 2 + 1] = baseY + 14; }
      colours();
      var t0 = performance.now();
      (function step(now) {
        var f = performance.now();
        var p = Math.min(1, (now - t0) / 1250);
        var e = 1 - Math.pow(1 - p, 3);
        for (var i = 0; i < N; i++) {
          px[i * 2] = tx[i * 2];
          px[i * 2 + 1] = (baseY + 14) + (tx[i * 2 + 1] - (baseY + 14)) * e;
        }
        paint(0.8);
        var c = performance.now() - f;
        stats.frames++; stats.total += c; if (c > stats.max) stats.max = c;
        if (p < 1) requestAnimationFrame(step);
        else {
          state('2,636 Atlas commits, one dot each, by the day they landed', false, 'current');
          window.__currentStats = { frames: stats.frames, avgMs: +(stats.total / stats.frames).toFixed(3), maxMs: +stats.max.toFixed(3), particles: N };
          mark('current');
        }
      })(performance.now());
    }

    return { layout: layout, run: run, snap: snap, paint: paint, colours: colours, ok: ok, err: err, N: N, X: function (d) { return X(d); }, baseY: function () { return baseY; } };
  }

  /* ============ scene 1 wrapper: marks over the current ===== */
  function releaseScene(data, commits) {
    var host = document.getElementById('rel-scene');
    var canvas = document.getElementById('rel-canvas');
    var svg = document.getElementById('rel-svg');
    var state = I.reporter('rel-state');
    if (!host || !canvas || !svg) return;

    var cur = buildCurrent(canvas, commits.projects.atlas.commits_per_day, state);
    if (!cur.ok) {
      state('the commit current could not draw (' + why(null, cur.err) + '). Every release is listed in full below.', true, 'current');
      mark('current');
    }
    if (cur.N !== commits.projects.atlas.total_commits) {
      state('Atlas commits: ' + cur.N + ' expanded, ' + commits.projects.atlas.total_commits + ' expected', true, 'count');
    }

    function drawMarks() {
      var g = cur.layout();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);

      var lineY = Math.round(g.H * 0.38);
      svg.appendChild(el('line', { 'class': 'rel-axis', x1: 16, y1: lineY, x2: g.W - 16, y2: lineY }));

      // the 337 internal releases: a bracket under the axis, not
      // invented dates. It hangs below the line so the whole band
      // above it belongs to the names of the ten public releases.
      var a = g.X(di('04-01')), b = g.X(di('08-26'));
      var br = el('path', { 'class': 'rel-axis', d: 'M' + a + ' ' + (lineY + 4) + ' v6 H' + b + ' v-6', fill: 'none', opacity: .55 });
      svg.appendChild(br);
      var brText = g.W < 620 ? '337 internal releases before 1.0'
                             : '337 internal releases before 1.0 — never shipped outside';
      var brW = brText.length * 5.4;
      var brX = Math.max(6 + brW / 2, Math.min(g.W - 6 - brW / 2, (a + b) / 2));
      /* 10, not 9.5: the sheet used to floor every scene label at 10 px and
         this line has always DRAWN at 10. Now that a font-size attribute
         wins, the number written here is the number drawn, so it says the
         size it has — and stays on the phone floor e569d1e set. */
      var bt = el('text', { x: brX, y: lineY + 25, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--scene-ink)' });
      bt.textContent = brText;
      svg.appendChild(bt);

      // month ticks
      for (var m = 3; m <= 8; m++) {
        var x = g.X(di((m + 1 < 10 ? '0' : '') + (m + 1) + '-01'));
        var t = el('text', { x: x, y: g.H - 10, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--scene-ink)', 'letter-spacing': '.14em' });
        t.textContent = MON[m].toUpperCase();
        svg.appendChild(t);
      }
      svg.appendChild(el('line', { 'class': 'rel-axis', x1: 16, y1: g.H - 26, x2: g.W - 16, y2: g.H - 26, opacity: .5 }));

      // ---- the ten public releases ----------------------------
      // Nine of the ten land in one week at the right-hand end of a
      // five-month axis, so their names cannot sit over their own
      // marks: stacked there they collided in 9 px mono. The names get
      // a rail of their own across the whole band, and a lens joins
      // that rail to the week it magnifies. Date order on the rail is
      // date order on the axis, and the tie to a single mark appears
      // only on hover or focus — so nothing crosses at rest.
      // oldest first; within a day, oldest version first (the file is newest-first)
      var rel = data.releases.slice().reverse();
      rel.sort(function (p, q) { return p.date < q.date ? -1 : (p.date > q.date ? 1 : 0); });

      var n = rel.length;
      var pad = g.W < 380 ? 14 : 18;
      var usable = Math.max(120, g.W - pad * 2);

      // the fewest lanes that still sets every version at a reading
      // size. The widths are measured, not guessed: each version is
      // set once at 15 px and read back, so no pair can ever touch.
      var probe = el('text', { style: 'font-size:15px', x: -999, y: -999 });
      svg.appendChild(probe);
      var w15 = rel.map(function (r) {
        probe.textContent = r.version;
        return (probe.getComputedTextLength ? probe.getComputedTextLength() : r.version.length * 9.1) || r.version.length * 9.1;
      });
      svg.removeChild(probe);

      var wide = Math.max.apply(null, w15) / 15;   // the widest name, per px of size
      var lanes = 1, fs = 15;
      for (lanes = 1; lanes <= 3; lanes++) {
        var f = 15;
        for (var q = lanes; q < n; q++) {
          var need = (w15[q - lanes] + w15[q]) / 2 / 15;   // px of width per 1 px of size
          var allow = (lanes * usable / (n - 1) - 8) / (need + lanes * wide / (n - 1));
          if (allow < f) f = allow;
        }
        if (f >= 11.5 || lanes === 3) { fs = Math.max(10.5, Math.min(15, f)); break; }
      }
      var pitch = (usable - wide * fs) / (n - 1);     // centre to centre
      var lx0 = pad + wide * fs / 2;
      var rowH = Math.round(fs * 1.55);
      var railY = Math.min(18 + lanes * rowH + 9, lineY - 28);
      var markTop = lineY + 6;

      // the lens: the rail's full width is this one week on the axis
      var firstX = g.X(di(rel[0].date)), lastX = g.X(di(rel[n - 1].date));
      var lensL = Math.max(pad, firstX - 12), lensR = Math.min(g.W - pad, lastX + 12);
      svg.appendChild(el('path', {
        'class': 'rel-lens__fill', fill: 'var(--scene-ink)', opacity: .05,
        d: 'M' + pad + ' ' + railY + 'H' + (g.W - pad) + 'L' + lensR + ' ' + (lineY - 2) + 'H' + lensL + 'Z'
      }));
      svg.appendChild(el('line', { 'class': 'rel-axis rel-lens', x1: pad, y1: railY, x2: lensL, y2: lineY - 2, opacity: .45 }));
      svg.appendChild(el('line', { 'class': 'rel-axis rel-lens', x1: g.W - pad, y1: railY, x2: lensR, y2: lineY - 2, opacity: .45 }));
      svg.appendChild(el('line', { 'class': 'rel-axis', x1: pad, y1: railY, x2: g.W - pad, y2: railY, opacity: .8 }));

      rel.forEach(function (r, i) {
        var x = g.X(di(r.date));
        var lx = lx0 + pitch * i;
        var lane = i % lanes;
        var by = railY - 9 - lane * rowH;
        var rad = 1.8 + Math.sqrt(r.bullet_count) * 0.85;

        var grp = el('g', {
          'class': 'rel-mark', 'data-kind': r.kind, tabindex: '0', role: 'button',
          'aria-label': r.version + ', ' + r.date_display + ', ' + r.kind + ': ' + r.title + '. ' + r.bullet_count + ' entries. Opens the list below.'
        });
        grp.appendChild(el('title', {})).textContent = r.version + ' · ' + r.date_display + ' · ' + r.title;
        // the tie: rail name to its own mark, drawn only when pointed at
        grp.appendChild(el('path', {
          'class': 'rel-mark__tie', fill: 'none',
          d: 'M' + lx.toFixed(1) + ' ' + railY + 'C' + lx.toFixed(1) + ' ' + (railY + 26) + ' ' +
             x.toFixed(1) + ' ' + (markTop - 26) + ' ' + x.toFixed(1) + ' ' + markTop
        }));
        grp.appendChild(el('line', { 'class': 'rel-mark__stem', x1: x, y1: lineY + 1, x2: x, y2: lineY + 10 + rad }));
        grp.appendChild(el('circle', { 'class': 'rel-mark__blot', cx: x, cy: lineY + 10 + rad, r: rad }));
        // a thumb-sized target around the name (the blot alone is a few px)
        grp.appendChild(el('rect', {
          x: (lx - pitch / 2).toFixed(1), y: (by - fs - 5).toFixed(1),
          width: pitch.toFixed(1), height: (fs + 13).toFixed(1), fill: 'transparent'
        }));
        var tv = el('text', {
          'class': 'rel-mark__v', x: lx.toFixed(1), y: by, 'text-anchor': 'middle',
          style: 'font-size:' + fs.toFixed(1) + 'px'
        });
        tv.textContent = r.version;
        grp.appendChild(tv);
        grp.addEventListener('click', function () { openRelease(r.version); });
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRelease(r.version); } });
        svg.appendChild(grp);
      });
    }

    function openRelease(v) {
      var d = document.getElementById('rel-' + v.replace(/\./g, '-'));
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      var s = d.querySelector('summary'); if (s) s.focus({ preventScroll: true });
    }

    drawMarks();
    if (cur.ok) {
      if (REDUCED || !('IntersectionObserver' in window)) { cur.run(); }
      else {
        /* the markup's placeholder is not a state: say what is true right
           now and why nothing has moved yet, so a load that never reaches
           this band still reads as waiting rather than as broken */
        state('2,636 Atlas commits — they gather when this band reaches the screen', false, 'current');
        var io = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { cur.run(); io.disconnect(); }
        }, { threshold: 0.15 });
        io.observe(host);
      }
    }
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { drawMarks(); cur.snap(); cur.paint(0.8); }, 200);
    });
    document.addEventListener('inkthemechange', function () { cur.colours(); cur.snap(); cur.paint(0.8); });
  }

  /* ---- the release list (all 10, every bullet lead) --------- */
  function releaseList(data) {
    var host = document.getElementById('rel-list');
    if (!host) return;
    host.innerHTML = '';
    data.releases.forEach(function (r) {
      var d = document.createElement('details');
      d.className = 'rel-row';
      d.id = 'rel-' + r.version.replace(/\./g, '-');
      var s = document.createElement('summary');
      s.innerHTML = '<span class="v"></span><span class="d"></span><span class="t"></span><span class="n"></span>';
      s.querySelector('.v').textContent = r.version;
      s.querySelector('.d').textContent = r.date_display;
      s.querySelector('.t').textContent = r.title;
      s.querySelector('.n').textContent = r.kind + ' · ' + r.bullet_count + (r.bullet_count === 1 ? ' entry' : ' entries');
      d.appendChild(s);
      var body = document.createElement('div');
      body.className = 'body';
      var ul = document.createElement('ul');
      r.bullet_leads.forEach(function (b) {
        var li = document.createElement('li');
        li.innerHTML = b;          // source strings carry entities such as &rarr;
        ul.appendChild(li);
      });
      body.appendChild(ul);
      d.appendChild(body);
      host.appendChild(d);
    });
    var tot = data.releases.reduce(function (a, r) { return a + r.bullet_count; }, 0);
    var note = document.getElementById('rel-total');
    if (note) note.textContent = data.public_release_count + ' public releases, ' + tot + ' entries between them, from v1.0.0 on ' +
      '27 August to ' + data.latest_version + ' on 10 September 2026.';
  }

  /* ============================================================
     the system map — a map of the night, not a diagram of boxes

     Six ground levels, one per tier, each drawn as a hairline
     horizon that fades out at both ends. The fifty parts are marks
     of light standing in the air above their own ground, named
     beside themselves — no plate, no rectangle, nothing boxed. The
     sixty-one links are lines of the scene's ink that leave a mark
     straight up or down, so a link is clear of the name beside it
     before it turns.

     The levels are named in the map's left margin, in real HTML at
     the page's own small size rather than at 9 px inside the
     drawing. Each name is sticky inside its own level: it rides
     down the margin as that level scrolls and is pinned a measured
     nav-height clear of the masthead, instead of sliding under it.
     ============================================================ */
  function mapScene(map) {
    var svg = document.getElementById('map-svg');
    var readout = document.getElementById('map-readout');
    var state = I.reporter('map-state');
    if (!svg) return;

    var byId = {};
    map.nodes.forEach(function (n) { byId[n.id] = n; });
    var edges = map.edges.filter(function (e) { return byId[e.from] && byId[e.to]; });
    if (edges.length !== map.edge_count || map.nodes.length !== map.node_count) {
      state('map: ' + map.nodes.length + '/' + map.node_count + ' nodes, ' + edges.length + '/' + map.edge_count + ' edges', true, 'mapcount');
    }

    var scene = svg.parentNode;
    var margin = scene.querySelector('.map-margin');
    if (!margin) {
      margin = document.createElement('div');
      margin.className = 'map-margin';
      /* every part already says its own tier in its label, and the text
         list below repeats all six: the margin is the picture's caption */
      margin.setAttribute('aria-hidden', 'true');
      scene.appendChild(margin);
    }

    var W = 1000, H = 600, paths = [], nodes = [], mio = null;
    function f(v) { return Math.round(v * 10) / 10; }

    function build() {
      var box = scene.getBoundingClientRect();
      /* the viewBox is the real width, so one SVG unit is one CSS pixel
         and a 10.6 px name renders at 10.6 px at every width */
      W = Math.max(260, Math.floor(box.width));
      var narrow = W < 560, mid = W < 920;
      var gw = narrow ? 76 : (mid ? 100 : 124);        // the margin the levels are named in
      var colMin = narrow ? 132 : (mid ? 152 : 172);
      var cols = Math.max(1, Math.floor((W - gw - 6) / colMin));
      var colW = (W - gw - 6) / cols;
      var rowH = narrow ? 28 : 33;
      var airTop = narrow ? 26 : 30;                   // air above a level's first row
      var airBot = narrow ? 24 : 28;                   // from the last row down to the ground
      var gap = narrow ? 30 : 36;                      // the air between two levels
      var y = 22;
      var pos = {}, bands = [];

      map.tiers.forEach(function (tier, ti) {
        var list = map.nodes.filter(function (n) { return n.tier === tier.id; });
        var rowsN = Math.ceil(list.length / cols);
        var y0 = y;
        list.forEach(function (n, i) {
          var c = i % cols, r = Math.floor(i / cols);
          /* the marks do not stand on a grid line: each drifts inside its
             own row by a fixed amount taken from where it sits in the data,
             so a level reads as a field of lights and not as a table */
          var drift = (((i * 7 + ti * 3) % 7) - 3) * (narrow ? 1.1 : 1.7);
          pos[n.id] = { x: gw + c * colW + 7, y: y0 + airTop + r * rowH + drift, cw: colW };
        });
        var ground = y0 + airTop + (rowsN - 1) * rowH + airBot;
        bands.push({ tier: tier, y0: y0, ground: ground, n: list.length });
        y = ground + gap;
      });
      H = Math.round(y - gap + 22);

      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      paths = []; nodes = [];

      /* one gradient, in user space because a horizontal line has no
         height for an object-bounding-box gradient to sit in */
      var defs = el('defs', {});
      var lg = el('linearGradient', { id: 'map-horizon', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: W, y2: 0 });
      [[0, 0], [0.035, 1], [0.6, 0.66], [1, 0]].forEach(function (s) {
        lg.appendChild(el('stop', { offset: s[0], 'stop-opacity': s[1] }));
      });
      defs.appendChild(lg);
      svg.appendChild(defs);

      bands.forEach(function (b) {
        svg.appendChild(el('line', { 'class': 'horizon', x1: f(gw - 18), y1: f(b.ground), x2: W - 2, y2: f(b.ground) }));
      });

      var gEdges = el('g', { 'class': 'map-links', 'aria-hidden': 'true' });
      svg.appendChild(gEdges);
      edges.forEach(function (e) {
        var a = pos[e.from], z = pos[e.to];
        if (!a || !z) return;
        var x1 = a.x, y1 = a.y, x2 = z.x, y2 = z.y, dx = x2 - x1, dy = y2 - y1, d;
        if (Math.abs(dy) < rowH * 0.62) {
          /* two marks standing on the same line: the link dips into the air
             under them rather than running along their names */
          var sag = Math.min(rowH * 0.6, 11 + Math.abs(dx) * 0.045);
          d = 'M' + f(x1) + ' ' + f(y1) + ' C' + f(x1 + dx * 0.2) + ' ' + f(y1 + sag) +
              ' ' + f(x1 + dx * 0.8) + ' ' + f(y2 + sag) + ' ' + f(x2) + ' ' + f(y2);
        } else {
          var s = dy > 0 ? 1 : -1;
          /* a long leader, so the line leaves and arrives standing up and
             makes its crossing in the air between two levels instead of
             cutting the whole picture on a diagonal */
          var lead = Math.min(Math.abs(dy) * 0.47, rowH * 3.2);
          d = 'M' + f(x1) + ' ' + f(y1) + ' C' + f(x1) + ' ' + f(y1 + s * lead) +
              ' ' + f(x2) + ' ' + f(y2 - s * lead) + ' ' + f(x2) + ' ' + f(y2);
        }
        var p = el('path', { 'class': 'edge', d: d, 'data-from': e.from, 'data-to': e.to });
        gEdges.appendChild(p);
        var len = 0;
        try { len = p.getTotalLength(); } catch (err) { len = Math.hypot(x2 - x1, y2 - y1) * 1.2; }
        p.style.strokeDasharray = len + ' ' + len;
        p.style.strokeDashoffset = String(len);
        paths.push({ p: p, len: len });
      });

      map.nodes.forEach(function (n) {
        var q = pos[n.id];
        if (!q) return;
        var g = el('g', {
          'class': 'node', 'data-tier': n.tier, 'data-kind': n.kind, 'data-id': n.id,
          tabindex: '0', role: 'button', 'aria-label': n.label + '. ' + map.tiers.filter(function (t) { return t.id === n.tier; })[0].label + '. ' + n.role
        });
        g.appendChild(el('title', {})).textContent = n.label + ' — ' + n.role;
        /* the pointer target: a rectangle with no fill and no stroke, a hit
           area and never a plate */
        g.appendChild(el('rect', { 'class': 'node__hit', x: f(q.x - 11), y: f(q.y - 12), width: f(Math.max(40, q.cw - 6)), height: 24 }));
        g.appendChild(el('circle', { 'class': 'node__ring', cx: f(q.x), cy: f(q.y), r: 8.5 }));
        g.appendChild(el('circle', { 'class': 'node__blot', cx: f(q.x), cy: f(q.y), r: 3.2 }));
        var t = el('text', { 'class': 'node__label', x: f(q.x + 10), y: f(q.y + 3.7) });
        t.textContent = n.label;
        g.appendChild(t);
        svg.appendChild(g);
        nodes.push(g);
        bindNode(g, n);
      });

      /* the levels, named in the margin */
      var nav = document.querySelector('.nav');
      var navH = nav ? Math.round(nav.getBoundingClientRect().height) : 56;
      var top0 = Math.round(svg.getBoundingClientRect().top - box.top);
      margin.style.setProperty('--map-stick', (navH + 16) + 'px');
      margin.style.width = (gw - 14) + 'px';
      if (mio) { mio.disconnect(); mio = null; }
      margin.innerHTML = '';
      bands.forEach(function (b) {
        var d = document.createElement('div');
        d.className = 'map-tier';
        d.style.top = (top0 + Math.round(b.y0)) + 'px';
        d.style.height = Math.max(34, Math.round(b.ground - b.y0)) + 'px';
        var sp = document.createElement('span');
        sp.className = 'map-tier-name';
        var nm = document.createElement('b'); nm.textContent = b.tier.label;
        var ct = document.createElement('i'); ct.textContent = String(b.n);
        sp.appendChild(nm); sp.appendChild(ct);
        d.appendChild(sp);
        margin.appendChild(d);
      });
      /* A name pinned under the masthead would be a name you cannot read, so
         a level's name leaves the margin the moment its level has left the
         screen rather than sliding up behind the bar. An observer, not a
         scroll handler: it fires on the crossing and holds no loop. The root
         is shrunk by the masthead plus the tallest name, so the name is gone
         while its own top is still below the bar. */
      var nameH = 0;
      margin.querySelectorAll('.map-tier-name').forEach(function (s) { nameH = Math.max(nameH, s.getBoundingClientRect().height); });
      if (window.IntersectionObserver) {
        mio = new IntersectionObserver(function (es) {
          es.forEach(function (e) { e.target.classList.toggle('off', !e.isIntersecting); });
        }, { rootMargin: '-' + Math.round(navH + nameH + 26) + 'px 0px 0px 0px', threshold: 0 });
        margin.querySelectorAll('.map-tier').forEach(function (d) { mio.observe(d); });
      }

      state(map.node_count + ' nodes · ' + map.edge_count + ' links · public-safe names only' +
        (REDUCED ? ' · still frame, every link drawn at once (reduced motion)' : ''), false, 'map');
      reveal(REDUCED ? 1 : progress());
      if (REDUCED) mark('map');
    }

    function bindNode(g, n) {
      function show() {
        if (readout) {
          readout.innerHTML = '';
          var k = document.createElement('span'); k.className = 'k';
          k.textContent = map.tiers.filter(function (t) { return t.id === n.tier; })[0].label + ' · ' + n.kind;
          var b = document.createElement('b'); b.textContent = n.label;
          var p = document.createElement('p'); p.textContent = n.role;
          readout.appendChild(k); readout.appendChild(b); readout.appendChild(p);
        }
        paths.forEach(function (o) {
          var hot = o.p.getAttribute('data-from') === n.id || o.p.getAttribute('data-to') === n.id;
          o.p.classList.toggle('hot', hot);
        });
      }
      function clear() { paths.forEach(function (o) { o.p.classList.remove('hot'); }); }
      g.addEventListener('pointerenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('pointerleave', clear);
      g.addEventListener('blur', clear);
      g.addEventListener('click', show);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    }

    function progress() {
      var r = svg.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      // 0 when the top edge reaches the lower third, 1 when it has scrolled a screen further
      var p = (vh * 0.78 - r.top) / Math.max(200, Math.min(r.height, vh * 0.75));
      return Math.max(0, Math.min(1, p));
    }

    var shown = 0, ticking = false, complete = false;
    function reveal(p) {
      if (p <= shown && p < 1) return;
      shown = p;
      for (var i = 0; i < paths.length; i++) {
        var seg = Math.max(0, Math.min(1, p * 1.5 - (i / paths.length) * 0.5));
        paths[i].p.style.strokeDashoffset = String(paths[i].len * (1 - seg));
      }
      if (p >= 1 && !complete) { complete = true; mark('map'); }
    }

    function onScroll() {
      if (complete || ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; reveal(progress()); });
    }

    build();
    if (!REDUCED) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { shown = 0; complete = false; build(); }, 220); });

    /* the same 50 nodes as plain text */
    var list = document.getElementById('node-list');
    if (list) {
      list.innerHTML = '';
      map.tiers.forEach(function (tier) {
        var h = document.createElement('h3');
        h.textContent = tier.label;
        list.appendChild(h);
        var dl = document.createElement('dl');
        map.nodes.filter(function (n) { return n.tier === tier.id; }).forEach(function (n) {
          var dt = document.createElement('dt'); dt.textContent = n.label;
          var dd = document.createElement('dd'); dd.textContent = n.role;
          dl.appendChild(dt); dl.appendChild(dd);
        });
        list.appendChild(dl);
      });
    }
  }

  /* ============================================================
     the journey — one scheduled task, end to end

     Seven stages as landmarks in the night: the typed sentence
     starts at the near edge, cropped by the bottom of the screen,
     and the trail recedes to the world's own horizon. The band is
     two screens tall and the scene is pinned for one of them, so
     the screen of scroll between them IS the run. No frame, no
     card, no player: the journey is the control.

     Nothing here holds a loop. The trail is painted on scroll
     (rAF-coalesced), on a pointer, on focus and on resize; the one
     timed thing is the 900 ms reveal, and it finishes.
     ============================================================ */
  var LIFE = [
    { n: 'The sentence', i: 'TYPED',
      d: '“Every weekday at 8am, send me the top tech news.” Atlas reads the schedule straight out of the sentence. Nobody fills in a cron field.' },
    { n: 'The leader', i: '8:00',
      d: 'Postgres advisory locks keep scheduled jobs on a single leader, so a task never fires twice across instances — however many are running.' },
    { n: 'Pre-fetch', i: 'BEFORE',
      d: 'Live prices and headlines are fetched before the model writes: about 230 company names map to tickers, and 37 coins are recognised.' },
    { n: 'The model', i: 'WRITES',
      d: 'Gemini by default, or your own OpenAI or Anthropic key. The answer opens with the answer.' },
    { n: 'The grader', i: 'CHECKS',
      d: 'A classifier retries a weak answer or switches provider. An LLM-as-judge eval harness has run 52 times over this.' },
    { n: 'Delivery', i: 'SENDS',
      d: 'Email or a daily digest, Discord, Slack, Telegram or a signed webhook — with Google Sheets and GitHub in beta. Reply to a result email to change the task, with one-click undo.' },
    { n: 'Task health', i: 'WATCHES',
      d: 'Every run is graded. Five identical results over six days and Atlas says so, rather than quietly sending the same thing again.' }
  ];
  var LAST = LIFE.length - 1;

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || '#888';
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  /* every stage written out, so the run survives with no canvas at all */
  function lifeText() {
    var host = document.getElementById('life-text');
    if (!host) return;
    host.innerHTML = '';
    LIFE.forEach(function (s, i) {
      var li = document.createElement('li');
      var k = document.createElement('span'); k.className = 'k';
      k.textContent = (i + 1) + ' · ' + s.i;
      var b = document.createElement('div');
      var n = document.createElement('b'); n.textContent = s.n;
      var p = document.createElement('p'); p.textContent = s.d;
      b.appendChild(n); b.appendChild(p);
      li.appendChild(k); li.appendChild(b);
      host.appendChild(li);
    });
  }

  function journeyScene() {
    lifeText();
    var band = document.getElementById('journey');
    var stage = document.getElementById('life-stage');
    var cvs = document.getElementById('life-cv');
    var svg = document.getElementById('life-svg');
    var read = document.getElementById('life-read');
    var report = I.reporter('life-state');
    if (!band || !stage || !cvs || !svg) {
      report('the journey band is not on this page — the seven stages are written out below.', true);
      mark('life'); return;
    }

    var ctx = null;
    try {
      ctx = cvs.getContext('2d');
      if (!ctx) throw new Error('2D context could not be created');
    } catch (e) {
      cvs.hidden = true;
      report('the trail could not be drawn (' + why(e, 'no 2D canvas') +
        ') — the seven stages are written out under it.', true);
      showStage(0);
      mark('life');
      return;
    }

    var P = [], W = 0, H = 0, dpr = 1, narrow = false, hzY = 0;
    var at = -1, hold = null, reveal = REDUCED ? 1 : 0, pending = 0;

    /* the trail ends at the world's own horizon — but never lower than
       0.55, or the band opens with a screen of empty night between the
       head and the far end of the run. */
    function horizonFraction() {
      var f = 0.675;
      try {
        var w = window.InkScene && window.InkScene.world;
        if (w && typeof w.horizon === 'function') {
          var v = w.horizon();
          if (typeof v === 'number' && v > 0.2 && v < 0.95) f = v;
        }
      } catch (e) { /* the world is optional; the journey is not */ }
      /* a short phone screen has to carry the prose too: start the trail lower */
      return Math.min(f, narrow ? (H < 780 ? 0.63 : 0.55) : 0.55);
    }

    function layout() {
      W = stage.clientWidth || window.innerWidth;
      H = stage.clientHeight || window.innerHeight;
      if (!W || !H) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      narrow = W < 760;

      hzY = H * horizonFraction();
      var B = narrow ? 1.25 : 1.05;
      var span = H * (narrow ? 1.02 : 1.02) - hzY;
      var padL = narrow ? W * 0.08 : Math.max(46, W * 0.045);
      var padR = narrow ? W * 0.12 : Math.max(58, W * 0.075);
      var run = Math.max(60, W - padL - padR);

      P = [];
      for (var i = 0; i <= LAST; i++) {
        var u = i / LAST;
        var s = 1 / (1 + i * B);
        var y = hzY + span * s - Math.sin(u * Math.PI * 1.9) * H * 0.035 * s;
        P.push({ x: padL + run * Math.pow(u, 0.84), y: y, s: s, r: (narrow ? 2.6 : 3.4) + (narrow ? 11 : 17) * s });
      }
      labels();
      return true;
    }

    /* How far right the trail has climbed by the time it reaches a given
       height. Walks the first stretch of the same spline the canvas draws,
       so it cannot drift from it, and answers -1 if the trail is never that
       low. Used to stand the first label BESIDE the run instead of on it. */
    function trailXAt(y) {
      var best = -1;
      for (var t = 0; t <= 1.0001; t += 0.005) {
        var q = on(t);
        if (q.y >= y && q.x > best) best = q.x;
      }
      return best;
    }

    /* ---- the labels: real text, each on its own hairline stem ---- */
    function labels() {
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.innerHTML = '';
      LIFE.forEach(function (st, i) {
        var p = P[i];
        var sz = (narrow ? 13 : 11) + (narrow ? 5 : 11) * Math.pow(p.s, 0.55);
        /* The kicker's own recession, held above the 10 px floor e569d1e set
           for phones: it used to run 11.0 -> 9.3 px at 393 and 320 and only
           looked safe because the sheet forced every scene label to 10.
           The desktop run started at 8 and left SENDS at 9.8 and WATCHES at
           9.7 px — the last type on the site under ten. It starts at 10 now
           and keeps the same spread over the seven stages. */
        var ksz = narrow ? 10 + 1.8 * Math.pow(p.s, 0.55) : 10 + 3.4 * Math.pow(p.s, 0.55);
        /* 30 on a phone, not 20: the names are set at their real size there
           now, and the two earliest ones are pinched between the left edge
           of the frame and a trail that climbs steeply past them. Ten more
           pixels of air is the room they needed (measured at 320, where
           stage two had 0.4 px of clearance at 20). */
        var lift = ((narrow ? 30 : 22) + (i % 2 ? (narrow ? 0 : 42) : 0)) * (0.55 + 0.45 * p.s);
        /* On a phone stage one also has to keep off the band's own state
           line, which runs across the bottom of the frame — measured sitting
           on it by 65 x 23 px at 393 once the name had cleared the trail.
           H * 0.115 stands it above that line at 393 and at 320, and the
           step to the right below still sets it beside the run. */
        if (i === 0 && narrow) lift = H * 0.115;
        var baseY = p.y - p.r - lift;
        var anc = p.x < W * 0.12 ? 'start' : p.x > W * 0.88 ? 'end' : 'middle';
        /* On a phone the names are set 14.5-18 px — the recession the sheet
           used to flatten to 10 — and a name CENTRED on its landmark is now
           wide enough for the trail to climb out through its right-hand
           edge: measured touching stages 2, 4 and 5 at 320. Hung to the left
           of the stem instead, every name stands in the open ground above
           the run, because the trail only ever runs lower to the left. */
        if (narrow) anc = 'end';
        var tx = p.x + (anc === 'start' ? -4 : anc === 'end' ? (narrow ? -2 : 4) : 0);

        /* Stage one stands where the run BEGINS, and the run begins below
           the frame (P[0].y is 1.02H), so its name used to float in the
           bottom-left corner with the trail climbing straight through the
           words — measured touching the box at 1280, 393 and 320. Lifting it
           clear is only possible at 1280; at 393 and 320 the trail is far too
           steep. So the name steps to the RIGHT of the run at its own height,
           where the trail has already climbed past it and only ever climbs
           further away, and a short leader runs back to the trail. */
        var lead = null;
        if (i === 0) {
          anc = 'start';
          var xTop = trailXAt(baseY - sz * 1.16 - ksz);
          if (xTop > 0) tx = Math.min(xTop + (narrow ? 13 : 16), W - 8);
          var xMid = trailXAt(baseY - 3);
          lead = { x1: (xMid > 0 ? xMid : p.x) + 3, x2: tx - 6, y: baseY - 3 };
        }

        var g = el('g', {
          'class': 'lf', tabindex: '0', role: 'button', 'data-i': i,
          'aria-label': 'Stage ' + (i + 1) + ' of ' + LIFE.length + ': ' + st.n + '. ' + st.d
        });
        var hw = Math.max(46, (W / LIFE.length) * 0.66);
        var rx = clamp(i === 0 ? tx - 8 : p.x - hw / 2, 0, W);
        var hit = el('rect', {
          x: rx, y: clamp(baseY - ksz - 14, 0, H),
          width: Math.min(hw, W - rx), height: Math.min(H, p.y + p.r + 12 - (baseY - ksz - 14)), fill: 'transparent'
        });
        g.appendChild(hit);
        g.appendChild(el('line', {
          'class': 'lf__stem',
          x1: lead ? lead.x1 : p.x, y1: lead ? lead.y : p.y - p.r - 3,
          x2: lead ? lead.x2 : p.x, y2: lead ? lead.y : baseY + 4,
          stroke: 'currentColor', 'stroke-width': 1, opacity: .34
        }));
        /* 1.16, not 1.02: at 10 px flat the kicker sat clear of the name, but
           at the real sizes the two em boxes met — 2.0 to 2.7 px on every
           stage at 1280. The ink never touched; the air now matches. */
        var k = el('text', { 'class': 'lf__i', x: tx, y: baseY - sz * 1.16, 'text-anchor': anc, 'font-size': ksz.toFixed(1) });
        k.textContent = st.i;
        g.appendChild(k);
        var t = el('text', { 'class': 'lf__n', x: tx, y: baseY, 'text-anchor': anc, 'font-size': sz.toFixed(1) });
        t.textContent = st.n;
        g.appendChild(t);
        /* how wide the name really is — measured, but never trusted below
           what the characters must cost, because the first layout can run
           before the webfont has landed */
        var wN = 0;
        try { wN = t.getComputedTextLength(); } catch (e) { wN = 0; }
        wN = Math.max(wN, st.n.length * sz * 0.52);
        if (i === 0) {
          /* the moved name takes its hit area with it, so the focus ring
             lands on the words and not on the empty corner it left */
          hit.setAttribute('width', Math.max(4, Math.min(W - rx, Math.max(hw, wN + 16))));
        } else if (narrow && wN && tx - wN < 2) {
          /* the earliest stages stand near the left edge, and a name hung
             left of its stem can reach past it — measured at 320, where
             stage two ran to x 0.6. Held inside the frame, and the lift
             above keeps it clear of the run all the same. */
          var nx = Math.ceil(wN) + 2;
          t.setAttribute('x', nx); k.setAttribute('x', nx);
        }

        g.addEventListener('pointerenter', function () { hold = i; paint(); });
        g.addEventListener('pointerleave', function () { hold = null; paint(); });
        g.addEventListener('focus', function () { hold = i; paint(); });
        g.addEventListener('blur', function () { hold = null; paint(); });
        g.addEventListener('click', function () { hold = i; paint(); });
        g.addEventListener('keydown', function (e) {
          var to = -1;
          if (e.key === 'ArrowRight') to = Math.min(LAST, i + 1);
          if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hold = i; paint(); return; }
          if (to >= 0) {
            e.preventDefault();
            var n = svg.querySelectorAll('.lf')[to];
            if (n) n.focus();
          }
        });
        svg.appendChild(g);
      });
    }

    /* ---- the trail: a spline through the seven, tapering with depth ---- */
    function cr(a, b, c, d, t) {
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    }
    function on(t) {
      var i = clamp(Math.floor(t), 0, LAST - 1), f = t - i;
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(LAST, i + 2)];
      return {
        x: cr(p0.x, p1.x, p2.x, p3.x, f), y: cr(p0.y, p1.y, p2.y, p3.y, f),
        s: p1.s + (p2.s - p1.s) * f
      };
    }
    function stroke(from, to, colour, mul) {
      if (to <= from) return;
      var N = Math.max(8, Math.round((to - from) * 26));
      var prev = on(from);
      ctx.strokeStyle = colour; ctx.lineCap = 'round';
      for (var k = 1; k <= N; k++) {
        var q = on(from + (to - from) * (k / N));
        ctx.globalAlpha = mul * (0.26 + 0.74 * Math.pow(q.s, 0.55));
        ctx.lineWidth = (narrow ? 0.6 : 0.7) + (narrow ? 2 : 3.1) * q.s;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        prev = q;
      }
      ctx.globalAlpha = 1;
    }

    function pos() {
      if (hold != null) return hold;
      if (REDUCED) return LAST;          /* the settled still: the run is over */
      var travel = band.offsetHeight - stage.offsetHeight;
      if (travel <= 4) return LAST;
      var p = clamp(-band.getBoundingClientRect().top / travel, 0, 1);
      var seg = p * LAST, k = Math.min(LAST - 1, Math.floor(seg));
      return k + ease(seg - k);           /* it lingers at each landmark */
    }

    function showStage(i) {
      if (i === at) return;
      at = i;
      [].forEach.call(svg.querySelectorAll('.lf'), function (n, k) {
        n.setAttribute('data-on', String(k === i));
      });
      if (!read) return;
      var s = LIFE[i];
      read.innerHTML = '';
      var a = document.createElement('span'); a.className = 'k';
      a.textContent = 'Stage ' + (i + 1) + ' of ' + LIFE.length + ' · ' + s.i;
      var b = document.createElement('b'); b.textContent = s.n;
      var p = document.createElement('p'); p.textContent = s.d;
      read.appendChild(a); read.appendChild(b); read.appendChild(p);
    }

    function paint() {
      if (!P.length) return;
      var t = pos();
      var live = clamp(Math.round(t), 0, LAST);
      var far = LAST * (REDUCED ? 1 : ease(clamp(reveal, 0, 1)));
      var ink = css('--ink-hi'), faint = css('--ink-faint'), hot = css('--accent');

      ctx.clearRect(0, 0, W, H);
      /* the road ahead, still waiting */
      stroke(0, far, faint, 0.34);
      /* the ground it has already covered */
      stroke(0, Math.min(t, far), ink, 0.92);

      /* the landmarks */
      for (var i = 0; i <= LAST; i++) {
        if (i / LAST > reveal + 0.0001 && !REDUCED) continue;
        var p = P[i];
        ctx.lineWidth = (i === live ? 1.7 : 1) * (0.7 + 0.5 * p.s);
        ctx.strokeStyle = i === live ? hot : faint;
        ctx.globalAlpha = i === live ? 1 : 0.5 + 0.4 * p.s;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* the task itself, somewhere on the road */
      var q = on(clamp(t, 0, LAST));
      var r = 2.4 + 3.4 * Math.pow(q.s, 0.7);
      ctx.fillStyle = hot;
      ctx.globalAlpha = 0.24;
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 2.8, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();

      /* on a narrow screen only the stage you are standing at is named, so
         two labels can never meet; the words live in the prose block. */
      [].forEach.call(svg.querySelectorAll('.lf'), function (n, k) {
        var vis = REDUCED || k / LAST <= reveal + 0.0001;
        if (narrow) vis = vis && k === live;
        n.style.opacity = vis ? '1' : '0';
      });
      showStage(live);
      mark('life');
    }

    function schedule() {
      if (pending) return;
      pending = requestAnimationFrame(function () { pending = 0; paint(); });
    }

    /* the reveal: one timed move, and it finishes */
    function unfold() {
      if (REDUCED) { reveal = 1; paint(); return; }
      var t0 = 0;
      (function step(now) {
        if (!t0) t0 = now;
        reveal = clamp((now - t0) / 900, 0, 1);
        paint();
        if (reveal < 1) requestAnimationFrame(step);
      })(0);
    }

    if (!layout()) { report('the trail has no room to draw on this screen.', true); mark('life'); return; }
    paint();

    /* the band says what it is doing, in the same voice as the other two
       scenes: what is waiting, what is running, and — under reduced
       motion — that the still frame is the whole run, already over. */
    if (REDUCED) report('seven stages · still frame (reduced motion)');
    else report('seven stages — the run draws when this band reaches the screen');

    var started = false;
    function begin() {
      if (started) return; started = true;
      if (!REDUCED) report('seven stages · scrolling the band is the run');
      unfold();
    }
    if (REDUCED || !('IntersectionObserver' in window)) begin();
    else {
      var io = new IntersectionObserver(function (es) {
        if (es[0] && es[0].isIntersecting) { io.disconnect(); begin(); }
      }, { rootMargin: '0px 0px -12% 0px' });
      io.observe(band);
    }

    var off = null;
    if (window.InkScene && typeof window.InkScene.onScroll === 'function') {
      off = window.InkScene.onScroll(function () { schedule(); });
    } else {
      window.addEventListener('scroll', schedule, { passive: true });
    }
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (layout()) paint(); }, 200);
    });
    /* the first layout can run before the webfonts land, and every name is
       placed against its own measured width — so measure it again once they
       have, one layout and one paint, no loop */
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { if (layout()) paint(); });
      }
    } catch (e) { /* no font loading API: the estimate above carries it */ }
    document.addEventListener('inkthemechange', function () { setTimeout(paint, 20); });
  }

  /* ============ boot ======================================== */
  function pageWash() {
    var cv = document.getElementById('page-wash');
    if (!cv || !window.InkWash) return;
    var w = window.InkWash.create(cv, { seed: 4.7, maxPixels: 760, amp: 0.55, onState: function (m, b) { I.reporter('map-state')(m, b, 'wash'); } });
    var t = 0;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(w.repaint, 240); });
    document.addEventListener('inkthemechange', function () { setTimeout(w.repaint, 20); });
  }

  function boot() {
    pageWash();
    try { journeyScene(); } catch (e) {
      I.reporter('life-state')('the journey could not be drawn: ' + why(e), true);
      mark('life');
    }
    Promise.all([
      I.loadJSON('data/atlas-releases.json'),
      I.loadJSON('data/atlas-map.json'),
      I.loadJSON('data/commits.json')
    ]).then(function (r) {
      releaseList(r[0]);
      releaseScene(r[0], r[2]);
      mapScene(r[1]);
    }).catch(function (e) {
      I.reporter('rel-state')('scene data failed to load: ' + e.message, true);
      I.reporter('map-state')('scene data failed to load: ' + e.message, true);
      I.fail('Atlas data', e, document.getElementById('rel-list'));
      mark('current'); mark('map');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
