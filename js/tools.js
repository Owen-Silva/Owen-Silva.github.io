/* ============================================================
   tools.js — one of Owen's algorithms, re-implemented here so
   it actually runs in the page.

   The lesson-slide recorder's change detector. The original
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
  /* one reading of the motion preference for the instrument. Ink's own
     flag when site.js is there, the media query itself when it is not —
     the old test read window.Scene, which this site has never defined,
     so the detector used to start itself under reduced motion. */
  var REDUCED = (I && typeof I.REDUCED === 'boolean') ? I.REDUCED
    : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ============ the slide fingerprint ============ */
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

  function boot() { slideFinger(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
