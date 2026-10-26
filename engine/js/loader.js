/* loader.js — loads a test by id from content/tests/<id>.json.
   The special id "draft" loads the test saved in this browser by the test builder (generator/index.html);
   ids starting with "gen-" load tests built in this browser from the question bank (engine/index.html). */
/* Test content is rendered as HTML (passages use <strong> and <br>). Every string is cleaned on load so that only
   these formatting tags survive, without attributes: a malicious or broken test file cannot run script on the site.
   tools/validate.js rejects the same things in CI, so this is a second line of defence. */
var FLUOVA_ALLOWED_TAGS = { STRONG: 1, EM: 1, B: 1, I: 1, U: 1, BR: 1, SUB: 1, SUP: 1 };
function fluovaCleanHTML(str) {
  if (str.indexOf('<') < 0 && str.indexOf('&') < 0) return str;
  var tpl = document.createElement('template'); tpl.innerHTML = str;
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 1) {
        if (!FLUOVA_ALLOWED_TAGS[n.nodeName]) { n.replaceWith(document.createTextNode(n.textContent)); return; }
        Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        walk(n);
      } else if (n.nodeType !== 3) n.remove();
    });
  })(tpl.content);
  return tpl.innerHTML;
}
function fluovaCleanTest(v) {
  if (typeof v === 'string') return fluovaCleanHTML(v);
  if (Array.isArray(v)) return v.map(fluovaCleanTest);
  if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = fluovaCleanTest(v[k]); }); return o; }
  return v;
}

window.FluovaContent = {
  testId: function () { var p = new URLSearchParams(location.search);
    return (p.get('test') || p.get('form') || 'pilot-01').replace(/[^a-z0-9-]/gi, ''); },
  load: function (id) {
    if (id === 'draft') {
      var raw = null; try { raw = localStorage.getItem('fluova_draft'); } catch (e) {}
      if (!raw) return Promise.reject(new Error('no draft saved — use the test builder first'));
      return Promise.resolve(fluovaCleanTest(JSON.parse(raw))).then(function (t) { t.id = 'draft'; return t; });
    }
    if (/^gen-/.test(id)) {
      var g = null; try { g = localStorage.getItem('fluova_gen_' + id); } catch (e) {}
      if (!g) return Promise.reject(new Error('this generated test is not stored in this browser'));
      return Promise.resolve(fluovaCleanTest(JSON.parse(g)));
    }
    return fetch('../content/tests/' + id + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(fluovaCleanTest);
  },
};
