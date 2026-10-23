/* ============================================================
   projects.js — everything this page runs.

   1. THE FIELD. The arc diagram that was piece 2 of
      js/showpieces.js, copied here and rebuilt so it owns the
      whole viewport: the axes run edge to edge, the five
      technologies that carry the most rise off the top of the
      frame, and the rotated project names get measured room
      below the axis instead of being cut by the viewport. The
      title is set over it, not beside it.

   2. THE REGISTER. The projects that do not have a page of
      their own, built from data/projects.json, filterable by
      state and by group. Each entry keeps a stable id so the
      front page — and the field above — can deep-link to it.

   One fetch of data/projects.json feeds both. The field runs on
   js/scene.js, so it keeps that contract: DPR capped at 2, it
   starts when it scrolls into view, it stops the moment it
   settles, a still frame under reduced motion, and a visible
   reason beside it if it cannot draw.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink, S = window.Scene;
  var OWN_PAGE = { atlas: 'atlas.html', tvha: 'portal.html', browser: 'browser.html' };

  function di(s) { var p = s.split('-').map(Number); return (Date.UTC(2026, p[0] - 1, p[1]) - Date.UTC(2026, 2, 1)) / 864e5; }
  /* the timeline runs 1 March to 31 October 2026; today comes from the data */
  var TOTALD = (Date.UTC(2026, 10, 1) - Date.UTC(2026, 2, 1)) / 864e5;
  var TODAY = '10-12';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function todayLabel(md) { var p = md.split('-').map(Number); return 'Today, ' + p[1] + ' ' + MON[p[0] - 1]; }

  /* ============================================================
     1. THE FIELD — every technology over every project without a page
     ============================================================ */

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* the first `t` of a cubic, split with De Casteljau, so an arc
     GROWS down from the top axis instead of popping into place */
  function arcTo(ctx, x0, y0, c1x, c1y, c2x, c2y, x3, y3, t) {
    if (t <= 0) return;
    if (t >= 1) {
      ctx.moveTo(x0, y0); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x3, y3); return;
    }
    var ax = lerp(x0, c1x, t), ay = lerp(y0, c1y, t);
    var bx = lerp(c1x, c2x, t), by = lerp(c1y, c2y, t);
    var cx = lerp(c2x, x3, t), cy = lerp(c2y, y3, t);
    var dx = lerp(ax, bx, t), dy = lerp(ay, by, t);
    var ex = lerp(bx, cx, t), ey = lerp(by, cy, t);
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(ax, ay, dx, dy, lerp(dx, ex, t), lerp(dy, ey, t));
  }

  function techField(data) {
    var host = document.getElementById('graph-pane');
    if (!host || !S) return;
    var el = S.el, css = S.css;
    var svg = document.getElementById('graph-svg');
    var cvs = document.getElementById('graph-cv');
    var report = I.reporter('graph-state');
    var OWN = { atlas: 1, tvha: 1, browser: 1 };
    var projects = data.projects.filter(function (p) { return !OWN[p.id]; });

    var use = {};
    projects.forEach(function (p) {
      p.stack.forEach(function (s) { (use[s] = use[s] || []).push(p.id); });
    });
    var techs = Object.keys(use).sort(function (a, b) {
      return use[b].length - use[a].length || a.localeCompare(b);
    });
    /* the counts in the field's description come from the data, so the
       sentence a screen reader hears can never fall behind the picture */
    if (svg) svg.setAttribute('aria-label', 'An arc diagram: ' + techs.length +
      ' technologies along the top, ' + projects.length + ' projects along the bottom in the ' +
      'order they started, and one arc for every line in a project’s built-with list. ' +
      'Each is a button; the full list follows below.');
    var order = projects.slice().sort(function (a, b) {
      return a.spans[0][0] < b.spans[0][0] ? -1 : 1;
    });

    var L = { tx: {}, px: {}, topY: 0, botY: 0, narrow: false };
    var hot = null;

    function gutter() {
      var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gutter'));
      return isFinite(v) && v > 0 ? v : 20;
    }

    /* How long each rotated name really is, measured in the SVG that will
       draw it — not guessed from a character count and not measured on the
       canvas, which does not see this <text>'s inherited tracking. This is
       what reserves the room, so a name can never be cut by an edge. */
    function widths(svg, names, fs) {
      var probe = el('text', { x: -9999, y: -9999, 'font-size': fs });
      svg.appendChild(probe);
      var out = names.map(function (n) {
        var w = 0;
        probe.textContent = n;
        try { w = probe.getComputedTextLength(); } catch (e) { w = 0; }
        return w > 0 ? w : n.length * fs * 0.75;
      });
      svg.removeChild(probe);
      return out;
    }

    /* The size the browser will REALLY draw a scene label at. The sheet's
       .ink-svg floor beats a font-size attribute, so a scene that lays out
       for the size it asked for lays out for a size it never gets. Ask the
       document instead: every reservation below is made for this number, so
       the size drawn is the size laid out at every width. */
    function drawnSize(svg, want) {
      var probe = el('text', { x: -9999, y: -9999, 'font-size': want });
      probe.textContent = 'M';
      svg.appendChild(probe);
      var got = parseFloat(getComputedStyle(probe).fontSize);
      svg.removeChild(probe);
      return isFinite(got) && got > 0 ? Math.max(want, got) : want;
    }

    /* the left inset only has to protect the FIRST few names, so solve it
       against the spacing it produces rather than the longest name on the
       page — two passes is enough for it to settle */
    function solveInset(reachX, W) {
      var inset = Math.min(Math.ceil(Math.max.apply(null, reachX)) + 6, Math.round(W * 0.3));
      for (var pass = 0; pass < 2; pass++) {
        var pw = (W - inset) / order.length;
        var need = 2;
        for (var i = 0; i < reachX.length; i++) {
          need = Math.max(need, reachX[i] - pw * (i + 0.5) + 4);
        }
        inset = Math.max(2, Math.min(Math.ceil(need), Math.round(W * 0.3)));
      }
      return inset;
    }

    /* ---- the top rail: one line of leaning names ---------------
       Twenty-seven names stacked in two horizontal tiers under the masthead
       read as a paragraph of fragments, not a label row (QA-4 D12): a flat
       name needs its whole length of clear axis and there is nowhere near
       that much. A name that LEANS off its own tick needs only its own
       height of air across the axis, so a rail that took two tiers fits in
       one and every name stays a separate stroke aimed at its tick. */

    /* The stack this replaces, still exactly as it laid out: each name flat,
       dropped into the first tier whose last name it clears by 10 px. It is
       both the floor (the lean may never carry fewer names than this) and
       what a width too narrow for any lean falls back to, unchanged. */
    function flatStack(W, tw2, tiers, topY, fs) {
      var claimed = [], put = [], k, step = Math.round(fs * 1.32);
      for (k = 0; k < tiers; k++) claimed.push(-1e9);
      for (var i = 0; i < techs.length; i++) {
        var x = L.tx[techs[i]], w = tw2[i], dir = 1, lx = x + 3, x0 = lx;
        if (lx + w > W - 4) { dir = -1; lx = x - 3; x0 = lx - w; }
        if (x0 < 4) { dir = 1; lx = 4; x0 = 4; }
        for (k = 0; k < tiers; k++) {
          if (x0 >= claimed[k] + 10) {
            claimed[k] = x0 + w;
            put.push({ t: techs[i], x: x, y: topY + 22 + k * step, dir: dir, dx: lx - x });
            break;
          }
        }
      }
      return { n: put.length, deg: 0, tiers: tiers, put: put,
               deep: topY + 22 + (tiers - 1) * step + fs * 0.26 };
    }

    /* the four corners of a name leaning `deg` off the tick at (x, y).
       dir 1 reads down and right from the tick; dir -1 is the mirror an
       edge forces, reading back up into it. */
    function nameBox(x, y, w, fs, deg, dir) {
      var a = deg * dir * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      var x0 = dir > 0 ? 3 : -3 - w, x1 = dir > 0 ? 3 + w : -3;
      var p = [[x0, -fs * 0.8], [x1, -fs * 0.8], [x1, fs * 0.26], [x0, fs * 0.26]], out = [];
      for (var i = 0; i < 4; i++) {
        out.push([x + c * p[i][0] - s * p[i][1], y + s * p[i][0] + c * p[i][1]]);
      }
      return out;
    }

    /* two oriented boxes with `air` between them on every axis, which is the
       same separating-axis test the measurement uses afterwards — the names
       cannot be laid out to one rule and checked against another */
    function apart(A, B, air) {
      for (var t = 0; t < 2; t++) {
        var P = t ? B : A;
        for (var i = 0; i < 4; i++) {
          var j = (i + 1) % 4;
          var nx = -(P[j][1] - P[i][1]), ny = P[j][0] - P[i][0];
          var len = Math.sqrt(nx * nx + ny * ny);
          if (!len) continue;
          nx /= len; ny /= len;
          var a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, d;
          for (var q = 0; q < 4; q++) {
            d = A[q][0] * nx + A[q][1] * ny;
            if (d < a0) a0 = d; if (d > a1) a1 = d;
            d = B[q][0] * nx + B[q][1] * ny;
            if (d < b0) b0 = d; if (d > b1) b1 = d;
          }
          if (a1 + air < b0 || b1 + air < a0) return true;
        }
      }
      return false;
    }

    /* lay the names out at one lean, busiest first, each at its own tick */
    function railAt(W, tw2, fs, deg, tiers, y0, air, maxY) {
      /* a second tier has to clear the first by the same air the names keep
         from each other along the row, which at a lean is measured across
         the lean, not straight down */
      var step = Math.min(Math.round((fs * 1.1 + air) / Math.cos(deg * Math.PI / 180)),
                          Math.round(fs * 3.2));
      var boxes = [], put = [], deep = y0;
      techs.forEach(function (t, i) {
        var x = L.tx[t], w = tw2[i];
        for (var k = 0; k < tiers; k++) {
          var y = y0 + k * step;
          for (var d = 0; d < 2; d++) {
            var dir = d ? -1 : 1, bx = nameBox(x, y, w, fs, deg, dir), q, bad = false;
            for (q = 0; q < 4; q++) {
              if (bx[q][0] < 2 || bx[q][0] > W - 2 || bx[q][1] > maxY) { bad = true; break; }
            }
            if (bad) continue;
            for (q = 0; q < boxes.length; q++) {
              if (!apart(bx, boxes[q], air)) { bad = true; break; }
            }
            if (bad) continue;
            boxes.push(bx);
            put.push({ t: t, x: x, y: y, dir: dir, dx: dir > 0 ? 3 : -3 });
            for (q = 0; q < 4; q++) if (bx[q][1] > deep) deep = bx[q][1];
            return;
          }
        }
      });
      return { n: put.length, deep: deep, deg: deg, tiers: tiers, put: put, floor: 0, budget: 0 };
    }

    /* the shallowest lean, in the fewest tiers, that still carries every name
       the stack carried and keeps the rail's ink off the arcs */
    function railPlan(W, tw2, fs, topY, botY, narrow) {
      var y0 = topY + (narrow ? 18 : 21);
      var air = fs * (narrow ? 0.5 : 0.7);
      /* The floor. However the names lean afterwards, the rail may never
         carry fewer of them than the flat stack carried at the same size —
         two tiers, three on a phone (27 at 1280, 16 at 393, 14 at 320). */
      var tiers = narrow ? 3 : 2;
      var floor = flatStack(W, tw2, tiers, topY, fs).n;
      /* and the rail may never take the field's own room: its deepest ink
         stays inside the first 200 px and inside its share of the two axes */
      var budget = Math.min(200, topY + Math.max(84, (botY - topY) * 0.45));
      var cand = [18, 22, 26, 30, 34, 38, 44, 52, 62, 72];
      var best = null, fit = null, T, ci, p;
      function weigh(q) {
        if (!best || q.n > best.n || (q.n === best.n && q.deep < best.deep)) best = q;
        if (q.deep <= budget && (!fit || q.n > fit.n || (q.n === fit.n && q.deep < fit.deep))) fit = q;
        return q.n >= floor && q.deep <= budget;
      }
      /* Shallowest lean, fewest tiers, that carries them all. Never a third
         tier of leaning names: three tiers is the stack this is replacing,
         and at 393 and below no lean reaches the floor without taking half
         the arcs' room, so those widths keep the stack. */
      for (T = 1; T <= Math.min(2, tiers); T++) {
        for (ci = 0; ci < cand.length; ci++) {
          p = railAt(W, tw2, fs, cand[ci], T, y0, air, botY - 6);
          if (weigh(p)) return p;
        }
      }
      /* a width too narrow for any lean keeps the stack it had, unchanged */
      p = flatStack(W, tw2, tiers, topY, fs);
      if (weigh(p)) return p;
      /* nothing carried them all inside the budget: the field's own room
         comes first, and the deepest rail only if it would cost names */
      return fit && fit.n >= floor ? fit : best;
    }

    function layout(g) {
      var W = g.W, H = g.H;
      var narrow = W < 700;
      var gut = gutter();
      var fs = drawnSize(g.svg, 10);

      /* ---- reserve the room the rotated project names need ---- */
      var names = order.map(function (p) { return p.name; });
      var lw = widths(g.svg, names, fs);
      var widest = Math.max.apply(null, lw);

      /* The lean is measured, not guessed. A name rotated by `ang` leaves
         pitch * sin(ang) of clear air to its neighbour, and its em box is
         about 1.3 * fs, so take the shallowest angle that still clears it at
         this width: 52 degrees at 1280, upright by the time 22 names have to
         share a 320 screen. */
      var cand = narrow ? [58, 68, 78, 85] : [52, 58, 68, 78, 85];
      var deg = 0, ang = 0, cos = 0, sin = 0, inset = 0, reachX = null;
      for (var ci = 0; ci < cand.length; ci++) {
        ang = cand[ci] * Math.PI / 180;
        cos = Math.cos(ang); sin = Math.sin(ang); deg = -cand[ci];
        /* a name rotated by `ang` and set back from its tick reaches this far
           left of it and this far below the axis, em box included */
        reachX = lw.map(function (w) { return w * cos + fs * sin; });
        inset = solveInset(reachX, W);
        if ((W - inset) / order.length * sin >= fs * 1.28) break;
      }
      var upright = -deg >= 80;

      /* 13 is the gap between the axis and the first glyph; the rest is the
         air that keeps the deepest name off the bottom edge of the field */
      var labelDrop = Math.max(narrow ? 92 : 110,
        Math.ceil(widest * sin + fs * cos) + 13 + (narrow ? 12 : 20));
      labelDrop = Math.min(labelDrop, Math.round(H * (upright ? 0.58 : narrow ? 0.46 : 0.42)));

      L.topY = narrow ? 30 : 40;
      L.botY = H - labelDrop;
      L.narrow = narrow;

      /* ---- the technology axis: widest first, edge to edge ---- */
      var wsum = 0;
      techs.forEach(function (t) { wsum += Math.sqrt(use[t].length); });
      var run = 0;
      techs.forEach(function (t) {
        var w = (Math.sqrt(use[t].length) / wsum) * W;
        L.tx[t] = run + w / 2; run += w;
      });
      var tw = W / techs.length;
      var pwF = (W - inset) / order.length;
      order.forEach(function (p, i) { L.px[p.id] = inset + pwF * (i + 0.5); });
      L.tw = tw; L.pw = pwF;

      /* both axes bleed off the left and right edges of the screen */
      g.svg.appendChild(el('line', { x1: 0, y1: L.topY, x2: W, y2: L.topY, stroke: css('--rule'), 'stroke-width': 1 }));
      g.svg.appendChild(el('line', { x1: 0, y1: L.botY, x2: W, y2: L.botY, stroke: css('--rule'), 'stroke-width': 1 }));

      /* one caption, on the empty side of the top axis */
      var cap = el('text', {
        x: W - gut, y: narrow ? 17 : 21, 'text-anchor': 'end',
        'font-size': 10, fill: css('--ink-faint'), 'letter-spacing': '.16em'
      });
      cap.textContent = techs.length + ' TECHNOLOGIES — WIDEST FIRST';
      g.svg.appendChild(cap);

      /* ---- name every technology there is room for ----
         A rail of unexplained ticks is not data. Each name is measured, then
         leaned off its own tick at the angle the width can carry; the ones
         with no room left stay a tick and keep their pointer and keyboard
         label. The busiest come first in `techs` and so get first claim. */
      var tw2 = widths(g.svg, techs, fs);
      var rail = railPlan(W, tw2, fs, L.topY, L.botY, narrow);
      var named = {};
      rail.put.forEach(function (p) { named[p.t] = p; });
      L.named = rail.n;
      L.railDeep = rail.deep;

      techs.forEach(function (t, ti) {
        var x = L.tx[t], n = use[t].length;
        var grp = el('g', { 'class': 'gt', tabindex: '0', role: 'button', 'data-t': t,
          'aria-label': t + ', used by ' + n + (n === 1 ? ' project' : ' projects') });
        grp.appendChild(el('rect', {
          x: x - Math.max(5, tw / 2), y: 0, width: Math.max(10, tw),
          height: Math.round(rail.deep) + 4,
          fill: 'transparent'
        }));
        /* the five that carry the most run off the top of the frame */
        if (n > 2) {
          grp.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: L.topY, stroke: css('--rule-strong'), 'stroke-width': .8 }));
        }
        /* the tick's LENGTH is how many projects use it; it does not also need
           to be vermilion. The accent belongs to the horizon and to what is
           running now — twenty warm marks up here outshouted both. */
        grp.appendChild(el('line', {
          x1: x, y1: L.topY, x2: x, y2: L.topY + 5 + Math.min(12, n * 2.2),
          stroke: n > 1 ? css('--scene-ink') : css('--ink-faint'), 'stroke-width': n > 1 ? 1.8 : 1
        }));
        var place = named[t];
        if (place) {
          var lab = el('text', {
            x: place.dx, y: 0,
            'text-anchor': place.dir > 0 ? 'start' : 'end', 'font-size': fs,
            fill: css(n > 2 ? '--scene-ink' : '--ink-low'),
            transform: 'translate(' + place.x.toFixed(1) + ',' + place.y +
                       ') rotate(' + (rail.deg * place.dir) + ')'
          });
          lab.textContent = t;
          grp.appendChild(lab);
        }
        grp.addEventListener('pointerenter', function () { light('t', t); });
        grp.addEventListener('focus', function () { light('t', t); });
        grp.addEventListener('pointerleave', function () { light(null); });
        grp.addEventListener('blur', function () { light(null); });
        grp.addEventListener('click', function () { filterTo(t); });
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filterTo(t); } });
        g.svg.appendChild(grp);
      });

      /* ---- the project axis: in the order they started ---- */
      order.forEach(function (p) {
        var x = L.px[p.id];
        var grp = el('g', { 'class': 'gp', tabindex: '0', role: 'button', 'data-p': p.id,
          'aria-label': p.name + ', ' + p.label + ', built with ' + p.stack.join(', ') + '. Opens its entry below.' });
        grp.appendChild(el('rect', { x: x - Math.max(6, pwF / 2), y: L.botY - 8, width: Math.max(12, pwF), height: labelDrop, fill: 'transparent' }));
        grp.appendChild(el('line', { x1: x, y1: L.botY, x2: x, y2: L.botY + 7, stroke: p.state === 'run' ? css('--accent') : css('--ink-faint'), 'stroke-width': p.state === 'run' ? 1.8 : 1 }));
        var t = el('text', {
          x: 0, y: 0, 'font-size': fs, fill: css('--scene-ink'),
          'text-anchor': 'end',
          transform: 'translate(' + x.toFixed(1) + ',' + (L.botY + 13) + ') rotate(' + deg + ')'
        });
        t.textContent = p.name;
        grp.appendChild(t);
        grp.addEventListener('pointerenter', function () { light('p', p.id); });
        grp.addEventListener('focus', function () { light('p', p.id); });
        grp.addEventListener('pointerleave', function () { light(null); });
        grp.addEventListener('blur', function () { light(null); });
        grp.addEventListener('click', function () { jump(p.id); });
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(p.id); } });
        g.svg.appendChild(grp);
      });
    }

    function arcs(g, p) {
      var ctx = g.ctx, k = 0, total = 0;
      if (!ctx) return;
      projects.forEach(function (pr) { total += pr.stack.length; });
      var lit = css('--lane-atlas'), dim = css('--rule-strong'), acc = css('--accent');
      ctx.lineCap = 'round';
      order.forEach(function (pr) {
        pr.stack.forEach(function (s) {
          k++;
          var seg = Math.max(0, Math.min(1, p * 1.6 - (k / total) * 0.6));
          if (seg <= 0) return;
          var on = !hot || (hot.k === 't' && hot.v === s) || (hot.k === 'p' && hot.v === pr.id);
          var x1 = L.tx[s], y1 = L.topY, x2 = L.px[pr.id], y2 = L.botY;
          var mid = (y1 + y2) / 2;
          ctx.globalAlpha = hot ? (on ? 0.95 : 0.1) : 0.34;
          ctx.strokeStyle = on && hot ? acc : (hot ? dim : lit);
          ctx.lineWidth = on && hot ? 1.5 : 0.9;
          ctx.beginPath();
          arcTo(ctx, x1, y1, x1, mid, x2, mid, x2, y2, seg);
          ctx.stroke();
        });
      });
      ctx.globalAlpha = 1;
    }

    var sc = S.make({
      host: host, canvas: cvs, svg: svg, id: 'graph', report: report, channel: 'graph',
      label: techs.length + ' technologies across ' + projects.length + ' projects', duration: 1900,
      layout: layout,
      frame: function (g, t) { arcs(g, ease(t)); return false; },
      still: function (g) { arcs(g, 1); }
    });

    /* the reservation is measured in IBM Plex Mono — re-measure once
       the webfont has actually arrived, or the names can still clip */
    if (document.fonts && document.fonts.ready && sc.relayout) {
      document.fonts.ready.then(function () {
        try { if (sc.relayout() && sc.settled()) sc.still(); } catch (e) {}
      });
    }

    function light(k, v) {
      hot = k ? { k: k, v: v } : null;
      sc.paint(1);
      var out = document.getElementById('graph-read');
      if (!out) return;
      out.innerHTML = '';
      var a = document.createElement('span'); a.className = 'k';
      var b = document.createElement('b');
      var p = document.createElement('p');
      if (!k) {
        a.textContent = 'The graph';
        b.textContent = techs.length + ' technologies, ' + projects.length + ' projects';
        p.textContent = 'Each arc is one line from a project’s “built with”. The projects run in the order they started — point at either end, or click to jump into the register below.';
      } else if (k === 't') {
        var names = use[v].map(function (id) {
          return projects.filter(function (q) { return q.id === id; })[0].name;
        });
        a.textContent = 'Technology';
        b.textContent = v;
        p.textContent = names.length + (names.length === 1 ? ' project: ' : ' projects: ') + names.join(', ') + '.';
      } else {
        var pr = projects.filter(function (q) { return q.id === v; })[0];
        a.textContent = pr.label + ' · ' + pr.when;
        b.textContent = pr.name;
        p.textContent = pr.stack.join(' · ');
      }
      out.appendChild(a); out.appendChild(b); out.appendChild(p);
    }

    function jump(id) {
      var t = document.getElementById('p-' + id);
      if (!t) return;
      t.hidden = false;
      t.scrollIntoView({ block: 'center', behavior: S.REDUCED ? 'auto' : 'smooth' });
      t.classList.add('flash');
      setTimeout(function () { t.classList.remove('flash'); }, 1600);
      var h = t.querySelector('.entry__name');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }

    function filterTo(tech) {
      var ids = {};
      use[tech].forEach(function (id) { ids[id] = 1; });
      var shown = 0;
      [].forEach.call(document.querySelectorAll('#register .group'), function (grp) {
        var any = 0;
        [].forEach.call(grp.querySelectorAll('.entry'), function (e) {
          var ok = !!ids[e.id.replace(/^p-/, '')];
          e.hidden = !ok;
          if (ok) { any++; shown++; }
        });
        grp.hidden = !any;
      });
      var live = document.getElementById('reg-count');
      if (live) live.textContent = shown + ' of ' + projects.length + ' projects use ' + tech;
      [].forEach.call(document.querySelectorAll('#reg-tools .chip, #group-tools .chip'), function (c) {
        c.setAttribute('aria-pressed', 'false');
      });
      var head = document.getElementById('h-all') || document.getElementById('register');
      if (head) head.scrollIntoView({ block: 'start', behavior: S.REDUCED ? 'auto' : 'smooth' });
    }

    /* ---- what this field needs, when the night cannot be lit ----
       The horizon behind this page belongs to scene.js and says its own
       piece on #wash-state. This field asks for no graphics context at all —
       but a page that loses WebGL and says nothing about its own picture has
       failed silently, so the condition is stated here, beside the picture
       it is about. */
    function glNote(tries) {
      var pw = document.getElementById('page-wash');
      var w = pw && pw.__inkWash;
      if (!w) {
        if (tries < 12) { setTimeout(function () { glNote(tries + 1); }, 250); return; }
        report('the night behind this page never reported in — the field above is a ' +
               '2D canvas and SVG and is drawn either way.', true, 'gl');
        return;
      }
      if (w.ok) return;
      report('the field: drawn without WebGL — the arcs are a 2D canvas and both axes ' +
             'are SVG, so every name, every arc and the register below are unchanged.',
             false, 'gl');
    }
    glNote(0);

    light(null);
  }

  /* ============================================================
     2. THE REGISTER — one hairline row per project
     ============================================================ */

  function entry(p) {
    var a = document.createElement('article');
    a.className = 'entry';
    a.id = 'p-' + p.id;
    a.setAttribute('data-state', p.state);
    a.setAttribute('data-group', p.group);

    var id = document.createElement('div'); id.className = 'entry__id';
    var nm = document.createElement('h3'); nm.className = 'entry__name'; nm.textContent = p.name;
    var st = document.createElement('span'); st.className = 'state ' + p.state; st.textContent = p.label;
    st.setAttribute('title', p.state_meaning);
    var wh = document.createElement('p'); wh.className = 'entry__when'; wh.textContent = p.when;
    id.appendChild(nm); id.appendChild(st); id.appendChild(wh);

    var bar = document.createElement('div');
    bar.className = 'entry__bar';
    bar.setAttribute('aria-hidden', 'true');
    p.spans.forEach(function (s) {
      var i = document.createElement('i');
      var x0 = di(s[0]) / TOTALD * 100, x1 = di(s[1]) / TOTALD * 100;
      i.style.left = x0.toFixed(2) + '%';
      i.style.width = Math.max(0.6, x1 - x0).toFixed(2) + '%';
      bar.appendChild(i);
    });
    var u = document.createElement('u');
    u.style.left = (di(TODAY) / TOTALD * 100).toFixed(2) + '%';
    u.title = todayLabel(TODAY);
    bar.appendChild(u);
    id.appendChild(bar);

    var body = document.createElement('div');
    var what = document.createElement('p'); what.className = 'entry__what'; what.textContent = p.what;
    body.appendChild(what);
    if (p.detail && p.detail.length) {
      var ul = document.createElement('ul'); ul.className = 'ticks';
      p.detail.forEach(function (d) { var li = document.createElement('li'); li.textContent = d; ul.appendChild(li); });
      body.appendChild(ul);
    }
    if (p.links && p.links.length) {
      var ln = document.createElement('p');
      ln.className = 'entry__when';
      ln.style.marginTop = '8px';
      p.links.forEach(function (href, k) {
        if (k) ln.appendChild(document.createTextNode(' · '));
        var aa = document.createElement('a');
        aa.href = href; aa.rel = 'noopener'; aa.textContent = href.replace(/^https?:\/\//, '');
        ln.appendChild(aa);
      });
      body.appendChild(ln);
    }
    if (p.repo) body.appendChild(getRow(p));
    if (p.id === 'starwars' || p.id === 'design') {
      var lab = document.createElement('a');
      lab.className = 'more';
      lab.href = p.id === 'starwars' ? 'lab.html#exhibit-game' : 'lab.html#exhibit-studies';
      lab.textContent = p.id === 'starwars' ? 'Play it in the lab' : 'See all seven in the lab';
      body.appendChild(lab);
    }

    var stack = document.createElement('p');
    stack.className = 'entry__stack';
    var em = document.createElement('em'); em.textContent = 'Built with';
    stack.appendChild(em);
    stack.appendChild(document.createTextNode(p.stack.join(' · ')));

    a.appendChild(id); a.appendChild(body); a.appendChild(stack);
    return a;
  }

  /* the download row of a project whose repo is public (data: p.repo). The
     button goes to the README's Download/Install section, not to a zip: every
     one of them runs from a git clone, and the meta line says so. Same markup
     as browser.html and the front page; the look is .get in css/ink.css. */
  function getRow(p) {
    var r = p.repo;
    var g = document.createElement('div'); g.className = 'get';
    var btn = document.createElement('a'); btn.className = 'get__btn';
    btn.href = r.download; btn.rel = 'noopener'; btn.textContent = 'Download';
    btn.setAttribute('aria-label', 'Download ' + p.name + ' (its install steps on GitHub)');
    var src = document.createElement('a'); src.className = 'get__src';
    src.href = r.url; src.rel = 'noopener'; src.textContent = 'Source on GitHub';
    src.setAttribute('aria-label', p.name + ' source on GitHub');
    var meta = document.createElement('span'); meta.className = 'get__meta';
    meta.textContent = [r.platform, r.runs, r.licence].concat(r.release ? [r.release] : []).join(' · ');
    g.appendChild(btn); g.appendChild(src); g.appendChild(meta);
    return g;
  }

  function buildRegister(data, host, state) {
    var rest = data.projects.filter(function (p) { return !OWN_PAGE[p.id]; });
    var expected = data.projects.length - Object.keys(OWN_PAGE).length;
    if (rest.length !== expected) {
      state('project count disagrees: ' + rest.length + ' listed, ' + expected + ' expected', true, 'count');
    }

    var byGroup = {};
    rest.forEach(function (p) { (byGroup[p.group] = byGroup[p.group] || []).push(p); });

    host.innerHTML = '';
    data.groups.forEach(function (g) {
      var list = byGroup[g.name] || [];
      if (!list.length) return;
      var sec = document.createElement('div');
      sec.className = 'group';
      sec.setAttribute('data-group', g.name);
      sec.id = 'g-' + g.name.toLowerCase().replace(/[^a-z]+/g, '-');
      var head = document.createElement('div');
      head.className = 'group__head';
      var h = document.createElement('h2'); h.textContent = g.name;
      var cnt = document.createElement('span');
      cnt.textContent = list.length + (list.length === 1 ? ' project' : ' projects');
      head.appendChild(h); head.appendChild(cnt);
      sec.appendChild(head);
      list.forEach(function (p) { sec.appendChild(entry(p)); });
      host.appendChild(sec);
    });

    buildGroupChips(data.groups.filter(function (g) { return (byGroup[g.name] || []).length; }));
    wireFilters(host, rest.length);
    state(rest.length + ' projects · ' + data.groups.length + ' groups · measured ' + data.tally.measured_on, false, 'count');

    // deep link from the front page
    if (location.hash && document.querySelector(location.hash)) {
      var t = document.querySelector(location.hash);
      t.classList.add('flash');
      setTimeout(function () { t.classList.remove('flash'); }, 1600);
      t.scrollIntoView({ block: 'center', behavior: I.REDUCED ? 'auto' : 'smooth' });
    }
  }

  var groups = [];
  function buildGroupChips(gs) {
    var bar = document.getElementById('group-tools');
    if (!bar) return;
    groups = gs.map(function (g) { return g.name; });
    bar.innerHTML = '';
    var all = document.createElement('button');
    all.className = 'chip'; all.type = 'button';
    all.setAttribute('data-group', ''); all.setAttribute('aria-pressed', 'true');
    all.textContent = 'Every group';
    bar.appendChild(all);
    groups.forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button';
      b.setAttribute('data-group', n); b.setAttribute('aria-pressed', 'false');
      b.textContent = n;
      bar.appendChild(b);
    });
  }

  function wireFilters(host, total) {
    var stateBar = document.getElementById('reg-tools');
    var groupBar = document.getElementById('group-tools');
    var live = document.getElementById('reg-count');
    var fState = 'all', fGroup = '';

    function apply() {
      var shown = 0;
      [].forEach.call(host.querySelectorAll('.group'), function (g) {
        var any = 0;
        [].forEach.call(g.querySelectorAll('.entry'), function (e) {
          var ok = (fState === 'all' || e.getAttribute('data-state') === fState) &&
                   (!fGroup || e.getAttribute('data-group') === fGroup);
          e.hidden = !ok;
          if (ok) { any++; shown++; }
        });
        g.hidden = !any;
      });
      if (live) live.textContent = shown + ' of ' + total + ' projects shown';
    }

    if (stateBar) {
      var chips = stateBar.querySelectorAll('.chip');
      [].forEach.call(chips, function (c) {
        c.addEventListener('click', function () {
          fState = c.getAttribute('data-filter');
          [].forEach.call(chips, function (x) { x.setAttribute('aria-pressed', String(x === c)); });
          apply();
        });
      });
    }
    if (groupBar) {
      groupBar.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.chip');
        if (!b) return;
        fGroup = b.getAttribute('data-group') || '';
        [].forEach.call(groupBar.querySelectorAll('.chip'), function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        apply();
      });
    }
    apply();
  }

  /* ============================================================
     boot — one fetch, the field and the register
     ============================================================ */

  function boot() {
    var host = document.getElementById('register');
    if (!host || !I) return;
    var state = I.reporter('reg-state');

    I.loadJSON('data/projects.json').then(function (data) {
      if (data.tally && /^\d\d-\d\d$/.test(data.tally.timeline_today)) TODAY = data.tally.timeline_today;
      buildRegister(data, host, state);
      if (document.getElementById('graph-pane')) techField(data);
    }).catch(function (e) {
      state('project data failed to load: ' + e.message, true, 'count');
      I.reporter('graph-state')('the technology graph could not load its data: ' + e.message, true, 'graph');
      I.fail('Project data', e, host);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
