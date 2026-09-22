/* ============================================================
   page.js — the calm pages' share of the night.

   Every page carries the ambient world — scene.js mounts the sky,
   the horizon and three receding ranges behind all seven of them.
   The pages that load THIS file are the ones without a big
   showpiece over the horizon: portal, about, lab, projects.

   What is left here is the sky's own shader, lit at this page's
   lighter raster, and the reason handed to the page's status line
   if it cannot be lit: the CSS ground and the CSS horizon
   underneath are what guarantee the page stays legible.
   ============================================================ */
(function () {
  'use strict';

  function boot() {
    var cv = document.getElementById('page-wash');
    if (!cv) return;
    /* the host may be a div a page lane put there; the engine paints the
       sky into a canvas inside it, and that canvas is what is lit here */
    if (cv.tagName !== 'CANVAS') cv = cv.querySelector('canvas') || cv;
    var I = window.Ink;
    var report = function () {};
    ['wash-state', 'reg-state', 'lab-state', 'about-state', 'rounds-state', 'roles-state', 'graph-state']
      .some(function (id) {
        if (document.getElementById(id) && I) { report = I.reporter(id); return true; }
        return false;
      });

    var S = window.InkScene;
    var mounted = !!(S && S.world && S.world.host);

    /* the sky */
    var w = null;
    if (window.InkWash) {
      w = window.InkWash.create(cv, {
        mode: 'night',
        maxPixels: 760,
        onState: function (m, b) { report(m, b, 'wash'); }
      });
    } else {
      report('the night sky could not be painted: its script did not load. The horizon behind this page is CSS only.', true, 'wash');
    }

    /* The third, furthest range used to be added here, on these four pages
       only. It belongs to the engine now (scene.js mounts it on every page
       that carries a sky), so index and atlas stand under the same three
       receding planes — one night, not two. If the engine could not mount
       at all, say so here rather than leave a page quietly flatter. */
    if (!mounted) {
      report('the world did not mount behind this page — the sky and the CSS horizon are all it has.', true, 'world');
    }

    /* if the world never mounted, this file keeps the sky in step itself */
    if (!mounted && w) {
      var t = 0;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(w.repaint, 320); });
      document.addEventListener('inkthemechange', function () { setTimeout(w.repaint, 20); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
