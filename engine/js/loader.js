/* loader.js — loads a test by id from content/tests/<id>.json.
   The special id "draft" loads the test saved in this browser by the test builder (generator/index.html);
   ids starting with "gen-" load tests built in this browser from the question bank (engine/index.html). */
window.FluovaContent = {
  testId: function () { var p = new URLSearchParams(location.search);
    return (p.get('test') || p.get('form') || 'pilot-01').replace(/[^a-z0-9-]/gi, ''); },
  load: function (id) {
    if (id === 'draft') {
      var raw = null; try { raw = localStorage.getItem('fluova_draft'); } catch (e) {}
      if (!raw) return Promise.reject(new Error('no draft saved — use the test builder first'));
      return Promise.resolve(JSON.parse(raw)).then(function (t) { t.id = 'draft'; return t; });
    }
    if (/^gen-/.test(id)) {
      var g = null; try { g = localStorage.getItem('fluova_gen_' + id); } catch (e) {}
      if (!g) return Promise.reject(new Error('this generated test is not stored in this browser'));
      return Promise.resolve(JSON.parse(g));
    }
    return fetch('../content/tests/' + id + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  },
};
