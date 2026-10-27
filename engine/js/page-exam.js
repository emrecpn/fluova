/* Page script, kept in a file (not inline) so the page can use a strict Content-Security-Policy. */
(function () {
  const id = FluovaContent.testId();
  function notReady(msg) {
    document.getElementById('stage').innerHTML =
      `<div class="card"><h2>${t('ex.notFound')}</h2><p>${t('ex.notFoundP', { file: '<code>content/tests/' + id + '.json</code>', msg: msg || '' })}</p>` +
      `<p><a class="btn" href="index.html">← ${t('home')}</a></p></div>`;
  }
  FluovaContent.load(id).then(function (form) {
    window.addEventListener('beforeunload', function (e) {
      if (window.State && State.form && !State.results) { e.preventDefault(); e.returnValue = ''; }
    });
    startExam(form);
  }).catch(function (e) { notReady(e.message); });
})();
