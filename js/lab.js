/* ============================================================
   lab.js — load-on-demand exhibits.

   Nothing heavy loads until it is asked for: the game is ~47 KB,
   the seven studies are 82–255 KB each and only the selected one
   is ever in the document.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;

  /* the seven studies; briefs are the ones written when they were judged */
  var STUDIES = [
    { l: 'A', name: 'Proof sheet', file: 'A-proof-sheet.html', kb: '225 KB',
      brief: 'Atlas as ink on paper: a printer’s proof pulled before the real run, where marks overprint where they cross, screen into halftone to go grey, and take their depth from ink density rather than from light.' },
    { l: 'B', name: 'Bench', file: 'B-bench.html', kb: '255 KB',
      brief: 'Atlas as objects on a workbench lit from one side — ceramic, bone plastic and brass on plaster, with every shadow offset driven by three lighting tokens so the whole page reads as one photographed scene.' },
    { l: 'C', name: 'Station', file: 'C-station.html', kb: '183 KB',
      brief: 'Atlas as a weather station’s paper record: charts plotted on gridded field stock, a ladder of drafting hairline weights, and a second ink reserved for everything a person added by hand afterwards.' },
    { l: 'D', name: 'Prism', file: 'D-prism.html', kb: '82 KB', approved: true,
      brief: 'Atlas as light through glass: a beam goes in and its components come out, built from dispersion gradients, interference rings and subtractive overlaps rather than frosted panels.' },
    { l: 'E', name: 'Console', file: 'E-console.html', kb: '200 KB',
      brief: 'Atlas as one machined control surface seen head-on — an anodised panel with milled pockets, engraved legends and backlit windows, where every section is a different region of the same object.' },
    { l: 'F', name: 'Viscosity', file: 'F-viscosity.html', kb: '167 KB',
      brief: 'Atlas as soft bodies and fluid: metaballs that merge and neck under a gooey filter, iridescent films and meniscus edges, built to read in a still frame first and move second.' },
    { l: 'G', name: 'Lattice', file: 'G-lattice.html', kb: '239 KB',
      brief: 'Atlas as generated structure — Voronoi cells and space frames whose visual weight comes from how dense the lattice is rather than how dark it is painted, thickening where the load concentrates.' }
  ];

  function frame(src, title) {
    var f = document.createElement('iframe');
    f.src = src;
    f.title = title;
    f.loading = 'lazy';
    f.setAttribute('referrerpolicy', 'no-referrer');
    return f;
  }

  /* ---------- the game ---------- */
  function game(state) {
    var stage = document.getElementById('game-stage');
    var idle = document.getElementById('game-idle');
    var btn = document.getElementById('game-play');
    var note = document.getElementById('game-note');
    if (!stage || !btn) return;
    btn.addEventListener('click', function () {
      var f = frame('exhibits/game/index.html', 'Star Wars: Strategic Battle — playable, mouse only');
      stage.appendChild(f);
      if (idle) idle.remove();
      if (note) note.textContent = 'Running · mouse only · press Escape or tab away to leave it';
      f.addEventListener('load', function () { try { f.contentWindow.focus(); } catch (e) {} });
      state('the game is running in its own frame', false, 'game');
    });
  }

  /* ---------- the studies ---------- */
  function studies(state) {
    var tabs = document.getElementById('study-tabs');
    var brief = document.getElementById('study-brief');
    var stage = document.getElementById('study-stage');
    var idle = document.getElementById('study-idle');
    var loadBtn = document.getElementById('study-load');
    var note = document.getElementById('study-note');
    var open = document.getElementById('study-open');
    if (!tabs || !stage) return;

    var current = 3;                 // D, the approved one
    var loaded = false;

    STUDIES.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === current));
      b.setAttribute('aria-controls', 'study-stage');
      b.id = 'tab-' + s.l;
      if (s.approved) b.className = 'is-approved';
      var em = document.createElement('em'); em.textContent = s.l;
      b.appendChild(em);
      b.appendChild(document.createTextNode(s.name));
      b.setAttribute('aria-label', 'Study ' + s.l + ', ' + s.name + (s.approved ? ', approved and shipped' : '') + '. ' + s.kb + '.');
      b.addEventListener('click', function () { select(i, true); });
      b.addEventListener('keydown', function (ev) {
        var d = ev.key === 'ArrowRight' ? 1 : (ev.key === 'ArrowLeft' ? -1 : 0);
        if (!d) return;
        ev.preventDefault();
        var n = (i + d + STUDIES.length) % STUDIES.length;
        tabs.children[n].focus();
        select(n, true);
      });
      tabs.appendChild(b);
    });

    function select(i, userAsked) {
      current = i;
      var s = STUDIES[i];
      [].forEach.call(tabs.children, function (b, k) { b.setAttribute('aria-selected', String(k === i)); });
      /* the poster names the study that is waiting, at poster scale */
      var letter = document.getElementById('study-letter');
      if (letter) letter.textContent = s.l;
      if (brief) {
        brief.textContent = '';
        if (s.approved) {
          var strong = document.createElement('strong');
          strong.textContent = 'Approved and shipped. ';
          brief.appendChild(strong);
        }
        brief.appendChild(document.createTextNode(s.brief));
      }
      if (note) note.textContent = 'Study ' + s.l + ' · ' + s.name + ' · ' + s.kb + (loaded ? ' · loaded' : ' · not loaded yet');
      if (open) {
        open.href = 'exhibits/atlas-design/' + s.file;
        open.setAttribute('aria-label', 'Open study ' + s.l + ', ' + s.name + ', full page in a new tab');
      }
      if (loaded || userAsked === 'force') load();
    }

    function load() {
      var s = STUDIES[current];
      var old = stage.querySelector('iframe');
      if (old) old.remove();
      if (idle && idle.parentNode) idle.remove();
      stage.appendChild(frame('exhibits/atlas-design/' + s.file, 'Atlas design study ' + s.l + ' — ' + s.name));
      loaded = true;
      if (note) note.textContent = 'Study ' + s.l + ' · ' + s.name + ' · ' + s.kb + ' · loaded';
      state('study ' + s.l + ' (' + s.name + ') is loaded; the other six are not', false, 'study');
    }

    if (loadBtn) loadBtn.addEventListener('click', load);
    select(current, false);
  }

  function boot() {
    var state = I.reporter('lab-state');
    state('3 exhibits · nothing loads until you ask for it', false, 'lab');
    /* the page's own scenes each say this in their own readout; this is
       the one for the night the page stands in, which has no other line */
    if (I.REDUCED) state('the night is a still frame (reduced motion)', false, 'rm');
    game(state);
    studies(state);
    if (location.hash) {
      var t = document.querySelector(location.hash);
      if (t) t.scrollIntoView({ block: 'start', behavior: I.REDUCED ? 'auto' : 'smooth' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
