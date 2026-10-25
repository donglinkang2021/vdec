
(function () {
  function revealTarget() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    requestAnimationFrame(() => target.scrollIntoView());
  }
  addEventListener('hashchange', revealTarget);
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', revealTarget);
  else revealTarget();
})();
