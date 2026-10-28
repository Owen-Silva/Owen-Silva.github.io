/* ============================================================
   index-extra.js — two more rendered moments on the front page.

   1. The tally, counted out. Each figure is drawn as that many
      individual marks, read from the same JSON the river reads,
      so 3,612 is three thousand six hundred and twelve marks
      and not a number in a box.
   2. Three live miniatures — the opening scene of each of the
      three project pages, drawn small, as the link to it.
   ============================================================ */
(function () {
  'use strict';
  var S = window.Scene, I = window.Ink;
  var el = S.el, css = S.css;
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* ---------- 1. the tally, as marks ---------- */
  function counted(data) {
    var host = document.getElementById('count-pane');
    if (!host) return;
    var svg = document.getElementById('count-svg');
    var cvs = document.getElementById('count-cv');
    var report = I.reporter('count-state');

    var GROUPS = [
      { n: data.commits, label: 'commits', sub: 'across Atlas, the portal and Quartz', hot: true },
      { n: data.projects, label: 'projects', sub: 'since March 2026' },
      { n: data.tools, label: 'tools', sub: 'I use every week' },
      { n: data.live, label: 'live', sub: 'on the public web' }
    ];
    var L = {};

    function layout(g) {
      var W = g.W, H = g.H, narrow = W < 720;
      var pad = narrow ? 12 : 22;
      /* The commit block takes the room it needs and the rest share what is
         left — but no column may be narrower than the word under it, or the
         word shrinks out of the caption size to fit. These two splits are
         the ones where all four words fit at 1280 and at 320. */
      var share = narrow ? [0.42, 0.22, 0.17, 0.19] : [0.60, 0.13, 0.12, 0.15];
      var x = pad;
      L.cols = GROUPS.map(function (grp, i) {
        var w = (W - pad * 2 - 18 * 3) * share[i];
        var c = { x: x, w: w };
        x += w + 18;
        return c;
      });
      L.top = narrow ? 26 : 32;
      L.bot = H - (narrow ? 42 : 40);
      L.narrow = narrow;

      /* Every word here is a caption and reads at the caption size: ink.css
         floors all .ink-svg text at 10px, which was 2.4px under the site's
         micro scale, so index.html sets #count-svg text to var(--t-micro)
         and the font-size attributes that used to be written here were dead
         under it anyway. What the sizes cost is room, so each word is
         measured after it is drawn and kept inside its own column — the
         hand-nudge PROJECTS needed at 320 is gone with it. */
      function width(t) { try { return t.getComputedTextLength(); } catch (e) { return 0; } }
      function keepInside(t, left, right) {
        var w = width(t);
        if (!w) return;
        var x = parseFloat(t.getAttribute('x')) || 0;
        if (x + w > right) x = Math.max(left, right - w);
        t.setAttribute('x', x);
        w = width(t);
        if (x + w > right && w > 0) {
          var fs = parseFloat(getComputedStyle(t).fontSize) || 12;
          t.style.fontSize = Math.max(8.4, fs * (right - x) / w).toFixed(2) + 'px';
        }
      }

      GROUPS.forEach(function (grp, i) {
        var c = L.cols[i];
        var edge = L.cols[i + 1] ? L.cols[i + 1].x - 12 : W - pad;
        /* narrow columns cannot carry the figure and its word on one line:
           at 393px the four labels ran into each other */
        var vy = H - (narrow ? 26 : 20);
        var v = el('text', { x: c.x, y: vy, fill: css('--ink-hi'), 'font-weight': '500' });
        v.textContent = grp.n.toLocaleString('en-GB');
        g.svg.appendChild(v);
        keepInside(v, c.x, edge);

        var t = el('text', {
          x: narrow ? c.x : c.x + width(v) + 10,
          y: narrow ? H - 9 : vy,
          fill: css('--ink-faint'), 'letter-spacing': narrow ? '.08em' : '.12em'
        });
        t.textContent = grp.label.toUpperCase();
        g.svg.appendChild(t);
        keepInside(t, c.x, edge);

        if (!narrow) {
          var s2 = el('text', { x: c.x, y: H - 6, fill: css('--ink-faint') });
          s2.textContent = grp.sub;
          g.svg.appendChild(s2);
          /* never left of its own column: pulling the last one inside the
             pane used to slide it over the word beside it */
          keepInside(s2, c.x, i === GROUPS.length - 1 ? W - pad : edge);
        }
      });
    }

    function draw(g, p) {
      var ctx = g.ctx;
      GROUPS.forEach(function (grp, i) {
        var c = L.cols[i];
        var n = grp.n;
        var h = L.bot - L.top;
        // pack n marks into the column: as many columns as fit, then rows
        var cell = Math.max(1.6, Math.sqrt((c.w * h) / n) * 0.92);
        var cols = Math.max(1, Math.floor(c.w / cell));
        var rows = Math.ceil(n / cols);
        if (rows * cell > h) { cell = h / rows; cols = Math.max(1, Math.floor(c.w / cell)); rows = Math.ceil(n / cols); }
        var mw = Math.max(1, cell * 0.46), mh = Math.max(1, Math.min(cell * 0.62, 6));
        var shown = Math.floor(n * p);
        /* The commit marks used to be drawn in vermilion: a 700x130 block of the
           one accent the night reserves for its horizon, the loudest thing
           on the page after the census bar. The marks are the ink the rest
           of the site is written in; the commit field keeps its weight from
           being 3,612 of them, not from being orange. */
        ctx.fillStyle = css('--lane-atlas');
        ctx.globalAlpha = grp.hot ? 0.68 : 0.6;
        for (var k = 0; k < shown; k++) {
          var cx = c.x + (k % cols) * cell;
          var cy = L.bot - Math.floor(k / cols) * cell - mh;
          ctx.fillRect(cx, cy, mw, mh);
        }
        ctx.globalAlpha = 1;
      });
    }

    S.make({
      host: host, canvas: cvs, svg: svg, id: 'count', report: report, channel: 'count',
      label: data.commits.toLocaleString('en-GB') + ' marks', duration: 2100,
      layout: layout,
      frame: function (g, t) { draw(g, ease(t)); return false; },
      still: function (g) { draw(g, 1); }
    });
  }

  /* ---------- 2. three live miniatures ---------- */
  var MINIS = [
    { h: 'atlas.html', t: 'Atlas', s: 'A scheduled task, end to end', kind: 'life' },
    { h: 'portal.html', t: 'Family &amp; staff portal', s: 'Four roles, one boundary', kind: 'roles' },
    { h: 'browser.html', t: 'Quartz', s: 'Phone to pixels in five stages', kind: 'pipe' }
  ];

  function minis() {
    var host = document.getElementById('minis');
    if (!host) return;
    host.innerHTML = '';
    MINIS.forEach(function (m, i) {
      var wrap = document.createElement('div');
      wrap.className = 'mini';
      var a = document.createElement('a');
      a.href = m.h;
      a.innerHTML =
        '<div class="pane" id="mini-' + i + '"><canvas class="pane__cv" id="mini-cv-' + i + '" aria-hidden="true"></canvas></div>' +
        '<div class="mini__t">' + m.t + '</div>' +
        '<div class="mini__s">' + m.s + '</div>';
      wrap.appendChild(a);
      host.appendChild(wrap);
      sketch(i, m.kind);
    });
  }

  function sketch(i, kind) {
    var host = document.getElementById('mini-' + i);
    var cvs = document.getElementById('mini-cv-' + i);
    if (!host || !cvs) return;
    S.make({
      host: host, canvas: cvs, svg: null, id: 'mini' + i,
      report: function () {}, channel: 'mini' + i, label: 'miniature', duration: 1500,
      layout: function () {},
      frame: function (g, t) { paintMini(g, kind, ease(t)); return false; },
      still: function (g) { paintMini(g, kind, 1); }
    });
  }

  function paintMini(g, kind, p) {
    var ctx = g.ctx, W = g.W, H = g.H;
    var ink = css('--lane-atlas'), acc = css('--accent'), faint = css('--ink-faint');
    var padX = 16;
    if (kind === 'life') {
      var n = 7;
      for (var i = 0; i < n - 1; i++) {
        var q = Math.max(0, Math.min(1, p * (n - 1) - i));
        if (q <= 0) break;
        var x1 = padX + ((W - padX * 2) * i) / (n - 1), x2 = padX + ((W - padX * 2) * (i + 1)) / (n - 1);
        var y1 = H / 2 - Math.sin((i / (n - 1)) * Math.PI) * H * 0.2;
        var y2 = H / 2 - Math.sin(((i + 1) / (n - 1)) * Math.PI) * H * 0.2;
        ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q); ctx.stroke();
      }
      for (var k = 0; k < n; k++) {
        var x = padX + ((W - padX * 2) * k) / (n - 1);
        var y = H / 2 - Math.sin((k / (n - 1)) * Math.PI) * H * 0.2;
        if (p < k / (n - 1) - 0.02) break;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = k === n - 1 ? acc : faint; ctx.lineWidth = k === n - 1 ? 1.6 : 1;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.2832); ctx.stroke();
      }
    } else if (kind === 'roles') {
      var bx = W * 0.42;
      ctx.strokeStyle = faint; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(bx, 14); ctx.lineTo(bx, H - 14); ctx.stroke();
      var rows = 6, from = H * 0.5;
      for (var r = 0; r < rows; r++) {
        var ty = 20 + ((H - 40) * r) / (rows - 1);
        var allowed = r < 4;
        ctx.globalAlpha = allowed ? 0.85 : 0.3;
        ctx.strokeStyle = allowed ? ink : faint;
        ctx.lineWidth = allowed ? 1.3 : 1;
        if (!allowed) ctx.setLineDash([1.5, 3]);
        var q2 = Math.max(0, Math.min(1, p * 1.4 - r * 0.07));
        ctx.beginPath();
        ctx.moveTo(bx - 34, from);
        var endX = bx - 34 + ((W - 14) - (bx - 34)) * q2;
        ctx.bezierCurveTo(bx - 4, from, bx + 4, ty, endX, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = acc;
      ctx.fillRect(bx - 38, from - 3, 6, 6);
    } else {
      var stages = 5;
      ctx.strokeStyle = faint; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padX, H * 0.42); ctx.lineTo(W - padX, H * 0.42); ctx.stroke();
      for (var t2 = 0; t2 < stages; t2++) {
        var sx = padX + ((W - padX * 2) * (t2 + 0.5)) / stages;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(sx - 16, H * 0.42 - 9, 32, 18);
      }
      for (var m2 = 0; m2 < 20; m2++) {
        var mp = ((m2 / 20) + p) % 1;
        var mx = padX + (W - padX * 2) * mp;
        ctx.globalAlpha = 0.2 + 0.5 * Math.sin(Math.PI * mp);
        ctx.fillStyle = mp > 0.62 ? acc : ink;
        ctx.fillRect(mx - 1, H * 0.42 - 3, 2, 6);
      }
      ctx.globalAlpha = 0.7; ctx.fillStyle = acc;
      for (var b2 = 0; b2 < 26; b2++) {
        var bxx = padX + ((W - padX * 2) * b2) / 26;
        ctx.fillRect(bxx, H * 0.74, Math.max(1.6, (W - padX * 2) / 26 * 0.5), 7);
      }
      ctx.globalAlpha = 1;
    }
  }

  function boot() {
    if (!window.Scene || !window.Ink) return;
    minis();
    if (document.getElementById('count-pane')) {
      Promise.all([I.loadJSON('data/commits.json'), I.loadJSON('data/projects.json')])
        .then(function (r) {
          counted({
            commits: r[0].totals.total_commits,
            projects: r[1].projects.length,
            tools: r[1].tally.tools_used_every_week,
            live: r[1].tally.live_on_the_public_web
          });
        })
        .catch(function (e) {
          I.reporter('count-state')('the tally could not read its data: ' + e.message, true, 'count');
        });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
