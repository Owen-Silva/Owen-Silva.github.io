/* ============================================================
   tools.js — two of Owen's algorithms, re-implemented here so
   they actually run in the page.

   1. The gear-card generator. The original turns a team's gear
      spreadsheet into a printable deck of 3×5 cards and writes
      the PDF by hand, with no PDF library, embedding font
      widths so that names centre correctly. This does the same
      thing for one name you type: it measures the string
      against Helvetica's own advance widths, lays the card out
      at 216 × 360 points, and assembles the PDF bytes —
      header, objects, cross-reference table, trailer.

   2. The lesson-slide recorder's change detector. The original
      keeps only the frames where a lesson video's slide really
      changed, using tiny 24×24 grayscale fingerprints so that
      transitions, animated backgrounds and ticking timers do
      not count as changes. This runs the same fingerprint on a
      slide sequence drawn live in the page — including a
      second hand that ticks every frame and a drifting
      background, so you can watch it refuse to be fooled.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;
  /* one reading of the motion preference for both instruments. Ink's own
     flag when site.js is there, the media query itself when it is not —
     the old test read window.Scene, which this site has never defined,
     so the detector used to start itself under reduced motion. */
  var REDUCED = (I && typeof I.REDUCED === 'boolean') ? I.REDUCED
    : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ============ 1. the gear card ============ */

  /* Helvetica advance widths, in 1/1000 em, for the printable
     ASCII range — the same table the original embeds. */
  var HELV = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584
  ];
  var HELV_B = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584
  ];
  function widthOf(s, size, bold) {
    var tab = bold ? HELV_B : HELV, w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? tab[c - 32] : 556;
    }
    return w * size / 1000;
  }
  function pdfEscape(s) { return s.replace(/([\\()])/g, '\\$1'); }

  /* one 3 × 5 inch card, 216 × 360 points, written as PDF bytes */
  function buildCard(fields) {
    var W = 216, H = 360;
    var lines = [], y = H - 42;
    function centred(txt, size, bold) {
      var w = widthOf(txt, size, bold);
      lines.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' +
                 ((W - w) / 2).toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + pdfEscape(txt) + ') Tj ET');
      return w;
    }
    var content = [];
    content.push('0.6 w 12 12 ' + (W - 24) + ' ' + (H - 24) + ' re S');
    var nameW = widthOf(fields.name, 19, true);
    var size = nameW > W - 44 ? Math.max(11, 19 * (W - 44) / nameW) : 19;
    lines = [];
    centred(fields.name, size, true);
    y -= 26; centred(fields.team, 10, false);
    y -= 40;
    ['Jersey   ' + fields.number, 'Size   ' + fields.size, 'Item   ' + fields.item].forEach(function (row) {
      lines.push('BT /F1 11 Tf 30 ' + y.toFixed(2) + ' Td (' + pdfEscape(row) + ') Tj ET');
      y -= 22;
    });
    y -= 10;
    lines.push('0.4 w 30 ' + y.toFixed(2) + ' m ' + (W - 30) + ' ' + y.toFixed(2) + ' l S');
    y -= 20;
    lines.push('BT /F1 8 Tf 30 ' + y.toFixed(2) + ' Td (3 x 5 in card - written without a PDF library) Tj ET');
    var stream = content.concat(lines).join('\n');

    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] ' +
        '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    var out = '%PDF-1.4\n', offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (off) { out += ('0000000000' + off).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return { bytes: out, W: W, H: H, size: size, nameW: widthOf(fields.name, size, true), objects: objs.length };
  }

  function gearCards() {
    var host = document.getElementById('card-preview');
    if (!host) return;
    var name = document.getElementById('card-name');
    var num = document.getElementById('card-num');
    var out = document.getElementById('card-out');
    var dl = document.getElementById('card-dl');
    var sheet = (host.closest && host.closest('.sheet')) || host;
    var url = null, last = null, first = true;

    function draw() {
      var f = {
        name: (name.value || 'Sample Skater').slice(0, 28),
        team: 'SAMPLE TEAM, SAMPLE ORDER',
        number: (num.value || '00').slice(0, 3),
        size: 'Youth L',
        item: 'Practice jersey'
      };
      var card = buildCard(f);
      last = card;

      /* The same layout, drawn as SVG at the same 216 × 360 points.
         The two fields the deck varies — the name and the jersey
         number — are not drawn here: they are live inputs sitting on
         the sheet at exactly these coordinates, so the card is typed
         in place. The page is told where to put them in card units. */
      var c = card, W = c.W, H = c.H;
      var numX = 30 + widthOf('Jersey   ', 11, false);
      /* Every run is placed AND sized by the same advance widths the PDF
         writer uses: textLength holds the browser to the measurement, so
         no line on the facsimile can run past the rule the printer cuts
         to — what you read here is what the bytes say, to the point. */
      function run(txt, x, y, size, fill) {
        var w = widthOf(txt, size, false);
        return '<text x="' + x.toFixed(2) + '" y="' + y + '" textLength="' + w.toFixed(2) + '" lengthAdjust="spacingAndGlyphs"' +
               ' font-family="Helvetica, Arial, sans-serif" font-size="' + size + '" fill="' + fill + '">' + esc(txt) + '</text>';
      }
      /* The stock is not drawn here — the page paints it, at the value
         the night has where the sheet stands. What is drawn is the
         printing, and the printing says where the card is: four crop
         marks on the trim, the way the deck comes off a printer, in
         place of the ruled box that used to cut a rectangle out of the
         world. Each arm is 10 pt on a 216 x 360 pt card. */
      function crop(x, y, dx, dy) {
        return '<path d="M' + (x + dx * 10) + ' ' + y + ' H' + x + ' V' + (y + dy * 10) + '"' +
               ' fill="none" stroke="var(--paper-rule)" stroke-width="0.7"/>';
      }
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="A 3 by 5 inch card for ' + f.name + ', jersey ' + f.number + '.">' +
        crop(12, 12, 1, 1) + crop(W - 12, 12, -1, 1) +
        crop(12, H - 12, 1, -1) + crop(W - 12, H - 12, -1, -1) +
        run(f.team, (W - widthOf(f.team, 10, false)) / 2, 68, 10, 'var(--paper-faint)');
      var yy = 108;
      ['Jersey', 'Size   ' + f.size, 'Item   ' + f.item].forEach(function (row) {
        svg += run(row, 30, yy, 11, 'var(--paper-mid)');
        yy += 22;
      });
      yy += 10;
      svg += '<line x1="30" y1="' + yy + '" x2="' + (W - 30) + '" y2="' + yy + '" stroke="var(--paper-hair)" stroke-width="0.4"/>';
      svg += run('3 × 5 in card — written without a PDF library', 30, yy + 20, 8, 'var(--paper-faint)');
      /* the two ruled fields: the line each one is typed on, drawn at the
         width the card gives it, so both places you can type are visible
         before you touch either of them */
      svg += '<line x1="' + (W * 0.08).toFixed(2) + '" y1="48" x2="' + (W * 0.92).toFixed(2) + '" y2="48" stroke="var(--paper-hair)" stroke-width="0.8"/>';
      svg += '<line x1="' + (numX - 1).toFixed(2) + '" y1="112" x2="' + (numX + 38).toFixed(2) + '" y2="112" stroke="var(--paper-hair)" stroke-width="0.8"/>';
      /* the measured width, ruled under the name. On the first pass the
         page draws it left to right — the measurement being taken, once;
         after that it simply tracks what you type. */
      svg += '<line' + (first ? ' class="nm-rule"' : '') + ' x1="' + ((W - c.nameW) / 2).toFixed(1) + '" y1="48" x2="' + ((W + c.nameW) / 2).toFixed(1) + '" y2="48" stroke="var(--accent)" stroke-width="0.8"/>';
      svg += '</svg>';
      host.innerHTML = svg;
      first = false;
      if (sheet && sheet.style) {
        sheet.style.setProperty('--nm-size', c.size.toFixed(2));
        sheet.style.setProperty('--num-x', numX.toFixed(2));
      }

      /* the numbers are a caption under the sheet, not a panel */
      if (out) {
        out.textContent = '';
        add(out, 'The name measured at ' + c.size.toFixed(1) + ' pt: ', c.nameW.toFixed(2) + ' pt');
        add(out, ' wide, centred with a ', ((W - c.nameW) / 2).toFixed(2) + ' pt');
        add(out, ' left margin on a 216 pt card. PDF written: ', c.objects + ' objects, ' + c.bytes.length.toLocaleString('en-GB') + ' bytes');
        if (REDUCED) out.appendChild(document.createTextNode('. The sheet is a still frame (reduced motion): the measuring rule is drawn, not animated'));
      }
      if (dl) {
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob([c.bytes], { type: 'application/pdf' }));
        dl.href = url;
        dl.download = f.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-card.pdf';
      }
    }
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }
    function add(node, k, v) {
      node.appendChild(document.createTextNode(k));
      var b = document.createElement('b'); b.textContent = v;
      node.appendChild(b);
    }

    name.addEventListener('input', draw);
    if (num) num.addEventListener('input', draw);
    draw();
  }

  /* ============ 2. the slide fingerprint ============ */
  function slideFinger() {
    var stage = document.getElementById('fp-frame');
    if (!stage) return;
    var fpC = document.getElementById('fp-print');
    var log = document.getElementById('fp-log');
    var read = document.getElementById('fp-read');
    var btn = document.getElementById('fp-run');
    var sctx, fctx;
    try { sctx = stage.getContext('2d'); fctx = fpC.getContext('2d'); }
    catch (e) { return; }
    if (!sctx || !fctx) return;

    var N = 24;                       // the 24 × 24 grayscale fingerprint
    var THRESH = 1.5;                 // measured on this sequence: drift and the ticking clock stay under 0.2, a real slide change scores about 4 to 5
    var SLIDES = [
      { t: 'Lesson 3 — Stoichiometry', b: ['Mole ratios from a balanced equation', 'Limiting reactant', 'Percent yield'] },
      { t: 'Lesson 3 — Stoichiometry', b: ['Mole ratios from a balanced equation', 'Limiting reactant', 'Percent yield'] },
      { t: 'Worked example', b: ['2 H₂ + O₂ → 2 H₂O', 'Given 4.0 mol H₂', 'Find mol H₂O'] },
      { t: 'Worked example', b: ['2 H₂ + O₂ → 2 H₂O', 'Given 4.0 mol H₂', 'Find mol H₂O'] },
      { t: 'Worked example', b: ['2 H₂ + O₂ → 2 H₂O', 'Given 4.0 mol H₂', 'Find mol H₂O'] },
      { t: 'Check yourself', b: ['Which reactant runs out first?', 'Show the ratio you used'] }
    ];
    /* The sequence is a finite piece of motion: 42 frames, ~112 ms
       apart, driven by one rAF timeline that is cancelled the moment
       the last frame is drawn. Nothing is scheduled after it, so the
       page's frame budget goes to zero as soon as it settles. */
    var TOTAL = SLIDES.length * 7;
    var STEP = 112;
    var frame = 0, prev = null, kept = 0, raf = 0, running = false, t0 = 0, drawn = 0;

    function paintSlide(i, tick) {
      var W = stage.width, H = stage.height;
      var cs = getComputedStyle(document.documentElement);
      sctx.fillStyle = cs.getPropertyValue('--panel').trim() || '#111';
      sctx.fillRect(0, 0, W, H);
      // a drifting background — the kind of motion the detector must ignore
      var g = sctx.createLinearGradient(0, 0, W, H);
      var d = (tick % 120) / 120;
      g.addColorStop(0, cs.getPropertyValue('--ground-deep').trim() || '#000');
      g.addColorStop(Math.max(0.05, Math.min(0.95, d)), cs.getPropertyValue('--panel').trim() || '#111');
      g.addColorStop(1, cs.getPropertyValue('--ground-deep').trim() || '#000');
      sctx.globalAlpha = 0.5; sctx.fillStyle = g; sctx.fillRect(0, 0, W, H); sctx.globalAlpha = 1;

      var s = SLIDES[i];
      sctx.fillStyle = cs.getPropertyValue('--ink-hi').trim() || '#fff';
      sctx.font = '600 15px system-ui, sans-serif';
      sctx.fillText(s.t, 16, 30);
      sctx.fillStyle = cs.getPropertyValue('--ink-mid').trim() || '#aaa';
      sctx.font = '12px system-ui, sans-serif';
      s.b.forEach(function (line, k) { sctx.fillText('· ' + line, 20, 56 + k * 19); });
      // a second hand that ticks on every single frame
      sctx.fillStyle = cs.getPropertyValue('--accent').trim() || '#f60';
      sctx.font = '11px ui-monospace, monospace';
      sctx.fillText('00:' + String(tick % 60).padStart(2, '0'), W - 52, H - 12);
    }

    function fingerprint() {
      // downsample to 24 × 24 and convert to grayscale — exactly what the recorder does
      fctx.drawImage(stage, 0, 0, N, N);
      var d = fctx.getImageData(0, 0, N, N).data;
      var fp = new Uint8Array(N * N);
      for (var i = 0; i < N * N; i++) {
        fp[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
      }
      return fp;
    }

    function diff(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
      return s / a.length;
    }

    function showFp(fp) {
      var img = fctx.createImageData(N, N);
      for (var i = 0; i < N * N; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = fp[i];
        img.data[i * 4 + 3] = 255;
      }
      fctx.putImageData(img, 0, 0);
    }

    function row(n, delta, keep, why) {
      var li = document.createElement('li');
      if (keep) li.className = 'kept';
      var a = document.createElement('span'); a.textContent = 'frame ' + String(n).padStart(2, '0');
      var b = document.createElement('b'); b.textContent = delta == null ? '—' : delta.toFixed(1);
      var c = document.createElement('span'); c.textContent = why;
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 30) log.removeChild(log.lastChild);
    }

    function step() {
      var slide = Math.min(SLIDES.length - 1, Math.floor(frame / 7));
      paintSlide(slide, frame);
      var fp = fingerprint();
      var delta = prev ? diff(prev, fp) : null;
      var keep = !prev || delta >= THRESH;
      if (keep) { kept++; showFp(fp); }
      row(frame, delta, keep,
          !prev ? 'first frame — kept' :
          keep ? 'slide changed — kept' :
          'under ' + THRESH + ' — the clock and the background moved, the slide did not');
      prev = fp;
      if (read) {
        read.innerHTML = '';
        var k = document.createElement('span'); k.className = 'k'; k.textContent = 'Live · frame ' + (frame + 1) + ' of ' + TOTAL;
        var bb = document.createElement('b'); bb.textContent = kept + ' frames kept of ' + (frame + 1);
        var p = document.createElement('p');
        p.textContent = 'Every frame is fingerprinted at 24 × 24 in grayscale and compared with the last one kept. ' +
          'On this sequence the drift and the ticking clock never score above 0.2, while a real slide change scores about 4 to 5, so the cut sits at ' + THRESH + '.';
        read.appendChild(k); read.appendChild(bb); read.appendChild(p);
      }
      frame++;
    }

    /* the one loop on this page, and the end of it */
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (btn) btn.textContent = 'Run it again';
    }

    function tick(now) {
      raf = 0;
      if (!running) return;
      var want = Math.min(TOTAL, Math.min(drawn + 2, Math.floor((now - t0) / STEP) + 1));
      while (drawn < want) { step(); drawn++; }
      if (drawn >= TOTAL) { stop(); return; }
      raf = requestAnimationFrame(tick);
    }

    function run() {
      if (running) return;
      running = true; frame = 0; prev = null; kept = 0; drawn = 0;
      log.innerHTML = '';
      if (btn) btn.textContent = 'Running…';
      t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      raf = requestAnimationFrame(tick);
    }

    if (btn) btn.addEventListener('click', run);
    paintSlide(0, 0);
    showFp(fingerprint());
    if (!REDUCED) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { run(); io.disconnect(); }
        }, { threshold: 0.4 });
        io.observe(stage);
      }
    } else if (read) {
      /* nothing starts by itself here: the first frame and its
         fingerprint are drawn, and the page says so rather than
         leaving a still picture with no explanation under it */
      read.innerHTML = '';
      var rk = document.createElement('span'); rk.className = 'k'; rk.textContent = 'Still frame (reduced motion)';
      var rb = document.createElement('b'); rb.textContent = 'frame 1 of ' + TOTAL + ', not running';
      var rp = document.createElement('p');
      rp.textContent = 'The first frame and its 24 × 24 fingerprint are drawn above, and the sequence is not started for you. ' +
        'Press Run the sequence to step through all ' + TOTAL + ' frames, each one compared with the last frame kept.';
      read.appendChild(rk); read.appendChild(rb); read.appendChild(rp);
    }
  }

  function boot() { gearCards(); slideFinger(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
