// Runs before first paint so the page never flashes the wrong theme or text size.
// Keep in sync with src/web/hooks/useSettings.ts.
(function () {
  try {
    var pref = localStorage.getItem('plainly.theme') || 'auto';
    var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var scale = Number(localStorage.getItem('plainly.scale'));
    if (scale >= 90 && scale <= 150) document.documentElement.style.setProperty('--root-size', scale + '%');
  } catch {
    /* storage can be blocked; defaults apply */
  }
})();
