/* ============================================================
   river.js — 3,176 particles, one per real commit.

   Every particle carries a date and a repository, expanded from
   the per-day counts in data/commits.json. They assemble into the
   name, hold, then release and flow into a river whose x axis is
   the calendar: March -> 12 October 2026.

   The field is the whole picture. It used to share its rectangle
   with a 25-row gantt of project names, state words, dotted
   leaders and duration bars — three systems stacked on one
   another, and the water lost. The projects are the register in
   the page below, which is where they can be read; here there are
   three currents, one per repository, each as deep as its share of
   the work, and the calendar they run along.

   Own WebGL. No library.
   ============================================================ */
(function () {
  'use strict';

  /* ---- dates ------------------------------------------------ */
  var YEAR = 2026;
  var START = Date.UTC(YEAR, 2, 1);      // 1 Mar 2026
  var END = Date.UTC(YEAR, 9, 13);       // 13 Oct 2026: the day after the last commit bucketed in the data (12 Oct UTC)
  var TODAY = Date.UTC(YEAR, 9, 12);     // 12 Oct 2026, the measurement date
  var DAY = 864e5;
  var SPAN_DAYS = (END - START) / DAY;   // 226

  function dayIndex(s) {                 // 'YYYY-MM-DD' or 'MM-DD'
    var p = s.split('-').map(Number);
    var t = p.length === 3 ? Date.UTC(p[0], p[1] - 1, p[2]) : Date.UTC(YEAR, p[0] - 1, p[1]);
    return (t - START) / DAY;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function human(s) {
    var p = s.split('-').map(Number);
    var d = p.length === 3 ? p[2] : p[1], m = p.length === 3 ? p[1] : p[0];
    return d + ' ' + MON[m - 1];
  }

  /* ---- tiny deterministic rng ------------------------------- */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---- shaders ---------------------------------------------- */
  var VS = [
    'attribute vec2 a_pos;',
    'attribute vec4 a_style;',        // rgb + point size (css px)
    'uniform vec2 u_res;',
    'uniform float u_dpr;',
    'varying vec3 v_col;',
    'void main(){',
    '  vec2 c = a_pos / u_res * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);',
    '  gl_PointSize = a_style.w * u_dpr;',
    '  v_col = a_style.xyz;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 v_col;',
    'uniform float u_alpha;',
    'void main(){',
    '  float d = length(gl_PointCoord - 0.5);',
    '  float a = smoothstep(0.5, 0.06, d);',
    '  a = a * a * (0.55 + 0.45 * a);',      // inky core, soft bleed
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(v_col, a * u_alpha);',
    '}'
  ].join('\n');

  function sh(gl, t, src) {
    var s = gl.createShader(t);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  }
  function hex(str) {
    str = (str || '').trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m) { var v = parseInt(m[1], 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
    m = /rgba?\(([^)]+)\)/i.exec(str);
    if (m) { var q = m[1].split(/[\s,\/]+/).map(parseFloat); return [q[0] / 255, q[1] / 255, q[2] / 255]; }
    return [1, 1, 1];
  }

  /* ============================================================ */
  function mount(o) {
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var state = function (msg, bad) { if (o.onState) o.onState(msg, bad); };

    /* ---- 1. expand per-day counts into one particle per commit */
    var REPO = [
      { key: 'atlas', pid: 'atlas', name: 'Atlas' },
      { key: 'portal', pid: 'tvha', name: 'TVHA portal' },
      { key: 'browser', pid: 'browser', name: 'Quartz' }
    ];
    var rec = [];   // {d: dayIndex, r: repoIdx, i: index within day, n: that day's count}
    var perRepo = [0, 0, 0];
    REPO.forEach(function (R, ri) {
      var src = o.commits.projects[R.key];
      if (!src) return;
      var days = src.commits_per_day;
      for (var k in days) {
        if (!Object.prototype.hasOwnProperty.call(days, k)) continue;
        var n = days[k], di = dayIndex(k);
        for (var j = 0; j < n; j++) rec.push({ d: di, r: ri, i: j, n: n });
        perRepo[ri] += n;
      }
    });
    rec.sort(function (a, b) { return a.d - b.d || a.r - b.r || a.i - b.i; });

    var N = rec.length;
    var expected = o.commits.totals.total_commits;
    if (N !== expected) state('commits: ' + N + ' expanded, ' + expected + ' expected', true);

    var day = new Int16Array(N), repo = new Uint8Array(N), slot = new Uint16Array(N), dayN = new Uint16Array(N);
    for (var i = 0; i < N; i++) { day[i] = rec[i].d; repo[i] = rec[i].r; slot[i] = rec[i].i; dayN[i] = rec[i].n; }
    rec = null;

    var px = new Float32Array(N), py = new Float32Array(N);
    var vx = new Float32Array(N), vy = new Float32Array(N);
    var rxT = new Float32Array(N), ryT = new Float32Array(N);   // river targets
    var nxT = new Float32Array(N), nyT = new Float32Array(N);   // name targets
    var stiff = new Float32Array(N), delay = new Float32Array(N);
    var style = new Float32Array(N * 4);
    var posBuf = new Float32Array(N * 2);

    var jitX = new Float32Array(N), jitY = new Float32Array(N);
    var R = rng(20260916);
    for (i = 0; i < N; i++) {
      stiff[i] = 0.0105 + R() * 0.0085;
      delay[i] = (i / N) * 0.62 + R() * 0.16;
      jitX[i] = R() - 0.5;
      jitY[i] = R() - 0.5;
    }

    /* ---- 2. gl ------------------------------------------------ */
    var cvs = o.canvas, gl = null, prog, aPos, aStyle, uRes, uDpr, uAlpha, bPos, bStyle;
    var glOK = false, glErr = '';

    /* a reason is never allowed to be empty */
    function why(e, fallback) {
      var r = '';
      if (e) r = (e.message || (typeof e === 'string' ? e : '') || e.name || '').trim();
      return r || fallback || 'no reason reported';
    }

    /* The ground is CSS. A canvas that cannot paint is removed outright, so the
       browser can never draw a lost-context placeholder over the hero. */
    function retire() {
      try { cvs.classList.remove('is-live'); cvs.hidden = true; cvs.style.display = 'none'; } catch (e) {}
    }

    /* say so, loudly and in the page, and point at the plain register */
    function sceneDown(reason) {
      glErr = why(null, reason);
      retire();
      state('commit river: ' + glErr + '. The register below carries the same data.', true);
      var panel = document.getElementById('scene-down');
      if (panel) {
        panel.innerHTML = '';
        var b = document.createElement('b'); b.textContent = 'The commit river could not draw';
        var p1 = document.createElement('p');
        p1.textContent = 'All 34 projects, their dates and their state are written out in the register below — nothing is missing, only the picture.';
        var c = document.createElement('code'); c.textContent = 'Reason: ' + glErr;
        var a = document.createElement('a'); a.className = 'more'; a.href = '#h-reg';
        a.textContent = 'Go to the register';
        a.style.marginTop = '10px';
        panel.appendChild(b); panel.appendChild(p1); panel.appendChild(c); panel.appendChild(a);
        panel.hidden = false;
      }
      var note = document.getElementById('reg-down');
      if (note) {
        note.innerHTML = '';
        var s = document.createElement('b'); s.textContent = 'The commit river above could not draw. ';
        note.appendChild(s);
        note.appendChild(document.createTextNode(
          'This register is the same data: all 34 projects with their dates and state. Reason: ' + glErr + '.'));
        note.hidden = false;
      }
      reveal();
    }

    try {
      gl = cvs.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true })
        || cvs.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL context could not be created');
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
      gl.useProgram(prog);
      aPos = gl.getAttribLocation(prog, 'a_pos');
      aStyle = gl.getAttribLocation(prog, 'a_style');
      uRes = gl.getUniformLocation(prog, 'u_res');
      uDpr = gl.getUniformLocation(prog, 'u_dpr');
      uAlpha = gl.getUniformLocation(prog, 'u_alpha');
      bPos = gl.createBuffer(); bStyle = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
      gl.bufferData(gl.ARRAY_BUFFER, posBuf.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bStyle);
      gl.bufferData(gl.ARRAY_BUFFER, style.byteLength, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aStyle); gl.vertexAttribPointer(aStyle, 4, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      cvs.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault();
        glOK = false; running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        sceneDown('WebGL context lost');
      });
      glOK = true;
    } catch (e) {
      glErr = why(e, 'WebGL unavailable');
      glOK = false;
      // the DOM the panel writes into may not exist yet; report once mount() is built
    }

    /* ---- 3. geometry ------------------------------------------ */
    var W = 0, H = 0, dpr = 1;
    var rows = [];            // the three currents, deepest first
    var laneRow = [null, null, null];
    var padL = 0, padR = 0, riverTop = 0, riverBot = 0;

    function X(d) { return padL + (d / SPAN_DAYS) * (W - padL - padR); }

    /* Three currents share the band. The depth of each is its share of
       the commits, softened (a raw 2,720 : 210 : 246 split would leave
       the two small repositories a few pixels deep and unreadable), with
       a gap of still water between them so the three read as three. */
    function layoutRows() {
      var tot = perRepo[0] + perRepo[1] + perRepo[2] || 1;
      var wt = perRepo.map(function (n) { return Math.pow(n / tot, 0.42); });
      var wsum = wt[0] + wt[1] + wt[2];
      var riverH = riverBot - riverTop;
      var gap = Math.min(30, Math.max(10, riverH * 0.045));
      var body = riverH - gap * 2;
      rows = []; laneRow = [null, null, null];
      var y = riverTop;
      for (var i = 0; i < 3; i++) {
        var h = body * (wt[i] / wsum);
        var row = { i: i, y: y, h: h, cy: y + h / 2 };
        rows.push(row); laneRow[i] = row;
        y += h + gap;
      }
      return riverH / 3;
    }

    function riverTargets() {
      var dayW = (W - padL - padR) / SPAN_DAYS;
      for (var i = 0; i < N; i++) {
        var row = laneRow[repo[i]];
        if (!row) continue;
        var n = dayN[i], k = n > 1 ? (slot[i] / (n - 1) - 0.5) : 0;
        var amp = (row.h / 2 - 3) * Math.min(1, Math.sqrt(n / 70));
        var x = X(day[i]) + jitX[i] * Math.min(6, dayW * 1.5);
        // a slow meander so the current is a river, not a bar
        var wob = Math.sin(x * 0.0115 + row.cy * 0.07) * Math.min(3.5, row.h * 0.09);
        rxT[i] = x;
        ryT[i] = row.cy + wob + k * 2 * amp + jitY[i] * 2.2;
      }
    }

    /* glyph targets: sample the rendered <h1> from an offscreen canvas.
       The front page's name belongs to the night world now, so when no
       element is handed in the river simply skips its assemble phase. */
    function nameTargets() {
      if (!o.nameEl) return false;
      var el = o.nameEl, box = el.getBoundingClientRect(), host = o.root.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var ox = box.left - host.left, oy = box.top - host.top;
      var sc = Math.min(1, 1400 / Math.max(1, W));
      var c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(W * sc)); c.height = Math.max(2, Math.round(H * sc));
      var g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return false;
      g.scale(sc, sc);
      var fs = parseFloat(cs.fontSize) || 90;
      g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff';
      // reproduce the element's first-line baseline
      var lh = parseFloat(cs.lineHeight);
      if (!isFinite(lh)) lh = fs * 1.2;
      var m = g.measureText(el.textContent.trim());
      var asc = m.actualBoundingBoxAscent || fs * 0.72;
      var desc = m.actualBoundingBoxDescent || fs * 0.2;
      var baseline = oy + (lh - (asc + desc)) / 2 + asc;
      var ls = parseFloat(cs.letterSpacing);
      var txt = el.textContent.trim();
      if (isFinite(ls) && ls !== 0) {
        var cx = ox;
        for (var ci = 0; ci < txt.length; ci++) {
          g.fillText(txt[ci], cx, baseline);
          cx += g.measureText(txt[ci]).width + ls;
        }
      } else {
        g.fillText(txt, ox, baseline);
      }

      var img;
      try { img = g.getImageData(0, 0, c.width, c.height); } catch (e) { return false; }
      var data = img.data, cw = c.width, ch = c.height;
      var pts = [], step = 2;
      for (var y = 0; y < ch; y += step) {
        for (var x = 0; x < cw; x += step) {
          if (data[(y * cw + x) * 4 + 3] > 130) pts.push(x / sc, y / sc);
        }
      }
      var count = pts.length / 2;
      if (count < 40) return false;

      // sort glyph points left to right; particles are already in date order,
      // so the name is written in the order the commits were made.
      var order = new Array(count);
      for (var q = 0; q < count; q++) order[q] = q;
      order.sort(function (a, b) { return pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]; });

      var jr = rng(7717);
      for (var p = 0; p < N; p++) {
        var t = order[Math.min(count - 1, Math.floor(p / N * count))];
        nxT[p] = pts[t * 2] + (jr() - 0.5) * 2.2;
        nyT[p] = pts[t * 2 + 1] + (jr() - 0.5) * 2.2;
      }
      return true;
    }

    function readColours() {
      var cs = getComputedStyle(document.documentElement);
      var cols = [hex(cs.getPropertyValue('--lane-atlas')), hex(cs.getPropertyValue('--lane-portal')), hex(cs.getPropertyValue('--lane-browser'))];
      var sr = rng(5150);
      for (var i = 0; i < N; i++) {
        var c = cols[repo[i]];
        style[i * 4] = c[0]; style[i * 4 + 1] = c[1]; style[i * 4 + 2] = c[2];
        style[i * 4 + 3] = (repo[i] === 0 ? 2.9 : 3.5) + sr() * 1.6;
      }
      if (glOK) { gl.bindBuffer(gl.ARRAY_BUFFER, bStyle); gl.bufferData(gl.ARRAY_BUFFER, style, gl.STATIC_DRAW); }
    }

    /* ---- 4. sizing + build ------------------------------------ */
    var phase = 'boot', tPhase = 0, started = 0, settled = false, hasName = false, built = false;

    function resize() {
      var r = o.root.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(360, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      /* full bleed: the water runs off both edges of the screen, because
         the band is the picture and a picture does not sit in a margin */
      padL = 0; padR = 0;
      // the river starts under whatever the masthead actually occupies,
      // measured rather than guessed, so 320px and 1280px both hold.
      var top = o.subEl ? H * 0.34 : H * 0.07;
      if (o.subEl) {
        var sb = o.subEl.getBoundingClientRect(), hb = o.root.getBoundingClientRect();
        top = Math.max(top, sb.bottom - hb.top + 18);
      }
      riverTop = Math.min(top, H * 0.56);
      riverBot = H - (W < 860 ? 30 : 34);
      layoutRows();
      riverTargets();
      hasName = nameTargets();
      drawAxis();
      if (glOK) { gl.viewport(0, 0, cvs.width, cvs.height); gl.uniform2f(uRes, W, H); gl.uniform1f(uDpr, dpr); }
    }

    /* ---- 5. the calendar under the water --------------------- */
    function drawAxis() {
      if (!o.axis) return;
      o.axis.innerHTML = '';
      for (var m = 2; m <= 9; m++) {
        var d = (Date.UTC(YEAR, m, 1) - START) / DAY;
        var pc = X(d) / W * 100;
        var s = document.createElement('span');
        s.textContent = MON[m];
        s.style.left = pc.toFixed(3) + '%';
        /* the water runs off both edges now, so the first month sits on
           x 0 and the last near the right edge: centred on their ticks
           they would be cut in half by the screen. They hang off their
           own tick instead, and every month still reads in full. */
        if (pc < 3) { s.style.transform = 'translateX(3px)'; s.className = 'at-edge'; }
        else if (pc > 97) { s.style.transform = 'translateX(calc(-100% - 3px))'; s.className = 'at-edge at-edge--r'; }
        o.axis.appendChild(s);
      }
    }

    /* ---- 6. animation ----------------------------------------- */
    var stats = { frames: 0, total: 0, max: 0, last: 0 };
    var running = false, rafId = 0, prev = 0, visible = true;
    var ptr = { x: -1e4, y: -1e4, on: false, t: 0 };

    function seedStart() {
      var sr = rng(99173);
      for (var i = 0; i < N; i++) {
        var a = sr() * Math.PI * 2, rad = 0.25 + sr() * 0.85;
        px[i] = W * 0.5 + Math.cos(a) * W * 0.62 * rad;
        py[i] = H * 0.52 + Math.sin(a) * H * 0.70 * rad;
        vx[i] = 0; vy[i] = 0;
      }
    }

    function snapRiver() {
      for (var i = 0; i < N; i++) { px[i] = rxT[i]; py[i] = ryT[i]; vx[i] = 0; vy[i] = 0; }
    }

    function step(dt, tSec) {
      var maxV = 0, maxD = 0;
      var useName = (phase === 'assemble' || phase === 'hold');
      var relT = phase === 'river' ? tSec - tPhase : 0;
      var pr = ptr.on, mx = ptr.x, my = ptr.y, RAD = 96, RAD2 = RAD * RAD;

      for (var i = 0; i < N; i++) {
        var tx, ty;
        if (useName && hasName) { tx = nxT[i]; ty = nyT[i]; }
        else if (phase === 'river' && relT < delay[i]) { tx = hasName ? nxT[i] : rxT[i]; ty = hasName ? nyT[i] : ryT[i]; }
        else { tx = rxT[i]; ty = ryT[i]; }

        var dx = tx - px[i], dy = ty - py[i];
        var k = stiff[i];
        vx[i] += dx * k; vy[i] += dy * k;

        if (pr) {
          var ex = px[i] - mx, ey = py[i] - my, d2 = ex * ex + ey * ey;
          if (d2 < RAD2 && d2 > 0.5) {
            var d = Math.sqrt(d2), f = (1 - d / RAD);
            f = f * f * 3.4;
            vx[i] += ex / d * f; vy[i] += ey / d * f;
          }
        }
        vx[i] *= 0.902; vy[i] *= 0.902;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt;

        posBuf[i * 2] = px[i]; posBuf[i * 2 + 1] = py[i];
        var sp = vx[i] * vx[i] + vy[i] * vy[i]; if (sp > maxV) maxV = sp;
        var dd = dx * dx + dy * dy; if (dd > maxD) maxD = dd;
      }
      return { v: Math.sqrt(maxV), d: Math.sqrt(maxD) };
    }

    function draw(alpha) {
      if (!glOK) return;
      try {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uAlpha, alpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, posBuf);
        gl.drawArrays(gl.POINTS, 0, N);
      } catch (e) {
        glOK = false; running = false;
        sceneDown(why(e, 'the WebGL draw call failed'));
        return;
      }
      cvs.classList.add('is-live');     // only shown once it has really painted
    }

    function reveal() {
      [o.nameEl, o.subEl, o.tallyEl].forEach(function (e) { if (e) e.classList.add('on'); });
    }

    function frame(now) {
      rafId = 0;
      var t0 = performance.now();
      var tSec = (now - started) / 1000;
      // fixed 60 Hz sub-steps: a slow frame must not destabilise the springs
      var steps = Math.max(1, Math.min(3, Math.round((now - prev) / 16.667) || 1));
      prev = now;

      if (ptr.on && now - ptr.t > 900) ptr.on = false;

      var m;
      for (var s = 0; s < steps; s++) m = step(1, tSec);

      if (phase === 'assemble' && (tSec > 3.0 || (m.v < 0.05 && m.d < 1.1 && tSec > 1.2))) {
        phase = 'hold'; tPhase = tSec;
      } else if (phase === 'hold' && tSec - tPhase > 1.2) {
        phase = 'river'; tPhase = tSec;
        reveal();
        state(N.toLocaleString('en-GB') + ' commits · flowing into the timeline…');
        var ir = rng(3311);
        for (var i = 0; i < N; i++) { vx[i] += (ir() - 0.3) * 1.6; vy[i] += ir() * 2.4 + 0.4; }
      } else if (phase === 'river' && tSec - tPhase > 1.4 &&
                 ((m.v < 0.05 && m.d < 0.8 && !ptr.on) || tSec - tPhase > 5.5)) {
        snapRiver();
        for (var j = 0; j < N; j++) { posBuf[j * 2] = px[j]; posBuf[j * 2 + 1] = py[j]; }
        phase = 'settled'; settled = true;
      }

      draw(phase === 'assemble' || phase === 'hold' ? 0.92 : 0.8);

      var cost = performance.now() - t0;
      stats.frames++; stats.total += cost; stats.last = cost;
      if (cost > stats.max) stats.max = cost;
      window.__riverStats = {
        frames: stats.frames, avgMs: +(stats.total / stats.frames).toFixed(3),
        maxMs: +stats.max.toFixed(3), lastMs: +cost.toFixed(3), particles: N, settled: settled
      };

      if (phase === 'settled') {
        running = false;
        /* frame costs belong in a report, not on the page; window.__riverStats
           above still carries them for anyone measuring. */
        state(N.toLocaleString('en-GB') + ' commits');
        return;
      }
      if (!visible) { running = false; return; }
      rafId = requestAnimationFrame(frame);
    }

    function wake() {
      if (!built) return;              // nothing starts before build() has chosen a path
      if (settled && !ptr.on) return;
      if (running || !visible || !glOK) return;
      running = true; prev = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    function kick() {                       // pointer disturbed the settled river
      if (!glOK) return;
      if (phase === 'settled') { phase = 'river'; tPhase = (performance.now() - started) / 1000 - 3; settled = false; }
      wake();
    }

    /* ---- 7. go ------------------------------------------------- */
    function build() {
      resize();
      readColours();
      if (!glOK) {
        sceneDown(glErr || 'WebGL unavailable');
        return;
      }
      if (reduced) {
        snapRiver();
        for (var i = 0; i < N; i++) { posBuf[i * 2] = px[i]; posBuf[i * 2 + 1] = py[i]; }
        phase = 'settled'; settled = true;
        draw(0.8);
        reveal();
        built = true;
        state(N.toLocaleString('en-GB') + ' commits · still frame (reduced motion)');
        return;
      }
      seedStart();
      started = performance.now(); prev = started;
      built = true;
      if (hasName) {
        phase = 'assemble';
        state(N.toLocaleString('en-GB') + ' commits assembling…');
      } else {
        /* no name to assemble: the marks scatter in and run straight
           into the timeline, which is the only shape this band has */
        phase = 'river'; tPhase = 0;
        reveal();
        state(N.toLocaleString('en-GB') + ' commits · flowing into the timeline…');
      }
      running = true; rafId = requestAnimationFrame(frame);
    }

    /* the day under the pointer, from the same per-day counts the marks came from */
    var perDay = [null, null, null];
    (function () {
      var keys = ['atlas', 'portal', 'browser'];
      keys.forEach(function (k, ri) {
        var src = o.commits.projects[k];
        if (!src) return;
        var m = {};
        for (var d in src.commits_per_day) {
          if (Object.prototype.hasOwnProperty.call(src.commits_per_day, d)) m[dayIndex(d)] = { n: src.commits_per_day[d], iso: d };
        }
        perDay[ri] = m;
      });
    })();

    function readAt(px2, py2) {
      if (!rows.length || !settled) return null;
      var row = null, ri = -1;
      for (var i = 0; i < 3; i++) {
        var r = laneRow[i];
        if (r && py2 >= r.y && py2 <= r.y + r.h) { row = r; ri = i; break; }
      }
      if (!row) return null;
      var d = Math.round(((px2 - padL) / (W - padL - padR)) * SPAN_DAYS);
      var hit = perDay[ri] && perDay[ri][d];
      if (!hit) {
        for (var k = 1; k <= 2 && !hit; k++) {
          hit = (perDay[ri] && (perDay[ri][d - k] || perDay[ri][d + k])) || null;
          if (hit) d = perDay[ri][d - k] ? d - k : d + k;
        }
      }
      if (!hit) return null;
      return { row: row, repo: ROPE[ri], n: hit.n, iso: hit.iso, x: X(d), y: row.cy };
    }
    var ROPE = ['Atlas', 'The academy portal', 'Quartz'];

    function showDay(info, cx) {
      if (!o.tip) return;
      if (!info) { o.tip.classList.remove('on'); return; }
      var host = o.root.getBoundingClientRect();
      o.tip.innerHTML = '';
      var b = document.createElement('b');
      b.textContent = info.n + (info.n === 1 ? ' commit' : ' commits');
      var s2 = document.createElement('span');
      s2.textContent = info.repo + ' · ' + info.iso;
      var e2 = document.createElement('em');
      e2.textContent = 'one mark in the river for each of them';
      o.tip.appendChild(b); o.tip.appendChild(s2); o.tip.appendChild(e2);
      o.tip.classList.add('on');
      var tw = o.tip.offsetWidth || 220;
      o.tip.style.left = Math.max(8, Math.min(host.width - tw - 8, info.x - tw / 2)) + 'px';
      o.tip.style.top = Math.max(8, info.y - o.tip.offsetHeight - 14) + 'px';
    }

    /* pointer */
    o.root.addEventListener('pointermove', function (e) {
      if (reduced) return;
      var r = o.root.getBoundingClientRect();
      ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true; ptr.t = performance.now();
      if (settled) showDay(readAt(ptr.x, ptr.y));
      kick();
    });
    o.root.addEventListener('pointerleave', function () { ptr.on = false; showDay(null); });

    /* off-screen: stop the loop */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !settled) wake();
        else if (!visible && rafId) { cancelAnimationFrame(rafId); rafId = 0; running = false; }
      }, { threshold: 0 }).observe(o.root);
    }

    /* resize */
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var wasSettled = settled;
        resize();
        if (wasSettled || reduced || !glOK) {
          snapRiver();
          for (var i = 0; i < N; i++) { posBuf[i * 2] = px[i]; posBuf[i * 2 + 1] = py[i]; }
          draw(0.8);
        } else wake();
      }, 180);
    });

    document.addEventListener('inkthemechange', function () {
      readColours();
      if (settled || reduced) draw(0.8); else wake();
    });

    return {
      build: build, reduced: reduced, glOK: function () { return glOK; },
      counts: { total: N, perRepo: perRepo }, stats: function () { return stats; }
    };
  }

  window.CommitRiver = { mount: mount, dayIndex: dayIndex, human: human, START: START, END: END, TODAY: TODAY, SPAN_DAYS: SPAN_DAYS };
})();
