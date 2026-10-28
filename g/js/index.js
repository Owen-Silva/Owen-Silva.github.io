/* ============================================================
   index.js — front page: open the sunset world, mount the commit
   river below it, build the register of 32 projects, draw the
   census, and check every printed number against the JSON it
   came from.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;

  /* the masthead wraps to two or three rows on a phone, so its height is
     measured rather than guessed: the hero is pulled up by exactly that
     much and the window and the world share one horizon. */
  function navHeight() {
    var n = document.querySelector('.nav');
    var h = n ? Math.round(n.getBoundingClientRect().height) : 56;
    if (h > 0) document.documentElement.style.setProperty('--nav-h', h + 'px');
  }

  function boot() {
    var state = I.reporter('scene-state');
    var river = I.reporter('river-state');

    navHeight();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(navHeight).catch(function () {});
    var nt = 0;
    window.addEventListener('resize', function () { clearTimeout(nt); nt = setTimeout(navHeight, 160); });

    /* the world under the whole page goes up FIRST: the hero is opaque
       over it for a moment, and this one has to be there, matching,
       before the hero's dissolve starts */
    startAscent();

    /* The world owes nothing to the data, so it opens immediately and
       never waits on a fetch. The commit total only decides how many
       stars there are, and it arrives later if it arrives at all. */
    startWorld(state, commitsOnPage());
    var onPage = commitsOnPage();
    river('loading ' + (onPage ? onPage.toLocaleString('en-GB') + ' ' : '') + 'commits…');

    Promise.all([
      I.loadJSON('data/commits.json'),
      I.loadJSON('data/projects.json'),
      I.loadJSON('data/census.json')
    ]).then(function (r) {
      var commits = r[0], projects = r[1], census = r[2];
      river('', false);                       // clear the "loading" slot
      verifyNumbers(commits, projects, census, river);
      buildRegister(projects);
      buildCensus(census);
      startRiver(commits, river);
      /* the register and the census have just changed how long the page is
         and where every word on it stands: the world's quiet plate is baked
         from those rectangles, so it is baked again now (and once more when
         the fonts have finished settling them). */
      relayoutAscent();
      setTimeout(relayoutAscent, 900);
    }).catch(function (e) {
      river('scene data failed to load: ' + e.message, true);
      I.fail('Project data', e, document.getElementById('register'));
    });
  }

  /* The star count is the commit count. It is read from the figure already
     printed on the page, which verifyNumbers() then checks against the JSON
     and corrects out loud if the two ever disagree. */
  function commitsOnPage() {
    var el = document.querySelector('[data-num="commits"]');
    var n = el ? parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) : 0;
    return n > 0 ? n : 0;
  }

  /* ---- THE ASCENT: the world under the whole page -------------
     One fixed canvas behind <main> (js/ascent.js). The scroll is the
     camera's altitude: sea level at the masthead, six hundred kilometres
     over the same bay at the colophon. It reports into its own readout
     under the hero and says `failed: …` out loud if it cannot draw. */
  var ascent = null;
  function startAscent() {
    var host = document.getElementById('ascent');
    var say = I.reporter('world-state');
    if (!host) { say('failed: the ascent has nowhere to mount (no #ascent in the page). The evening below the hero is the CSS gradient only.', true); return; }
    if (!window.Ascent || typeof window.Ascent.mount !== 'function') {
      say('failed: the ascent could not start — js/ascent.js did not load. The evening below the hero is the CSS gradient only.', true);
      return;
    }
    try {
      ascent = window.Ascent.mount(host, { onState: function (m, bad) { say(m, bad); }, onHorizon: ruleFade });
    } catch (e) {
      say('failed: the ascent could not start (' + (e.message || e) + '). The evening below the hero is the CSS gradient only.', true);
      ascent = null;
    }
  }
  function relayoutAscent() { if (ascent && ascent.relayout) { try { ascent.relayout(); } catch (e) {} } }

  /* ---- the count's rule only lives on the water ----
     The hairline over the four figures separates them from the bay while
     it sits on the dark sea. Scrolled up past the horizon it would run
     straight through the sun and the lit sky as a hard seam, so it fades
     out over the last 96 px before the painted horizon and stays out in
     the sky. Without the ascent nothing calls this and it simply stays. */
  var ruleEl = null, ruleOn = -1;
  function ruleFade(hy) {
    if (!ruleEl) ruleEl = document.querySelector('.mark');
    if (!ruleEl) return;
    var gap = ruleEl.getBoundingClientRect().top - hy;     // px the rule sits below the horizon
    var t = Math.max(0, Math.min(1, (gap - 12) / 84));
    var v = Math.round(t * t * (3 - 2 * t) * 100) / 100;
    if (v !== ruleOn) { ruleOn = v; ruleEl.style.setProperty('--rule-on', String(v)); }
  }

  /* ---- the sunset world, and the type that arrives in it ------ */
  function startWorld(state, stars) {
    var host = document.getElementById('world');
    var sub = document.getElementById('hero-sub');
    var cue = document.getElementById('hero-cue');
    var shown = [sub, cue];

    /* The NAME is not here: it is drawn by CSS in the page's first painted
       frame (index.html, @keyframes hero-name-in), so the subject of the page
       cannot end up waiting behind the world's first second of work. The
       camera goes on pulling back around a name that is already there. The
       sentence and the cue follow it a beat later, and if the world fails
       they arrive at once. */
    function reveal(delay) {
      shown.forEach(function (e, i) {
        if (!e) return;
        if (!delay) { e.classList.add('on'); return; }
        setTimeout(function () { e.classList.add('on'); }, [820, 1420][i]);
      });
    }

    var mount = window.InkWorld && (window.InkWorld.mountHero || window.InkWorld.mount);
    if (!host || !mount) {
      state('the sunset could not start: js/world.js did not load. The evening behind this name is the CSS gradient only.', true);
      /* the gradient still has to stand down past the hero, or the fallback
         sunset stays fixed behind every section below the fold */
      standDownPastTheHero(host, null);
      reveal(false);
      return;
    }
    var world;
    try {
      world = mount(host, {
        stars: stars || undefined,
        /* the hero holds STILL while it scrolls away: its own pull-back
           (zoom, lift, the layers parting, the fade) moved the sky, the
           sun and the clouds up to 16 px off the ascent underneath during
           the 150 px dissolve, which is a double sun and doubled clouds.
           The climb is the ascent's to do; the hero just leaves. */
        auto: false,
        onState: function (m, bad) { state(m, bad, 'world'); }
      });
    } catch (e) {
      state('the sunset could not start (' + (e.message || e) + '). The evening behind this name is the CSS gradient only.', true);
      standDownPastTheHero(host, null);
      reveal(false);
      return;
    }
    /* the ascent climbs out of THIS bay: it is handed the hero's own
       ranges, layout and sea, so the dissolve between the two is a
       dissolve between one picture and itself */
    if (ascent && ascent.adoptBay && world && world.bay) {
      ascent.adoptBay(function (over) { return world.bay(over); });
    }
    standDownPastTheHero(host, world);
    holdTheWaterline(host, world);
    retireTheCue(cue);
    reveal(!I.REDUCED);
  }

  /* The cue is a hairline that says the page keeps going. Once the page
     has gone, it has said it: left standing it is a 1px bar beside the
     body text at scrollY 420, which reads as a rendering artefact. */
  function retireTheCue(cue) {
    if (!cue) return;
    var past = false;
    function at(y) {
      var p = y > 48;
      if (p === past) return;
      past = p;
      cue.classList.toggle('is-past', p);
    }
    var S = window.InkScene;
    if (S && S.onScroll && !S.reduced) S.onScroll(function (c) { at(c.y); });
    else window.addEventListener('scroll', function () {
      at(window.scrollY || window.pageYOffset || 0);
    }, { passive: true });
    at(window.scrollY || window.pageYOffset || 0);
  }

  /* ---- where the hero world ends -----------------------------
     The deep-ink hero drew a lake, and a lake has a dead-straight shore:
     one row where the land stops and the water starts, and the hardest
     edge on the page. That row had to be FOUND — nine columns of the
     canvas sampled for their sharpest step — so the mask could be put
     just above it.

     This hero is a sunset over open water, and its hardest straight row
     is the SEA'S OWN HORIZON, the brightest and most important line in
     the picture. The measuring pass would have found that row and faded
     the sky, the sun and the fire away above it. So it is gone. The mask
     is the fixed late fade in index.html (opaque to 86%, out by 100%):
     the near water is already nearly the colour of the ground the page
     below stands on, so there is nothing left to hide. */
  function holdTheWaterline(host) {
    if (!host) return;
    /* the number the QA lanes read, kept honest: this is a constant now,
       not a measurement, and it says so. */
    window.__heroFade = function () { return 100; };
  }

  /* ---- the hand-over, and there is no seam in it --------------
     The hero's canvas is absolute: it scrolls away with its own type, so
     the fire never travels up the standfirst. The ascent below it is
     fixed and, for the first HAND px of scroll, LOCKED to the document —
     the same horizon row, the same ramp, the same sun, the same
     headlands. So across those pixels the hero is dissolving into a copy
     of itself and there is nothing to see: no cut, no ghost, no double
     horizon. Past it the hero is display:none and asleep, and the ascent
     has the page to itself.

     Two listeners and one immediate call, as before: if the engine's
     rAF-coalesced driver ever goes quiet, the hero must still stand down
     — left up it is a SUNSET fixed behind a page of body copy. */
  var HAND = 150;
  function standDownPastTheHero(el, world) {
    if (!el) return;
    var gone = false, sleep = 0, last = -1;
    function sleepWhenSettled() {
      if (!gone || !world) return;
      /* let the opening finish saying its piece before the loop is dropped */
      if (world.settled && !world.settled()) { sleep = setTimeout(sleepWhenSettled, 600); return; }
      world.pause();
    }
    function at(y) {
      var t = y <= 0 ? 0 : y >= HAND ? 1 : (y / HAND);
      var o = 1 - (t * t * (3 - 2 * t));
      if (Math.abs(o - last) > 0.004 || o === 0 || o === 1) {
        last = o;
        el.style.opacity = o;
        /* while the hero is fully opaque there is nothing of the world
           below on screen, so it does not draw a single frame */
        if (ascent && ascent.setCovered) ascent.setCovered(o > 0.995);
      }
      var g = o <= 0.001;
      if (g === gone) return;
      gone = g;
      if (g) el.classList.add('is-gone'); else el.classList.remove('is-gone');
      clearTimeout(sleep);
      if (!world) return;
      if (g) sleep = setTimeout(sleepWhenSettled, 560);
      else world.resume();
    }
    /* the engine's driver is rAF-coalesced and idles to nothing, so it is
       the one to ride — except under reduced motion, where it never listens
       to the scroll at all and this page still has to hand over. */
    var S = window.InkScene;
    if (S && S.onScroll && !S.reduced) S.onScroll(function (c) { at(c.y); });
    /* and the plain listener as well, always. The hero's CSS fallback is a
       SUNSET — the one place fire is allowed — and it is fixed, so if this
       hand-over ever fails to fire the fire stays on screen for the whole
       page. With WebGL off that is exactly what happened: the engine's
       subscriber never delivered and the gradient sat behind every section
       below the fold. Two listeners and one immediate call cost nothing
       (`at` is a no-op unless the answer changed) and the evening below the
       fold can no longer be held open by one of them going quiet. */
    window.addEventListener('scroll', function () {
      at(window.scrollY || window.pageYOffset || 0);
    }, { passive: true });
    at(window.scrollY || window.pageYOffset || 0);
  }

  /* ---- every printed number is set from the data ------------ */
  function verifyNumbers(commits, projects, census, state) {
    var sum = 0, keys = ['atlas', 'portal', 'browser'];
    keys.forEach(function (k) { sum += commits.projects[k].total_commits; });
    var real = {
      projects: projects.projects.length,
      live: projects.tally.live_on_the_public_web,
      tools: projects.tally.tools_used_every_week,
      commits: commits.totals.total_commits,
      lines: census.totals.code_lines,
      files: census.totals.files,
      atlas: commits.projects.atlas.total_commits,
      portal: commits.projects.portal.total_commits,
      browser: commits.projects.browser.total_commits,
      measured: projects.tally.measured_on
    };
    /* days with a commit in any of the three: the union of their days, not the sum */
    var seen = {};
    keys.forEach(function (k) { Object.keys(commits.projects[k].commits_per_day || {}).forEach(function (d) { seen[d] = 1; }); });
    real.days = Object.keys(seen).length;
    if (commits.all_repos) { real.repos = commits.all_repos.repos_counted; real.allCommits = commits.all_repos.grand_total_commits; }
    var problems = [];
    if (sum !== real.commits) problems.push('commit totals disagree (' + sum + ' vs ' + real.commits + ')');
    if (projects.projects.length !== projects.tally.projects_since_march_2026) {
      problems.push('project count disagrees (' + projects.projects.length + ' rows vs tally ' + projects.tally.projects_since_march_2026 + ')');
    }
    [].forEach.call(document.querySelectorAll('[data-num]'), function (el) {
      var k = el.getAttribute('data-num');
      if (!(k in real)) return;
      var v = typeof real[k] === 'number' ? real[k].toLocaleString('en-GB') : real[k];
      if (el.textContent.trim() !== v) problems.push(k + ': page said "' + el.textContent.trim() + '", data says "' + v + '"');
      el.textContent = v;
    });
    if (problems.length) state('number check: ' + problems.join('; '), true);
  }

  /* ---- the register: all 32, grouped, with a real timeline ---
     Two systems carry it, not four (QA-4 D13). Every project is ONE LINE
     OF TYPE — the name, with its state and its dates riding the same line
     — over ONE RULE, the hairline that already parted the rows, inked
     across the months that project ran. The state square, the boxed
     duration bar in its own column and its today-tick are gone; no name,
     no state and no date went with them. The rules all share the one
     scale the axis prints once, above the first row. */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function di(s) { var p = s.split('-').map(Number); return (Date.UTC(2026, p[0] - 1, p[1]) - Date.UTC(2026, 2, 1)) / 864e5; }
  var TOTALD = (Date.UTC(2026, 10, 1) - Date.UTC(2026, 2, 1)) / 864e5;   // 1 Mar to 1 Nov: the October spans fit
  function atPct(md) { return (di(md) / TOTALD * 100).toFixed(2); }

  /* the one scale, printed once: the same Mar 1 -> Nov 1 span every rule
     below is measured against. Months only — it labels the drawing, it
     does not add a fact. */
  function buildAxis() {
    var ax = document.getElementById('reg-axis');
    if (!ax) return;
    ax.innerHTML = '';
    ['03-01', '05-01', '07-01', '09-01'].forEach(function (md) {
      var t = document.createElement('span');
      t.style.left = atPct(md) + '%';
      t.textContent = MON[+md.slice(0, 2) - 1];
      ax.appendChild(t);
    });
    /* the scale and its sentence are hidden in the markup: they only
       appear once there are rules under them to describe. */
    ax.hidden = false;
    var cap = document.getElementById('reg-scale');
    if (cap) cap.hidden = false;
  }

  function buildRegister(data) {
    var host = document.getElementById('register');
    if (!host) return;
    host.innerHTML = '';
    buildAxis();
    var byGroup = {};
    data.projects.forEach(function (p) { (byGroup[p.group] = byGroup[p.group] || []).push(p); });

    data.groups.forEach(function (g) {
      var list = byGroup[g.name] || [];
      var sec = document.createElement('div');
      sec.className = 'group';
      sec.setAttribute('data-group', g.name);

      var head = document.createElement('div');
      head.className = 'group__head';
      var h3 = document.createElement('h3'); h3.textContent = g.name;
      var cnt = document.createElement('span'); cnt.textContent = list.length + (list.length === 1 ? ' project' : ' projects');
      head.appendChild(h3); head.appendChild(cnt);
      sec.appendChild(head);

      list.forEach(function (p) { sec.appendChild(entry(p)); });
      host.appendChild(sec);
    });

    initFilters(host);
  }

  var PAGE = { atlas: 'atlas.html', tvha: 'portal.html', browser: 'browser.html' };
  function href(p) { return PAGE[p.id] || ('projects.html#p-' + p.id); }

  function entry(p) {
    var a = document.createElement('article');
    a.className = 'entry entry--slim';
    a.id = 'p-' + p.id;
    a.setAttribute('data-state', p.state);

    var id = document.createElement('div'); id.className = 'entry__id';
    var nm = document.createElement('h4'); nm.className = 'entry__name'; nm.textContent = p.name;
    /* the state and the dates are one mono string on the name's line, not
       a square in one column and a date in another. The state is a word,
       and it is also the weight and the tone the name is set in. */
    var meta = document.createElement('p'); meta.className = 'entry__meta';
    var st = document.createElement('b'); st.className = 'entry__state'; st.textContent = p.label;
    st.setAttribute('title', p.state_meaning);
    var sep = document.createElement('i'); sep.setAttribute('aria-hidden', 'true'); sep.textContent = '·';
    var wh = document.createElement('span'); wh.className = 'entry__when'; wh.textContent = p.when;
    meta.appendChild(st); meta.appendChild(sep); meta.appendChild(wh);
    id.appendChild(nm); id.appendChild(meta);

    /* the rule under the row IS the timeline: one hairline the width of
       the whole row, inked where the project ran. */
    var rule = document.createElement('div');
    rule.className = 'entry__rule';
    rule.setAttribute('aria-hidden', 'true');
    p.spans.forEach(function (s) {
      var i = document.createElement('i');
      var x0 = di(s[0]) / TOTALD * 100, x1 = di(s[1]) / TOTALD * 100;
      i.style.left = x0.toFixed(2) + '%';
      i.style.width = Math.max(0.35, x1 - x0).toFixed(2) + '%';
      rule.appendChild(i);
    });

    var body = document.createElement('div');
    var what = document.createElement('p');
    what.className = 'entry__what';
    what.textContent = p.note || p.what;
    body.appendChild(what);

    var go = document.createElement('a');
    go.className = 'entry__go';
    go.href = href(p);
    go.textContent = PAGE[p.id] ? 'Its page' : 'The write-up';
    go.setAttribute('aria-label', (PAGE[p.id] ? 'The page for ' : 'The write-up for ') + p.name);

    /* a public repository gets a second word under the first: where to
       download it, the README's own Download or Install section on GitHub
       (projects.json carries it as repo.download; only public repos have
       a repo object, so nothing private can get a link here). */
    var last = go;
    if (p.repo && p.repo.download) {
      last = document.createElement('div');
      last.className = 'entry__gos';
      var dl = document.createElement('a');
      dl.className = 'entry__go entry__dl';
      dl.href = p.repo.download;
      dl.rel = 'noopener';
      dl.textContent = 'Download';
      dl.setAttribute('aria-label', 'Download ' + p.name + ' from GitHub');
      last.appendChild(go); last.appendChild(dl);
    }

    a.appendChild(id); a.appendChild(body); a.appendChild(last); a.appendChild(rule);
    return a;
  }

  function initFilters(host) {
    var bar = document.getElementById('reg-tools');
    if (!bar) return;
    var live = document.getElementById('reg-count');
    var chips = bar.querySelectorAll('.chip');
    function apply(f) {
      var shown = 0;
      [].forEach.call(host.querySelectorAll('.group'), function (g) {
        var any = 0;
        [].forEach.call(g.querySelectorAll('.entry'), function (e) {
          var ok = f === 'all' || e.getAttribute('data-state') === f;
          e.hidden = !ok;
          if (ok) { any++; shown++; }
        });
        g.hidden = !any;
      });
      if (live) live.textContent = shown + ' of ' + host.querySelectorAll('.entry').length + ' projects shown';
    }
    [].forEach.call(chips, function (c) {
      c.addEventListener('click', function () {
        [].forEach.call(chips, function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        apply(c.getAttribute('data-filter'));
      });
    });
    apply('all');
  }

  /* ---- the census bar --------------------------------------- */
  function buildCensus(census) {
    var bar = document.getElementById('census-bar');
    var key = document.getElementById('census-key');
    if (!bar || !key) return;
    var rows = census.by_project.slice();
    rows.push({ name: 'Everything else', lines: census.residuals.by_project_unattributed, display: (census.residuals.by_project_unattributed / 1000).toFixed(1) + 'k' });
    var total = census.totals.code_lines;
    bar.innerHTML = ''; key.innerHTML = '';
    /* One measure, parted by hairlines: each project's share of the same
       1,075,938 lines, in one tone stepping down by rank. It was a solid
       cream block, a solid vermilion block and seven greys — a stock
       chart, and the loudest use of the accent outside the horizon. No
       number changed; the names ride their own spans where those are wide
       enough to hold them, and the key below carries all fifteen either way. */
    rows.forEach(function (r, i) {
      var share = r.lines / total * 100;
      var seg = document.createElement('i');
      seg.style.width = share.toFixed(3) + '%';
      seg.style.setProperty('--tone', Math.max(3.5, 20 - i * 3.2).toFixed(1) + '%');
      seg.title = r.name + ' — ' + r.lines.toLocaleString('en-GB') + ' lines';
      /* a span narrower than about 128px cannot hold a name, and a
         clipped word is worse than no word: those stay in the key */
      if (share / 100 * (bar.clientWidth || 900) >= 128) {
        var lab = document.createElement('b');
        var nm = document.createElement('span');
        nm.textContent = r.name;
        lab.appendChild(nm);
        lab.appendChild(document.createTextNode(' ' + (r.display || r.lines)));
        seg.appendChild(lab);
      }
      bar.appendChild(seg);
      var s = document.createElement('span');
      var b = document.createElement('b'); b.textContent = r.name;
      s.appendChild(b); s.appendChild(document.createTextNode(' ' + (r.display || r.lines)));
      key.appendChild(s);
    });
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label',
      'Code census, ' + total.toLocaleString('en-GB') + ' lines: ' +
      rows.map(function (r) { return r.name + ' ' + r.lines.toLocaleString('en-GB'); }).join(', ') + '.');
  }

  /* ---- the river, in its own band under the world ------------ */
  function startRiver(commits, state) {
    var host = document.getElementById('river');
    var riverState = function (m, b) { state(m, b, 'river'); };
    if (!host) return;
    if (!window.CommitRiver) { riverState('commit river: its script did not load. The register below carries the same data.', true); return; }
    var r = window.CommitRiver.mount({
      root: host,
      canvas: document.getElementById('river-cv'),
      nameEl: null,           // the name belongs to the world now, not to the river
      subEl: null,
      tallyEl: null,
      axis: document.getElementById('river-axis'),
      tip: document.getElementById('river-tip'),
      commits: commits,
      onState: riverState
    });
    /* the band is a long way down the page now: it builds the first time
       it is actually approached, so the river runs in front of someone */
    function go() {
      if (!('IntersectionObserver' in window)) { r.build(); return; }
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        r.build();
      }, { rootMargin: '220px 0px' });
      io.observe(host);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go);
    else go();
    window.__river = r;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
