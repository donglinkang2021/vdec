
window.addEventListener('error', function (event) {
  if (window.benchmarkArticle) return;
  var status = document.getElementById('article-loading');
  if (!status) return;
  status.hidden = false;
  status.dataset.state = 'error';
  status.textContent = '交互加载失败，静态棋盘仍可浏览。请刷新或下载完整 HTML 后在浏览器中打开。错误：' + (event.message || '脚本未能执行');
  document.querySelectorAll('[data-loading-control]').forEach(function (node) { node.disabled = true; });
});
