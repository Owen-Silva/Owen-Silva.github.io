/* ============================================================
   site.js — shared: theme, kinetic type, data loading, status,
   and the two site-wide systems this file owns:

   · CHOREOGRAPHY — one entrance language for all seven pages.
     Opt in on any element with

         data-enter="rise" | "fade" | "bleed"
         data-delay="240"                (ms, optional)
         data-stagger="70"               (ms, on a PARENT: its
                                          [data-enter] children
                                          arrive one after another)

     Things arrive when they reach the camera; they never appear.
     A small default set is claimed automatically on every page so
     the language is already there before a page lane opts in.
     If this script never runs, nothing is hidden: the "pre" state
     is written by JS, not by the markup.

   · PAGE TRANSITIONS — the camera moves, the world stays. A click
     on an internal link is not a cut. The leaving page holds its
     nav, the ambient world dims to a third of itself and leans two
     per cent closer, the type lifts away, and only then does the
     navigation start (--dur-fast, on the leaving curve). A pull-
     BACK was drawn first and measured out again: shrinking a fixed
     layer opens a letterbox at the frame's edge (the note is at
     the rule). The arriving
     document starts from that same receded pose and settles out of
     it over --dur-base while the entrances it already runs bring
     the type up from below — so two documents read as one camera
     move. It is CSS classes on <html> and one flag in
     sessionStorage; the cross-document view transition stays OFF,
     because it froze the arriving document in every Chromium tried
     here (the measurement is written out at the rule). Nothing on
     this path can strand a page: the arriving pose is a keyframe
     with fill BOTH, so it ends at rest even if every script after
     it dies, and a navigation that has not started 200 ms after
     the out move puts the page back and says so.

   The easing family, used by every file in this engine, is "ink":
     --ease-ink       cubic-bezier(.22,.61,.24,1)    arrive, settle
     --ease-ink-long  cubic-bezier(.16,.84,.26,1)    big camera moves
     --ease-ink-io    cubic-bezier(.62,.02,.20,1)    in-out, leaving
     --dur-fast 320ms   --dur-base 560ms   --dur-long 860ms
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EASE = {
    ink:  'cubic-bezier(.22,.61,.24,1)',
    long: 'cubic-bezier(.16,.84,.26,1)',
    io:   'cubic-bezier(.62,.02,.20,1)'
  };
  var DUR = { fast: 320, base: 560, long: 860 };

  /* ---- the stylesheet this file owns ------------------------ */
  function engineCSS() {
    var root = getComputedStyle(document.documentElement);
    var haveTokens = !!root.getPropertyValue('--ease-ink').trim();

    var tokens = haveTokens ? '' :
      ':root{' +
      '--ease-ink:' + EASE.ink + ';' +
      '--ease-ink-long:' + EASE.long + ';' +
      '--ease-ink-io:' + EASE.io + ';' +
      '--dur-fast:' + DUR.fast + 'ms;' +
      '--dur-base:' + DUR.base + 'ms;' +
      '--dur-long:' + DUR.long + 'ms;}';

    return tokens + [
      /* No background on <html>: the body's ground has to keep propagating to
         the canvas, or it would paint OVER the world (negative z-index
         descendants are painted before in-flow block backgrounds). The
         propagated background is also what keeps the gap between two
         documents the colour of the night instead of white. */

      /* native, cancellable, and only for jumps the page itself makes */
      '@media (prefers-reduced-motion: no-preference){:root{scroll-behavior:smooth;}}',

      /* where the horizon sits, as a fraction of the viewport: the same two
         numbers scene.js carries, so the CSS horizon this file mounts before
         the first frame stands exactly where the engine's will */
      ':root{--ink-hor:67.5vh;}',
      '@media (max-width:600px),(pointer:coarse){:root{--ink-hor:70.5vh;}}',

      /* ---- the ambient world ----
         The host does NOT fade. It went 0 → 1 over --dur-long the moment
         scene.js mounted it, which on an arriving page put the whole night a
         second behind the type it belongs under (QA-4 D3). It is mounted
         before the first frame now, and only the LAND resolves — only the
         land has to wait for a canvas to be painted. */
      '.ink-world{position:fixed;inset:0;z-index:-1;contain:paint;pointer-events:none;opacity:1;}',
      '.ink-world__ridge{position:fixed;left:0;width:100%;display:block;pointer-events:none;',
      'opacity:0;transition:opacity var(--dur-base,560ms) var(--ease-ink-long,cubic-bezier(.16,.84,.26,1));}',
      '.ink-world.is-live .ink-world__ridge{opacity:1;}',
      /* The hero band paints its own copy of the CSS ground (ink.css), which
         would sit ON TOP of the world. Stand it down ONLY once the world has
         actually mounted, so a page with no world keeps its ground exactly as
         the stylesheet wrote it. See the report: this belongs in ink.css. */
      'html.has-ink-world .band-hero{background-color:transparent;background-image:none;}',
      /* The horizon exists before any canvas has drawn, and still exists when
         none can. It carries no rule of its own any more — a 1 px accent line
         across the whole width is the ruled edge QA-4 booked as D5, and it is
         the first thing an arriving page would have shown. Two washes and a
         little warmth at the meeting: a horizon, not a divider. */
      '.ink-world__line{position:fixed;left:0;width:100%;height:0;top:var(--ink-hor,67.5vh);opacity:.86;}',
      /* One gradient across the meeting, not two elements butted against it:
         the sky wash ended and the ground wash began on the same row, a
         full-width step of 26 levels — a ruled line by another name (QA-4
         D5, measured with the page hidden). Nothing here now changes by
         more than about a level per row. */
      '.ink-world__line::before{content:"";position:absolute;left:0;right:0;bottom:-30vh;height:54vh;',
      'background:linear-gradient(to bottom,transparent 40%,',
      'color-mix(in srgb,var(--accent) 24%,transparent) 44.4%,transparent 53%),',
      'linear-gradient(to bottom,transparent 0,',
      'color-mix(in srgb,var(--wash-c) 26%,transparent) 28%,',
      'color-mix(in srgb,var(--wash-c) 78%,transparent) 44.4%,',
      'color-mix(in srgb,var(--ground-deep) 58%,transparent) 56%,',
      'color-mix(in srgb,var(--ground-deep) 90%,transparent) 78%,transparent 100%);}',
      '@supports not (background: color-mix(in srgb, red 50%, blue)){',
      '.ink-world__line::before{background:linear-gradient(to bottom,transparent,',
      'var(--wash-c) 44.4%,var(--ground-deep) 78%,transparent);}}',

      /* ---- choreography ---- */
      '[data-enter][data-enter-state="pre"]{opacity:0;will-change:opacity,transform;}',
      '[data-enter="rise"][data-enter-state="pre"]{transform:translate3d(0,28px,0);}',
      '[data-enter="bleed"][data-enter-state="pre"]{filter:blur(13px);transform:scale(1.014);}',
      '[data-enter][data-enter-state="in"]{opacity:1;transform:none;filter:none;',
      'transition:opacity var(--dur-base,560ms) var(--ease-ink,cubic-bezier(.22,.61,.24,1)) var(--enter-delay,0ms),',
      'transform var(--dur-long,860ms) var(--ease-ink-long,cubic-bezier(.16,.84,.26,1)) var(--enter-delay,0ms),',
      'filter var(--dur-long,860ms) var(--ease-ink-long,cubic-bezier(.16,.84,.26,1)) var(--enter-delay,0ms);}',
      '[data-enter][data-enter-state="done"]{opacity:1;transform:none;filter:none;will-change:auto;}',

      /* ---- page transitions: the camera moves, the world stays ----
         The cross-document transition is OFF, and this is why. Measured
         2026-09-17, portal -> about, headless Chromium, with and without
         the GL backend: with '@view-transition{navigation:auto;}' the
         arriving document never renders a frame — .ink-world stays at
         opacity 0 with is-live on it, 20 [data-enter] blocks stay at
         "pre", a screenshot cannot be taken for 120 s, and the page
         throws "Transition was skipped". With that one rule removed,
         every one of those is correct 2.5 s after the click (opacity 1,
         the entrances released, no error). Removing the named groups and
         adding layout containment each changed nothing, so it is the
         navigation opt-in itself. A page that arrives dark is worse than
         a page that arrives plainly; the rules below cost nothing while
         no transition runs, so turning it back on is this one line once
         a build finishes what it starts. The named groups below and the
         ::view-transition rules are left exactly as they were and are
         inert: with no navigation opt-in and no startViewTransition call,
         a view-transition-name declaration does nothing at all. The move
         the site actually plays is the camera below, which needs none of
         this. */
      '::view-transition-group(root){animation-duration:var(--dur-base,560ms);animation-timing-function:var(--ease-ink-long,cubic-bezier(.16,.84,.26,1));}',
      '::view-transition-old(root){animation:ink-cam-out var(--dur-fast,320ms) var(--ease-ink-io,cubic-bezier(.62,.02,.20,1)) both;}',
      '::view-transition-new(root){animation:ink-cam-in var(--dur-base,560ms) var(--ease-ink-long,cubic-bezier(.16,.84,.26,1)) both;}',
      '@keyframes ink-cam-out{to{opacity:0;transform:scale(1.018) translate3d(0,-14px,0);}}',
      '@keyframes ink-cam-in{from{opacity:0;transform:scale(.986) translate3d(0,22px,0);}}',
      '.ink-world{view-transition-name:ink-world;}',
      '.nav{view-transition-name:ink-nav;}',
      '::view-transition-group(ink-world){animation-duration:640ms;animation-timing-function:var(--ease-ink-long,cubic-bezier(.16,.84,.26,1));}',
      '::view-transition-new(ink-world){animation:none;}',
      '::view-transition-old(ink-world){animation:ink-hold 640ms linear both;}',
      '@keyframes ink-hold{0%,72%{opacity:1}100%{opacity:0}}',
      '::view-transition-group(ink-nav){animation-duration:var(--dur-fast,320ms);animation-timing-function:var(--ease-ink,cubic-bezier(.22,.61,.24,1));}',
      '::view-transition-old(ink-nav),::view-transition-new(ink-nav){animation:none;}',

      /* ---- the camera move that is actually played ----
         Two classes on <html>, and nothing asked of the browser but a
         transition and a keyframe. OUT, on the page being left: the world
         dims and leans a hair closer, the type lifts and goes. The nav is
         in neither rule, so it is the one thing that does not move across
         the cut, and it stands in the same place in the next document. IN,
         on the page arriving: the same pose, played out.

         Two decisions worth the words. The dimmer is a FILTER, not opacity:
         it multiplies the world's own mount fade (.ink-world goes 0 -> 1 on
         is-live) instead of fighting it for the same property, so a world
         that has not mounted yet is not forced visible and one that has is
         not snapped. And the arriving pose is a keyframe with fill BOTH,
         whose last frame is the resting pose — filter:opacity(1) is a
         no-op and transform:none is the default — so if the class is never
         removed, or every script after this one dies, the page still ends
         exactly where it should. Only transform, opacity and filter move:
         no layout is read or written on either side. */
      'html.ink-cam .ink-world,html.ink-cam #world{',
      'transition:filter var(--dur-fast,320ms) var(--ease-ink-io,cubic-bezier(.62,.02,.20,1)),',
      'transform var(--dur-fast,320ms) var(--ease-ink-io,cubic-bezier(.62,.02,.20,1));}',
      'html.ink-cam main{transition:opacity var(--dur-fast,320ms) var(--ease-ink-io,cubic-bezier(.62,.02,.20,1)),',
      'transform var(--dur-base,560ms) var(--ease-ink-io,cubic-bezier(.62,.02,.20,1));}',
      /* The world's move is INTO the night, not away from it: .ink-world is
         a fixed layer with contain:paint, so its clip box travels with its
         own transform. Scaling it down let the ground show at the edges —
         a letterbox, measured at 1280 (shots/strip-1280-0560): the camera
         became a shrinking picture. Scaling it up by 2% over-fills the
         frame by 12.8 px at 1280 and 9 px at 900, so the 6 px drift can
         never open a seam, and the page reads as the camera moving on
         while the type lifts off it. */
      'html.ink-out .ink-world,html.ink-out #world{filter:opacity(.34);transform:scale(1.02) translate3d(0,6px,0);}',
      'html.ink-out main{opacity:0;transform:translate3d(0,-16px,0);}',
      'html.ink-arrive .ink-world,html.ink-arrive #world{',
      'animation:ink-cam-arrive var(--dur-base,560ms) var(--ease-ink-long,cubic-bezier(.16,.84,.26,1)) both;}',
      '@keyframes ink-cam-arrive{from{filter:opacity(.34);transform:scale(1.02) translate3d(0,6px,0);}',
      'to{filter:opacity(1);transform:none;}}',

      /* ---- the two paths that must never animate ---- */
      '@media (prefers-reduced-motion: reduce){',
      '[data-enter][data-enter-state]{opacity:1 !important;transform:none !important;',
      'filter:none !important;transition:none !important;}',
      '.ink-world{transition:none;opacity:1;}',
      '.ink-world__ridge{transition:none;opacity:1;}',
      /* the camera never runs here — the JS returns before it can add a
         class — but the rules are stood down anyway, so a class left on
         <html> by anything at all cannot dim a reduced-motion page */
      'html.ink-cam .ink-world,html.ink-cam #world,html.ink-out .ink-world,html.ink-out #world,',
      'html.ink-arrive .ink-world,html.ink-arrive #world{animation:none;transition:none;',
      'filter:none;transform:none;}',
      'html.ink-cam main,html.ink-out main{opacity:1;transform:none;transition:none;}',
      '::view-transition-old(root),::view-transition-new(root),',
      '::view-transition-old(ink-world),::view-transition-new(ink-world){animation:none;}}',
      '@media print{[data-enter][data-enter-state]{opacity:1 !important;transform:none !important;',
      'filter:none !important;}.ink-world{display:none;}',
      'html.ink-out main{opacity:1 !important;transform:none !important;}}'
    ].join('');
  }

  function injectCSS() {
    if (document.getElementById('ink-engine-css')) return;
    var s = document.createElement('style');
    s.id = 'ink-engine-css';
    s.textContent = engineCSS();
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---- theme: INK -> PAPER -> AUTO -------------------------- */
  var ORDER = ['dark', 'light', 'auto'];
  var NAMES = { dark: 'Ink', light: 'Paper', auto: 'Auto' };

  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('ink-theme', t); } catch (e) {}
    var b = document.getElementById('theme-btn');
    if (b) {
      b.textContent = NAMES[t];
      b.setAttribute('aria-label', 'Colour: ' + NAMES[t] + '. Activate for ' + NAMES[ORDER[(ORDER.indexOf(t) + 1) % 3]] + '.');
    }
    document.dispatchEvent(new CustomEvent('inkthemechange', { detail: { theme: t } }));
  }

  function currentTheme() {
    var t;
    try { t = localStorage.getItem('ink-theme'); } catch (e) {}
    return ORDER.indexOf(t) >= 0 ? t : 'dark';
  }

  function initTheme() {
    var b = document.getElementById('theme-btn');
    applyTheme(currentTheme());
    if (b) b.addEventListener('click', function () {
      applyTheme(ORDER[(ORDER.indexOf(currentTheme()) + 1) % 3]);
    });
  }

  /* ---- kinetic type: headings ink in once, then stay -------- */
  function initInk() {
    var supported = typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function';
    if (!supported || REDUCED) return;              // no mask at all: text is simply there
    document.documentElement.classList.add('kin');
    var targets = document.querySelectorAll('.ink-in');
    if (!('IntersectionObserver' in window)) {
      [].forEach.call(targets, function (t) { t.classList.add('on'); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('on');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    [].forEach.call(targets, function (t) { io.observe(t); });
  }

  /* ---- choreography ----------------------------------------
     One language: rise (blocks of type), fade (scenes and plates),
     bleed (a pull quote soaking into the page). Everything is
     opt-in by attribute; the defaults below only fill in the
     blocks every page already has, and never touch an element a
     page lane has already spoken for. */
  var AUTO = [
    ['.band-hero .eyebrow', 'rise'],
    ['.band-hero h1', 'rise'],
    ['.band-hero .lede', 'rise'],
    ['.band-hero__tools', 'rise'],
    ['.band-hero .pane', 'fade'],
    ['.hero-shell', 'fade'],
    ['main .page-head', 'rise'],
    ['main section > h2', 'rise'],
    ['main section > .lede', 'rise'],
    ['main figure', 'fade'],
    ['main .stage', 'fade'],
    ['main blockquote', 'bleed']
  ];
  var KINDS = { rise: 1, fade: 1, bleed: 1 };
  var io = null;

  /* A DEFAULT MAY NOT HIDE THE FIRST SCREEN. The AUTO list above is a
     convenience: it gives a page the language before its own lane opts in.
     It has no business claiming an element that already fills the frame and
     carries the page's first heading — that element is not a block arriving
     into the camera, it is the page, and holding it at opacity 0 holds the
     name. index's .hero-shell is the case that taught this (QA-3, blocker
     D3): claimed by the default, it kept "Owen Silva" unreadable until the
     observer released it, measured here at 2543 ms and 1696 ms to a
     readable h1 (5746 ms and 4482 ms on QA-3's box) against 129-551 ms on
     every other page, and the name already has its own keyframe in
     index.html. Markup that opts in by writing data-enter itself is still
     honoured — this only refuses the default. */
  function coversFirstScreen(el) {
    try {
      var vh = window.innerHeight || 800;
      var r = el.getBoundingClientRect();
      return r.top < vh * 0.5 && r.bottom > 0 && r.height >= vh * 0.8 && !!el.querySelector('h1');
    } catch (e) { return false; }
  }

  /* AND A NAME THE PAGE HAS ALREADY PAINTED MAY NOT BE UN-PAINTED. This runs
     from a deferred script, so the browser has already put the first screen
     up by the time anything here can claim it: measured on atlas at 393, the
     h1 was on screen at full opacity at 77 ms, was taken back to opacity 0
     with a 28 px offset, and only came back at 1.4 s. That is not an
     entrance, it is a flicker — the name arrives, leaves and arrives again.
     So a heading that is already on the first screen is claimed exactly as
     before (it keeps its slot in the stagger, so nothing around it moves)
     and released in the same breath: it never goes to `pre`, so `release`
     has nothing to do and it is never animated. Blocks that arrive INTO the
     camera — the eyebrow, the lede, the tools, the page head — are untouched
     by this; only the page's own name is. index is unaffected either way:
     .hero-shell is refused above and its name has its own keyframe. */
  function paintedName(el) {
    try {
      if (!el.tagName || el.tagName.toUpperCase() !== 'H1') return false;
      var vh = window.innerHeight || 800;
      var r = el.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.width > 0;
    } catch (e) { return false; }
  }

  function release(el) {
    if (el.getAttribute('data-enter-state') !== 'pre') return;
    var d = el.__enterDelay || 0;
    if (d) el.style.setProperty('--enter-delay', d + 'ms');
    el.setAttribute('data-enter-state', 'in');
    var ms = DUR.long + d + DUR.fast / 2;
    setTimeout(function () {
      if (el.getAttribute('data-enter-state') === 'in') el.setAttribute('data-enter-state', 'done');
    }, ms);
  }

  function claim(el, kind) {
    if (!el || el.__entered) return;
    if (el.classList && el.classList.contains('ink-in')) return;   // already has its own reveal
    if (el.closest && el.closest('[data-enter-state]') && el.closest('[data-enter-state]') !== el) return;
    var k = el.getAttribute('data-enter') || kind || 'rise';
    if (!KINDS[k]) k = 'rise';
    el.__entered = true;
    el.setAttribute('data-enter', k);
    /* under reduced motion nothing is ever hidden, not even for a frame —
       and neither is a name the page has already put on the screen */
    el.setAttribute('data-enter-state', (REDUCED || paintedName(el)) ? 'done' : 'pre');
    if (REDUCED) return;
    var explicit = parseInt(el.getAttribute('data-delay'), 10);
    if (explicit > 0) el.__enterDelay = Math.min(1200, explicit);
    return true;
  }

  function observe(el) {
    if (io) io.observe(el); else release(el);
  }

  /* claim everything inside `root` and start watching it */
  function enter(root) {
    var scope = typeof root === 'string' ? document.querySelector(root) : (root || document);
    if (!scope) return;
    var list = [];
    try {
      [].forEach.call(scope.querySelectorAll('[data-enter]'), function (el) {
        if (claim(el)) list.push(el);
      });
      if (scope.nodeType === 1 && scope.hasAttribute('data-enter') && claim(scope)) list.push(scope);
    } catch (e) {}
    stagger(list);
    list.forEach(observe);
  }

  /* a parent with data-stagger hands its claimed children a queue */
  function stagger(list) {
    var groups = [];
    list.forEach(function (el) {
      var p = el.parentElement && el.parentElement.closest ? el.parentElement.closest('[data-stagger]') : null;
      if (!p) return;
      if (groups.indexOf(p) < 0) groups.push(p);
    });
    groups.forEach(function (p) {
      var step = parseInt(p.getAttribute('data-stagger'), 10) || 70;
      var kids = list.filter(function (el) { return p.contains(el); });
      kids.forEach(function (el, i) {
        if (el.__enterDelay == null) el.__enterDelay = Math.min(720, i * step);
      });
    });
  }

  function initEnter() {
    if (!('IntersectionObserver' in window)) {
      [].forEach.call(document.querySelectorAll('[data-enter]'), function (el) {
        el.setAttribute('data-enter-state', 'done');
      });
      return;
    }
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        release(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.04 });

    var claimed = [];
    AUTO.forEach(function (pair) {
      var els;
      try { els = document.querySelectorAll(pair[0]); } catch (e) { return; }
      [].forEach.call(els, function (el) {
        if (!el.hasAttribute('data-enter') && coversFirstScreen(el)) return;
        if (claim(el, pair[1])) claimed.push(el);
      });
    });
    [].forEach.call(document.querySelectorAll('[data-enter]'), function (el) {
      if (claim(el)) claimed.push(el);
    });

    /* whatever is already on screen arrives as one sequence */
    var vh = window.innerHeight || 800, n = 0;
    claimed.forEach(function (el) {
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { return; }
      if (r.top < vh * 0.94 && r.bottom > 0 && el.__enterDelay == null) {
        /* on an arrival the camera is still settling out of the receded
           pose, so the first screen of type waits one beat behind it — the
           same contract, one offset, nothing re-animated */
        el.__enterDelay = Math.min(DUR.base, n * 80 + (ARRIVED ? CAM.lead : 0)); n++;
      }
    });
    stagger(claimed);
    claimed.forEach(observe);

    /* nothing may stay invisible because an observer misfired */
    setTimeout(function () {
      [].forEach.call(document.querySelectorAll('[data-enter-state="pre"]'), function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) && r.bottom > 0) { el.__enterDelay = 0; release(el); }
      });
    }, DUR.long * 3);
  }

  /* ---- page transitions: one camera move across two documents ----
     A click on an internal link holds the nav, lets the world and the type
     recede, and only then navigates; the next document starts from that
     same pose and settles out of it while its own entrances run. The rules
     this path keeps, in the order they are checked:
     · a modified click, a middle or right button, a download, a target, an
       external or non-http link, a hash on this same page and the skip
       link all keep their native behaviour — the handler returns before it
       can touch them, so the browser's own behaviour is never replaced;
     · prefers-reduced-motion: reduce is a plain navigation, no out move;
     · if the navigation has not started CAM.grace after the out move, the
       page is put back exactly as it was and says so in the console once;
     · a document restored from the back/forward cache is reset to rest, so
       it can never come back dimmed or halfway through a move. */
  var CAM = {
    out: DUR.fast,        /* the whole out move — well inside --dur-base */
    grace: 200,           /* still here this long after it? put the page back */
    settle: DUR.base,     /* the arriving page's settle out of the pose */
    lead: 90,             /* the first screen of type waits one beat on arrival */
    fresh: 2500,          /* an older flag belongs to some other navigation */
    key: 'ink-cam'
  };
  /* the seven documents this engine draws; anything else navigates plainly,
     because only these carry the arriving half of the move */
  var PAGES = /(?:^|\/)(index|atlas|browser|portal|projects|lab|about)\.html$/;
  var leaving = false, unloading = false, said = false, ARRIVED = false;

  /* soft: the pose is dropped but the transition is left in place for one
     more move, so a page that has to be put back eases back instead of
     snapping. Hard (the default) is for a restored document, where there is
     nothing to ease from. */
  function camReset(soft) {
    var h = document.documentElement;
    h.classList.remove('ink-out');
    h.classList.remove('ink-arrive');
    if (soft) setTimeout(function () { if (!leaving) h.classList.remove('ink-cam'); }, DUR.fast + 40);
    else h.classList.remove('ink-cam');
    leaving = false;
    /* The soft path keeps the flag. Measured: on a loaded machine a
       navigation can commit later than CAM.grace, the page is put back as
       the rule says — and if the flag went with it, the document that then
       arrives has no pose and hard-cuts. A kept flag can only pose a
       document that STARTED within CAM.fresh of the click, so the worst it
       can do is play the arriving half of a move the visitor did ask for. */
    if (!soft) { try { sessionStorage.removeItem(CAM.key); } catch (e) {} }
  }

  /* the out move, then the navigation. false means "not taken" and the
     caller must leave the click to the browser. */
  function leave(href) {
    if (REDUCED || leaving || !href) return false;
    var h = document.documentElement;
    leaving = true;
    /* written in the same task as the navigation: the next document reads
       it before its first frame and poses itself to match */
    try { sessionStorage.setItem(CAM.key, String(Date.now())); } catch (e) {}
    /* a click while this page was still arriving: the arriving keyframe
       fills BOTH, and a CSS animation outranks a transition, so it would
       hold the world at rest through the whole out move. Drop it first. */
    h.classList.remove('ink-arrive');
    h.classList.add('ink-cam');
    h.classList.add('ink-out');
    setTimeout(function () { location.href = href; }, CAM.out);
    setTimeout(function () {
      if (unloading || !leaving) return;      /* this document is on its way out */
      camReset(true);                         /* ease it back, do not snap it */
      if (!said && window.console) {
        said = true;
        console.warn('page transition: ' + href + ' had not started ' +
          (CAM.out + CAM.grace) + ' ms after the click, so this page was put back.');
      }
    }, CAM.out + CAM.grace);
    return true;
  }

  function camClick(ev) {
    if (ev.defaultPrevented || ev.button !== 0) return;          /* left button only */
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var t = (a.getAttribute('target') || '').trim();
    if (t && t !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (/\bexternal\b/i.test(a.getAttribute('rel') || '')) return;
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#') return;                   /* a jump inside this page */
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin) return;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (!PAGES.test(u.pathname)) return;
    if (u.pathname === location.pathname) return;                /* this same document */
    if (leaving) { ev.preventDefault(); return; }                /* a move is already running */
    if (leave(u.href)) ev.preventDefault();
    /* Enter on a focused link dispatches this same click, with button 0 and
       no modifier, so the keyboard takes the identical path. */
  }

  /* Did this document arrive from the move? The flag is only good while it
     is fresh, so a reload, a bookmark, a typed URL or a click that was
     abandoned never poses the page. */
  function camArrive() {
    if (REDUCED) return false;
    var t = 0;
    try { t = +sessionStorage.getItem(CAM.key) || 0; sessionStorage.removeItem(CAM.key); } catch (e) {}
    if (!t) return false;
    /* measured against when this DOCUMENT started, not when this script got
       to run: on a slow machine a deferred script can be seconds behind its
       own navigation, and that must not decide whether the page is posed */
    var born = Date.now();
    try {
      if (window.performance && performance.timeOrigin) born = performance.timeOrigin;
      else if (window.performance && performance.timing) born = performance.timing.navigationStart;
    } catch (e) {}
    var age = born - t;
    if (age < -50 || age > CAM.fresh) return false;
    var h = document.documentElement;
    h.classList.add('ink-arrive');                 /* the pose, before the first frame */
    setTimeout(function () { h.classList.remove('ink-arrive'); }, CAM.settle + 120);
    return true;
  }

  function initCam() {
    document.addEventListener('click', camClick);
    window.addEventListener('pagehide', function () { unloading = true; });
  }

  /* returning through the back/forward cache must not show a blank page,
     and must not show a receded one either */
  window.addEventListener('pageshow', function (ev) {
    unloading = false;
    if (!ev.persisted) return;
    camReset();
    [].forEach.call(document.querySelectorAll('.ink-world,#world,main'), function (el) {
      el.style.filter = ''; el.style.transform = ''; el.style.opacity = '';
    });
    [].forEach.call(document.querySelectorAll('[data-enter-state="pre"]'), function (el) {
      el.setAttribute('data-enter-state', 'done');
    });
  });

  /* ---- data ------------------------------------------------- */
  function loadJSON(path) {
    return fetch(path, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  /* ---- a status line that never hides a failure -------------
     Several subsystems share one line, each on its own channel, so a later
     success can never quietly overwrite an earlier failure's reason. */
  function reporter(id) {
    var el = document.getElementById(id);
    return function (msg, bad, channel) {
      if (!el) return;
      if (!el.__slots) { el.__slots = {}; el.__order = []; }
      var k = channel || 'main';
      if (el.__order.indexOf(k) < 0) el.__order.push(k);
      el.__slots[k] = { msg: String(msg == null ? '' : msg), bad: !!bad };
      var out = [], anyBad = false;
      el.__order.forEach(function (n) {
        var s = el.__slots[n];
        if (s && s.msg) { out.push(s.msg); if (s.bad) anyBad = true; }
      });
      el.textContent = out.join('  ·  ');
      if (anyBad) el.setAttribute('data-bad', '1'); else el.removeAttribute('data-bad');
    };
  }

  function fail(where, err, node) {
    var msg = where + ' could not load: ' + (err && err.message ? err.message : err);
    if (node) {
      var p = document.createElement('p');
      p.className = 'note';
      p.setAttribute('role', 'status');
      p.textContent = msg + ' — this page reads its numbers from JSON in /data, so nothing is shown rather than something invented.';
      node.appendChild(p);
    }
    if (window.console) console.error(msg, err);
  }

  window.Ink = {
    REDUCED: REDUCED,
    EASE: EASE,
    DUR: DUR,
    initTheme: initTheme,
    initInk: initInk,
    enter: enter,
    /* for the two places that navigate without a click (the go-to palette
       and the river): Ink.leave(href) plays the out move and returns true,
       or returns false and the caller navigates itself */
    leave: leave,
    loadJSON: loadJSON,
    reporter: reporter,
    fail: fail,
    esc: function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  };

  /* ---- the world's host, before the first frame -------------
     The engine builds the night when scene.js runs, and the document that
     ARRIVES from a page change paints its type long before that: QA-4 D3
     timed .ink-world as absent for 1.4–1.8 s and opaque at 2.3 s, so a page
     arrived on flat ink with the landscape coming up under it a second
     later. The host and the CSS horizon in it cost one div and one gradient,
     so they are mounted in this pass — the one that already writes the
     ground colour and the pre-paint states — and scene.js adopts them. The
     sky canvas keeps its id and only changes parent. */
  function mountHost() {
    if (document.querySelector('.ink-world')) return;
    var sky = document.getElementById('page-wash');
    if (!sky || !sky.parentNode) return;
    var host = document.createElement('div');
    host.className = 'ink-world';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;contain:paint;';
    var line = document.createElement('div');
    line.className = 'ink-world__line';        // pure CSS: survives with no canvas at all
    host.appendChild(line);
    sky.parentNode.insertBefore(host, sky);
    host.appendChild(sky);                     // the sky becomes the back of the world
  }

  injectCSS();                 // before first paint: the ground colour and the pre states
  ARRIVED = camArrive();       // and, if this document was sent here, the pose
  initCam();                   // one delegated listener; a click needs no DOM yet
  /* deferred (every page): the body is parsed, so the sky is already here */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHost);
  else mountHost();

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initInk();
    try { initEnter(); } catch (e) {
      [].forEach.call(document.querySelectorAll('[data-enter-state="pre"]'), function (el) {
        el.setAttribute('data-enter-state', 'done');
      });
      if (window.console) console.error('the entrance choreography did not start', e);
    }
  });
})();
