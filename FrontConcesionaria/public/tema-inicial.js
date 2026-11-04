// Aplica el tema antes de pintar, para que no haya flash de tema.
// Vive en un archivo (y no inline en index.html) porque la CSP de producción es
// `script-src 'self'`: un <script> inline queda bloqueado y el tema se aplicaba tarde.
// Misma regla que src/store/themeStore.ts: si el usuario eligió un tema con el toggle
// (store `autenza-theme`), ése; si nunca eligió, el del sistema.
(function () {
  var t = null;
  try {
    var raw = localStorage.getItem('autenza-theme');
    var s = raw && JSON.parse(raw).state;
    // v1 guarda `elegido`; v0 guardaba `theme` (sólo al usar el toggle).
    t = s && (s.elegido || s.theme);
  } catch (e) { /* storage bloqueado o ilegible: se sigue al sistema */ }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
})();
