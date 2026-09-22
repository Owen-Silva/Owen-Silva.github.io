/* ============================================================
   browser.js — the browser page.

   1. The window. The phone is a window cut into the same night:
      one second of the real stream fills the glass, 59 frames,
      and the five stages that carry a frame there are marked
      down its edge. Every figure is measured.
   2. The three measured CPU fixes, as instruments.
   3. The browsable index of the 67 documented features.

   Built on js/scene.js: DPR capped at 2, the scene starts when it
   scrolls into view, the loop stops the moment it settles, a still
   frame under reduced motion, and a visible reason if it cannot
   draw. Own canvas, no library.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;
  var S = window.Scene;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(n, a) {
    var e = document.createElementNS(SVGNS, n);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    return e;
  }
  function css(name, fallback) {
    return (S && S.css) ? S.css(name, fallback)
      : (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback || '#888');
  }
  /* a theme colour at an alpha, so gradients can fade into the night */
  function alpha(colour, a) {
    var c = String(colour || '').trim();
    var m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' +
             parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    var r = c.match(/^rgba?\(([^)]+)\)/);
    if (r) {
      var p = r[1].split(',');
      return 'rgba(' + (+p[0]) + ',' + (+p[1]) + ',' + (+p[2]) + ',' + a + ')';
    }
    return c;
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* every string below is a measured figure from the project's own write-up */
  var STAGES = [
    { id: 'phone', name: 'Android', fig: 'the handset', note: 'mirrored and fully controlled' },
    { id: 'adb', name: 'adb', fig: '~170 ms', note: 'to time adb itself, even on a 7 ms link' },
    { id: 'scrcpy', name: 'scrcpy', fig: 'the stream', note: 'quality follows a TCP round-trip probe' },
    { id: 'decode', name: 'WebCodecs', fig: '~1 ms / frame', note: 'decoded in the page' },
    { id: 'paint', name: 'Canvas', fig: '~59 fps', note: 'painted from the decoder callback' }
  ];
  var FPS = 59;
  var DROPPED = Math.round(FPS / 4);     // "a quarter of frames" — 15 of 59

  /* ============================================================
     1. THE STANDING SECOND — one second of the phone as a column
     of light down the edge of the glass.

     The column runs off the top of the frame and off the bottom,
     so what the first screen holds is a piece of something taller
     than the window: 59 marks, one for every frame the handset
     sent in a second, and the 15 that used to arrive too late
     standing out of line inside the glass. Beyond the edge the
     night is the glass itself — a veil, a spill of light and one
     long sheen — and it carries the end of the page's own name.
     No rim, no frame, no device: one lit edge and what it lights.
     ============================================================ */
  function windowScene() {
    var host = document.getElementById('pipe-scene');
    var svg = document.getElementById('pipe-svg');
    var cvs = document.getElementById('pipe-canvas');
    if (!host || !svg || !cvs) return;
    var report = I.reporter('pipe-state');
    if (!S) { report('the standing second needs js/scene.js, which did not load. Every figure it shows is written out below.', true, 'pipe'); return; }
    var L = {};
    var LATE_EVERY = Math.round(FPS / DROPPED);   /* every 4th mark — 15 of the 59 */

    function place(g) {
      var W = g.W, H = g.H;
      /* 901 is where the stylesheet splits the hero — words left, glass
         right. Below it the words sit ABOVE the scene and the scene owns
         the width, so the switch follows the viewport, not this canvas.
         Above it the canvas starts a third of the way across the window
         (.band-hero--wide > .pane), so the edge is placed in VIEWPORT
         coordinates and brought back into the canvas, whatever the canvas
         happens to be. 0.55 of the window used to fall just past the end
         of the name; since the name grew to reach the right gutter (D7)
         it falls inside the w of "browser" instead, and the last third of
         the word is what the glass carries. The edge is the drawing's
         composition, not the name's: pushing it far enough right to clear
         a 1,176 px name would put the column at 87 % of the window. */
      var vw = window.innerWidth || W;
      var narrow = vw < 901, tiny = vw < 520;
      var hr = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0 };
      var offs = narrow ? 0 : Math.round(hr.left);
      var edge = Math.round(Math.min(W - 40, Math.max(28, vw * (narrow ? 0.5 : 0.55) - offs)));
      var over = Math.round(Math.max(30, H * 0.06));   /* it leaves the frame */
      var pad = narrow ? 16 : 0;
      var cell = tiny ? 10 : narrow ? 13 : 19;
      L = {
        W: W, H: H, narrow: narrow, tiny: tiny, pad: pad,
        edge: edge, top: -over, bot: H + over,
        seg: (H + over * 2) / FPS,
        cell: cell,
        spill: narrow ? (W - edge) : Math.min(W - edge, 660),
        lift: Math.round(cell * 1.3),                   /* a late frame stands out of line */
        /* the label stands ON the glass, right of the strip: the words
           column is busy and the glass is the empty half of the frame */
        lab: {
          x: edge + cell + (narrow ? 14 : 22), anchor: 'start',
          y: Math.round(H * (narrow ? 0.12 : 0.52)),
          room: Math.max(110, W - edge - cell - (narrow ? 46 : 60))
        }
      };
    }

    /* wrap to a measured width using the real face, never a guess.
       measureText knows nothing about letter-spacing, and these labels
       are tracked, so the tracking is added back per character or the
       last line runs off the frame on a handset. */
    function wrap(ctx, text, font, size, maxW, maxLines, track) {
      if (ctx) { ctx.save(); ctx.font = font; }
      function width(s) {
        var w = ctx ? ctx.measureText(s).width : s.length * size * 0.62;
        return w + s.length * size * (track || 0);
      }
      var words = String(text).split(' '), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var next = line ? line + ' ' + words[i] : words[i];
        if (width(next) > maxW && line) { lines.push(line); line = words[i]; }
        else line = next;
      }
      if (line) lines.push(line);
      if (ctx) ctx.restore();
      return lines.slice(0, maxLines || 2);
    }

    /* the one label group: small type standing against the big form */
    function layout(g) {
      place(g);
      var ctx = g.ctx;
      var mono = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
      var s1 = L.tiny ? 11 : L.narrow ? 11.5 : 12.4;   /* the micro scale, never below 10 */
      var s2 = L.tiny ? 10.5 : L.narrow ? 10.5 : 11;
      var y = L.lab.y;

      var t1 = el('text', {
        x: L.lab.x, y: y, 'text-anchor': L.lab.anchor,
        style: 'font-family:var(--mono);font-size:' + s1 +
               'px;letter-spacing:.15em;fill:var(--ink-low)'
      });
      t1.textContent = 'ONE SECOND';
      svg.appendChild(t1);

      var rows = [
        { text: FPS + ' FRAMES FROM THE PHONE', fill: 'var(--ink-mid)' },
        { text: DROPPED + ' USED TO ARRIVE LATE', fill: 'var(--ink-faint)' }
      ];
      var ly = y + (L.tiny ? 17 : 19);
      rows.forEach(function (row) {
        var lines = wrap(ctx, row.text, '400 ' + s2 + 'px ' + mono, s2, L.lab.room, 2, 0.09);
        var t = el('text', {
          x: L.lab.x, 'text-anchor': L.lab.anchor,
          style: 'font-family:var(--mono);font-size:' + s2 +
                 'px;letter-spacing:.09em;fill:' + row.fill
        });
        lines.forEach(function (ln) {
          var sp = el('tspan', { x: L.lab.x, y: ly });
          sp.textContent = ln;
          t.appendChild(sp);
          ly += s2 + 4.5;
        });
        svg.appendChild(t);
        ly += 3;
      });
    }

    /* the glass the edge lights: a veil, a spill and one long sheen.
       It has no rim and no corners — it leaves the frame on three sides,
       and the page's own name carries on into it. */
    function pane(g, t) {
      var ctx = g.ctx, W = L.W, H = L.H, x = L.edge;
      var ink = css('--ink-hi'), deep = css('--ground-deep');

      /* the veil: strongest where the name runs into it, gone well before
         the ground, so the world's own lit edge is never covered by it */
      var veil = ctx.createLinearGradient(0, 0, 0, H * 0.82);
      veil.addColorStop(0, alpha(deep, .34));
      veil.addColorStop(.55, alpha(deep, .2));
      veil.addColorStop(1, alpha(deep, 0));
      ctx.fillStyle = veil;
      ctx.fillRect(x, 0, W - x, H * 0.82);

      /* the sheen: one soft band raking across the glass */
      var sh = ctx.createLinearGradient(x, H, W, 0);
      sh.addColorStop(0, alpha(ink, 0));
      sh.addColorStop(.42, alpha(ink, .028 * t));
      sh.addColorStop(.62, alpha(ink, .012 * t));
      sh.addColorStop(1, alpha(ink, 0));
      ctx.fillStyle = sh;
      ctx.fillRect(x, 0, W - x, H);

      /* the spill: the light the edge throws onto the glass */
      var sp = ctx.createLinearGradient(x, 0, x + L.spill, 0);
      sp.addColorStop(0, alpha(ink, .105 * t));
      sp.addColorStop(.22, alpha(ink, .04 * t));
      sp.addColorStop(.6, alpha(ink, .012 * t));
      sp.addColorStop(1, alpha(ink, 0));
      ctx.fillStyle = sp;
      ctx.fillRect(x, 0, L.spill, H);

      /* and the little of it that passes back out into the night */
      var back = ctx.createLinearGradient(x - 120, 0, x, 0);
      back.addColorStop(0, alpha(ink, 0));
      back.addColorStop(1, alpha(ink, .055 * t));
      ctx.fillStyle = back;
      ctx.fillRect(x - 120, 0, 120, H);
    }

    /* one second, standing up: 59 marks down the edge */
    function column(g, t, live) {
      var ctx = g.ctx, x = L.edge, ink = css('--ink-hi'), c = L.cell;
      var arrived = Math.min(FPS - 1, Math.floor(t * FPS));
      var gap = Math.max(2.4, L.seg * 0.26);
      var hgt = Math.max(3, L.seg - gap);

      /* the whole column glows a little, so it reads as light and not as ticks */
      var bl = ctx.createLinearGradient(x - c * 2.6, 0, x + c * 2.6, 0);
      bl.addColorStop(0, alpha(ink, 0));
      bl.addColorStop(.5, alpha(ink, .1 * (0.35 + 0.65 * t)));
      bl.addColorStop(1, alpha(ink, 0));
      ctx.fillStyle = bl;
      ctx.fillRect(x - c * 2.6, L.top, c * 5.2, L.bot - L.top);

      for (var k = 0; k <= arrived; k++) {
        var y = L.top + k * L.seg;
        var late = (k % LATE_EVERY === 0);
        var age = (arrived - k) / 18;
        var fresh = live ? Math.max(0, 1 - age) : 0;
        if (late) {
          /* out of line, inside the glass: the quarter that used to be late */
          ctx.fillStyle = alpha(ink, .16 + fresh * .3);
          ctx.fillRect(x + L.lift, y + hgt * 0.14, c * 0.5, hgt * 0.72);
        } else {
          ctx.fillStyle = alpha(ink, .62 + fresh * .33);
          ctx.fillRect(x - c / 2, y, c, hgt);
        }
      }

      /* the frame landing right now — the one live thing in the frame */
      if (live && t < 1) {
        var hy = L.top + arrived * L.seg + hgt / 2;
        var rad = c * 5;
        var halo = ctx.createRadialGradient(x, hy, 0, x, hy, rad);
        halo.addColorStop(0, alpha(ink, .22));
        halo.addColorStop(1, alpha(ink, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(x - rad, hy - rad, rad * 2, rad * 2);
        var land = ctx.createLinearGradient(x, 0, x + rad * 2.4, 0);
        land.addColorStop(0, alpha(ink, .5));
        land.addColorStop(1, alpha(ink, 0));
        ctx.fillStyle = land;
        ctx.fillRect(x, hy - 0.5, rad * 2.4, 1);
      }
    }

    var sc = S.make({
      host: host, canvas: cvs, svg: svg, id: 'pipe', report: report, channel: 'pipe',
      label: 'the standing second', duration: 2600,
      layout: layout,
      frame: function (g, t) { var e = ease(t); pane(g, e); column(g, e, true); return false; },
      still: function (g) { pane(g, 1); column(g, 1, false); }
    });

    /* the glass is nearer than the sky: it moves a little more than the world */
    if (window.InkScene && !window.InkScene.reduced && !window.InkScene.phone) {
      try { window.InkScene.layer(host, 0.07, { mode: 'viewport', max: 54 }); } catch (e) {}
    }

    /* the faces decide where a label wraps, so lay out again once they land */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        try { if (sc.relayout && sc.relayout() && sc.settled && sc.settled()) sc.still(); } catch (e) {}
      });
    }

  }

  /* The written twin of the scene. It is filled whatever happens to the
     canvas, so the five stages and their figures are never only a drawing. */
  function stagesAsText() {
    var cap = document.getElementById('pipe-cap');
    if (cap) {
      cap.textContent = FPS + ' frames — one second. ' + DROPPED +
        ' of them, a quarter, used to arrive too late.';
    }
    var list = document.getElementById('pipe-list');
    if (list) {
      list.innerHTML = '';
      STAGES.forEach(function (s) {
        var li = document.createElement('li');
        var b = document.createElement('b'); b.textContent = s.name + ' — ' + s.fig + '. ';
        li.appendChild(b);
        li.appendChild(document.createTextNode(s.note.charAt(0).toUpperCase() + s.note.slice(1) + '.'));
        list.appendChild(li);
      });
    }
  }

  /* ============================================================
     2. THE MEASURED CPU FIXES — three instruments, full width
     ============================================================ */
  var METERS = [
    { n: 'Animated background', from: 27, to: 3, unit: '% of a core', max: 30,
      d: 'A drifting aurora under a backdrop filter cost 27% of a core for the window chrome alone. Stepped and rebuilt as transforms, it draws for 3%.' },
    { n: 'Stats sampling', from: 4.7, to: 0.35, unit: '% of a core', max: 30,
      d: 'The live CPU, memory, disk and network readouts on the new tab page went from 4.7% of a core to 0.35%.' },
    { n: 'Cold start', from: null, to: 550, unit: ' ms', max: 900,
      d: 'About 550 ms from launch to a usable window. Hidden workspaces sleep, which is what fixed a 1.9 GB GPU process.' }
  ];

  function cpuScene() {
    var host = document.getElementById('cpu-pane');
    var svg = document.getElementById('cpu-svg');
    var cvs = document.getElementById('cpu-cv');
    if (!host || !svg || !cvs) return;
    var report = I.reporter('cpu-state');
    if (!S) { report('the three meters need js/scene.js, which did not load. Every figure is written out beside them.', true, 'cpu'); say(-1); return; }
    var L = {}, hot = -1;

    function layout(g) {
      var W = g.W, H = g.H, narrow = W < 700;
      var pad = Math.round(Math.max(16, Math.min(78, W * 0.055)));
      L.x0 = pad + (narrow ? 0 : 190);
      L.x1 = W - pad - (narrow ? 0 : 128);
      L.top = narrow ? 58 : 74;
      L.gap = (H - L.top - (narrow ? 26 : 34)) / METERS.length;
      L.rows = METERS.map(function (_, i) { return Math.round(L.top + (i + 0.5) * L.gap); });
      L.narrow = narrow; L.pad = pad; L.h = narrow ? 9 : 12;

      var headY = narrow ? 26 : 34;
      var head = el('text', {
        x: pad, y: headY,
        style: 'font-family:var(--mono);font-size:10px;letter-spacing:.16em;fill:var(--ink-faint)'
      });
      /* one line wherever there is room for it; on a handset the frame is too
         narrow to hold it and it was cut at the edge, so it breaks at the dash */
      var HEAD = ['MEASURED BEFORE AND AFTER — ', 'LOWER IS BETTER'];
      if (W - pad * 2 < 330) {
        HEAD.forEach(function (ln, i) {
          var sp = el('tspan', { x: pad, y: headY + i * 13 });
          sp.textContent = ln;
          head.appendChild(sp);
        });
      } else {
        head.textContent = HEAD.join('');
      }
      svg.appendChild(head);

      METERS.forEach(function (m, i) {
        var y = L.rows[i];
        var grp = el('g', { tabindex: '0', role: 'button', 'data-i': i, 'aria-label': m.n + '. ' + m.d });
        /* on a phone the whole label stack stands above the bar, so the hit
           area rides up with it and still takes the name in */
        grp.appendChild(el('rect', {
          x: pad - 8, y: y - Math.round(L.gap / 2) + (narrow ? -6 : 4), width: W - pad * 2 + 16,
          height: Math.round(L.gap) - 8, fill: 'transparent'
        }));
        var t = el('text', {
          x: narrow ? pad : L.x0 - 18, y: narrow ? y - 29 : y + 4.6,
          'text-anchor': narrow ? 'start' : 'end',
          style: 'font-family:var(--body);font-size:' + (narrow ? 12.5 : 14) +
                 'px;font-weight:600;fill:var(--ink-hi)'
        });
        t.textContent = m.n;
        grp.appendChild(t);
        var v = el('text', {
          x: W - pad, y: narrow ? y - 29 : y + 5, 'text-anchor': 'end',
          style: 'font-family:var(--mono);font-size:' + (narrow ? 11 : 13) + 'px;fill:var(--ink-hi)'
        });
        v.textContent = m.to + m.unit;
        grp.appendChild(v);
        if (m.from != null) {
          var f = el('text', {
            x: narrow ? pad : L.x0 - 18, y: narrow ? y - 12 : y + 21,
            'text-anchor': narrow ? 'start' : 'end',
            /* floor: 9.6px sat under the name and read as dust at every
               width, so both layouts carry it on the micro scale now */
            style: 'font-family:var(--mono);font-size:' + (narrow ? 10.5 : 12.4) +
                   'px;letter-spacing:.06em;fill:var(--ink-faint)'
          });
          f.textContent = 'was ' + m.from + m.unit;
          grp.appendChild(f);
        }
        svg.appendChild(grp);
      });
    }

    function draw(g, p) {
      var ctx = g.ctx;
      var h = L.h;
      METERS.forEach(function (m, i) {
        var y = L.rows[i], w = L.x1 - L.x0;
        var dim = hot >= 0 && hot !== i;
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.fillStyle = css('--rule');
        ctx.fillRect(L.x0, y - h / 2, w, h);
        if (m.from != null) {
          // where it used to be — a ghost with a hairline cap
          var fw = w * (m.from / m.max);
          ctx.fillStyle = css('--rule-strong');
          ctx.globalAlpha = dim ? 0.18 : 0.5;
          ctx.fillRect(L.x0, y - h / 2, fw, h);
          ctx.globalAlpha = dim ? 0.3 : 1;
          ctx.strokeStyle = css('--ink-faint'); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(L.x0 + fw + 0.5, y - h); ctx.lineTo(L.x0 + fw + 0.5, y + h); ctx.stroke();
        }
        // where it is now, arriving from where it was.
        // Cream, not vermilion: three long accent bars mid-page were the
        // loudest warm thing on a page whose one warm thing is the
        // horizon (the previous lane left this open). The ghost stays
        // grey, so the pair still reads as before-and-after.
        var start = m.from == null ? m.max : m.from;
        var val = lerp(start, m.to, p);
        ctx.fillStyle = css('--ink-hi');
        ctx.globalAlpha = dim ? 0.3 : 0.78;
        ctx.fillRect(L.x0, y - h / 2, w * (val / m.max), h);
        ctx.globalAlpha = 1;
      });
    }

    var sc = S.make({
      host: host, canvas: cvs, svg: svg, id: 'cpu', report: report, channel: 'cpu',
      label: 'three measured fixes', duration: 1500,
      layout: layout,
      frame: function (g, t) { draw(g, ease(t)); return false; },
      still: function (g) { draw(g, 1); }
    });

    function say(i) {
      hot = i;
      if (sc && sc.paint) sc.paint(1);
      var out = document.getElementById('cpu-read');
      if (!out) return;
      out.innerHTML = '';
      var a = document.createElement('span'); a.className = 'k';
      var b = document.createElement('b');
      var p = document.createElement('p');
      if (i < 0) {
        a.textContent = 'Three fixes';
        b.textContent = 'All three were measured, not estimated';
        p.textContent = 'The ghosted bar is where each one started; the solid bar is where it ended. Point at a row for what changed.';
      } else {
        var m = METERS[i];
        a.textContent = m.from == null ? 'Measured' : m.from + m.unit + ' → ' + m.to + m.unit;
        b.textContent = m.n;
        p.textContent = m.d;
      }
      out.appendChild(a); out.appendChild(b); out.appendChild(p);
    }

    host.addEventListener('pointerover', function (e) {
      var g = e.target.closest && e.target.closest('g[data-i]');
      say(g ? +g.getAttribute('data-i') : -1);
    });
    host.addEventListener('pointerleave', function () { say(-1); });
    host.addEventListener('focusin', function (e) {
      var g = e.target.closest && e.target.closest('g[data-i]');
      if (g) say(+g.getAttribute('data-i'));
    });
    host.addEventListener('focusout', function () { say(-1); });
    say(-1);
  }

  /* ============================================================
     3. THE 67 FEATURES — one long list, README order
     ============================================================ */

  /* The JSON is the README, read once and withheld where it named a
     private address. Nothing here invents what was taken out: the
     clause that carried it goes, and the sentence closes over it. */
  function tidy(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('[removed]') >= 0) {
      s = s.replace(/\s*\([^()]*\[removed\][^()]*\)/g, '');
      s = s.replace(/\s+(?:at|on|in|over|from|to|via)\s+\[removed\]/g, '');
    }
    if (s.indexOf('[removed]') >= 0) {
      var keep = s.split('. ').filter(function (part) { return part.indexOf('[removed]') < 0; });
      s = keep.join('. ');
    }
    if (s.indexOf('[removed]') >= 0) s = s.replace(/\[removed\]/g, '');
    return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  }

  /* The README writes each feature as one sentence that opens with its
     name. The JSON splits that sentence in two, so a description can
     begin mid-clause — ", down the same rail:". Put the sentence back
     together the way the README had it. */
  function lead(name, desc) {
    var c = desc.charAt(0);
    if (/[,;:.–—)]/.test(c)) return { b: name, rest: desc };
    if (c === '(' || (c && c === c.toLowerCase() && c !== c.toUpperCase())) return { b: name, rest: ' ' + desc };
    return { b: name + '.', rest: ' ' + desc };
  }

  function features() {
    var host = document.getElementById('feat-list');
    if (!host) return;
    I.loadJSON('data/browser-features.json').then(function (data) {
      var items = data.features.map(function (f) {
        var d = tidy(f.description);
        return { index: f.index, name: f.name, desc: d, hay: (f.name + ' ' + d).toLowerCase() };
      });
      var count = document.getElementById('feat-count');
      var q = document.getElementById('feat-q');
      var order = document.getElementById('feat-order');
      var az = false;

      if (items.length !== data.feature_count) {
        var w = document.createElement('p');
        w.className = 'note';
        w.textContent = 'Feature count disagrees: ' + items.length + ' listed, ' + data.feature_count + ' expected.';
        host.parentNode.insertBefore(w, host);
      }

      function render() {
        var rows = items.slice();
        if (az) rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
        else rows.sort(function (a, b) { return a.index - b.index; });
        var frag = document.createDocumentFragment();
        rows.forEach(function (f) {
          var d = document.createElement('div');
          d.className = 'fx';
          d.id = 'f-' + f.index;
          d.setAttribute('data-hay', f.hay);
          var n = document.createElement('span');
          n.className = 'fx__n';
          n.textContent = String(f.index).padStart(2, '0');
          var p = document.createElement('p');
          p.className = 'fx__t';
          var parts = lead(f.name, f.desc);
          var b = document.createElement('b');
          b.textContent = parts.b;
          p.appendChild(b);
          p.appendChild(document.createTextNode(parts.rest));
          d.appendChild(n); d.appendChild(p);
          frag.appendChild(d);
        });
        host.innerHTML = '';
        host.appendChild(frag);
        filter();
      }

      function filter() {
        var term = (q && q.value || '').trim().toLowerCase();
        var shown = 0;
        [].forEach.call(host.children, function (d) {
          var ok = !term || d.getAttribute('data-hay').indexOf(term) >= 0;
          d.hidden = !ok;
          if (ok) shown++;
        });
        if (count) {
          count.textContent = term
            ? shown + ' of ' + items.length + ' features match “' + term + '”'
            : items.length + ' features, in the order the README documents them';
        }
      }

      if (q) q.addEventListener('input', filter);
      if (order) order.addEventListener('click', function () {
        az = !az;
        order.setAttribute('aria-pressed', String(az));
        order.textContent = az ? 'README order' : 'A–Z';
        render();
      });
      render();
    }).catch(function (e) {
      I.fail('The feature list', e, host.parentNode);
    });
  }

  function boot() {
    var cv = document.getElementById('page-wash');
    if (cv && window.InkWash) {
      var w = window.InkWash.create(cv, {
        seed: 2.9, maxPixels: 760, amp: 0.55,
        onState: function (m, b) { I.reporter('pipe-state')(m, b, 'wash'); }
      });
      var t = 0;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(w.repaint, 240); });
      document.addEventListener('inkthemechange', function () { setTimeout(w.repaint, 20); });
    }
    stagesAsText();
    windowScene();
    cpuScene();
    features();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
