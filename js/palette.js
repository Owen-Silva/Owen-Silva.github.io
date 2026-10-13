/* ============================================================
   palette.js — one place to go anywhere on the site.

   Ctrl/⌘K, or the button in the nav. It indexes the seven pages
   and, once the project data has loaded, all 34 projects, so a
   name typed here lands on the right page and the right entry.
   ============================================================ */
(function () {
  'use strict';
  var I = window.Ink;

  var PAGES = [
    { t: 'Index', s: 'the commit river, 34 projects', h: 'index.html' },
    { t: 'Atlas', s: 'AI task automation, live since 27 Aug', h: 'atlas.html' },
    { t: 'Quartz', s: 'my own browser, first version in six days', h: 'browser.html' },
    { t: 'Portal', s: 'the academy family and staff portal', h: 'portal.html' },
    { t: 'Projects', s: 'the other thirty-one', h: 'projects.html' },
    { t: 'Lab', s: 'the work actually running', h: 'lab.html' },
    { t: 'About', s: 'how I work and how this was measured', h: 'about.html' }
  ];
  var SCENES = [
    { t: 'The commit river', s: '3,176 commits, one per mark', h: 'index.html#hero' },
    { t: 'Life of a scheduled task', s: 'seven stages, scrubbable', h: 'atlas.html#h-life' },
    { t: 'The Atlas system map', s: '50 parts, 61 links', h: 'atlas.html#h-map' },
    { t: 'The phone pipeline', s: 'five stages, ~1 ms a frame', h: 'browser.html#h-pipe' },
    { t: 'The CPU fixes', s: '27% to 3% of a core', h: 'browser.html#h-cpu' },
    { t: 'The four-role model', s: 'and the planted leak the tests catch', h: 'portal.html#h-roles' },
    { t: 'The technology graph', s: '31 projects by what they are built with', h: 'projects.html#h-graph' },
    { t: 'The gear-card generator', s: 'type a name, get a real 3×5 PDF', h: 'lab.html#exhibit-cards' },
    { t: 'The slide fingerprint', s: '24×24 grayscale change detection', h: 'lab.html#exhibit-slides' },
    { t: 'Star Wars: Strategic Battle', s: 'playable, mouse only', h: 'lab.html#exhibit-game' },
    { t: 'The Atlas design studies', s: 'seven directions, D shipped', h: 'lab.html#exhibit-studies' },
    { t: 'How this site was made', s: 'five rounds, six directions, three kept', h: 'about.html#h-rounds' }
  ];

  var PAGE_OF = { atlas: 'atlas.html', tvha: 'portal.html', browser: 'browser.html' };
  var items = PAGES.map(function (p) { return { t: p.t, s: p.s, h: p.h, k: 'Page' }; })
    .concat(SCENES.map(function (p) { return { t: p.t, s: p.s, h: p.h, k: 'Scene' }; }));

  var root, input, list, open = false, sel = 0, shown = [];

  function build() {
    root = document.createElement('div');
    root.className = 'pal';
    root.hidden = true;
    root.innerHTML =
      '<div class="pal__box" role="dialog" aria-modal="true" aria-label="Go to">' +
        '<input class="pal__in" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" ' +
               'aria-autocomplete="list" placeholder="Go to a page, a scene, a project…" autocomplete="off">' +
        '<ul class="pal__list" id="pal-list" role="listbox"></ul>' +
        '<p class="pal__foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> go · <kbd>Esc</kbd> close</p>' +
      '</div>';
    document.body.appendChild(root);
    input = root.querySelector('.pal__in');
    list = root.querySelector('.pal__list');

    root.addEventListener('pointerdown', function (e) { if (e.target === root) hide(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', key);
    list.addEventListener('pointerdown', function (e) {
      var li = e.target.closest && e.target.closest('li');
      if (li) go(+li.getAttribute('data-i'));
    });
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    shown = items.filter(function (it) {
      return !q || (it.t + ' ' + it.s + ' ' + it.k).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    sel = 0;
    list.innerHTML = '';
    shown.forEach(function (it, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-i', i);
      li.setAttribute('aria-selected', String(i === 0));
      li.innerHTML = '<b></b><span></span><i></i>';
      li.querySelector('b').textContent = it.t;
      li.querySelector('span').textContent = it.s;
      li.querySelector('i').textContent = it.k;
      list.appendChild(li);
    });
    if (!shown.length) {
      var li2 = document.createElement('li');
      li2.className = 'pal__none';
      li2.textContent = 'Nothing matches “' + input.value.trim() + '”.';
      list.appendChild(li2);
    }
    mark();
  }

  function mark() {
    [].forEach.call(list.children, function (li, i) {
      li.setAttribute('aria-selected', String(i === sel));
      if (i === sel && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    });
  }

  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); return; }
    if (e.key === 'Enter') { e.preventDefault(); go(sel); }
  }

  function go(i) {
    var it = shown[i];
    if (!it) return;
    hide();
    if (!(window.Ink && Ink.leave && Ink.leave(it.h))) location.href = it.h; /* leave through the page move when the engine offers it */
  }

  var lastFocus = null;
  function show() {
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    open = true;
    document.documentElement.classList.add('pal-open');
    input.value = '';
    render();
    input.focus();
  }
  function hide() {
    if (!root || !open) return;
    root.hidden = true; open = false;
    document.documentElement.classList.remove('pal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function boot() {
    var btn = document.getElementById('pal-btn');
    if (btn) btn.addEventListener('click', show);
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open ? hide() : show(); }
    });
    // the 34 projects, once their data is here
    if (I && I.loadJSON) {
      I.loadJSON('data/projects.json').then(function (d) {
        d.projects.forEach(function (p) {
          items.push({
            t: p.name, s: p.label + ' · ' + p.when, k: 'Project',
            h: PAGE_OF[p.id] || ('projects.html#p-' + p.id)
          });
        });
        if (open) render();
      }).catch(function () { /* the palette still works without them */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
