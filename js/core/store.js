// Tek durum kaynağı. Her değişiklik dispatch(tip, veri) ile gelir; işleyici durumu
// günceller ve hangi "konuların" değiştiğini söyler. Aboneler yalnızca bu konuları alır.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).store = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createStore(state, handlers) {
    const subscribers = new Set();
    const pending = new Set();
    let notifying = false;

    function flush(lastType) {
      if (notifying) return;
      notifying = true;
      try {
        // bir abone yeni dispatch yaparsa onun konuları da aynı döngüde dağıtılır
        let rounds = 0;
        while (pending.size && rounds++ < 20) {
          const topics = new Set(pending);
          pending.clear();
          for (const fn of Array.from(subscribers)) {
            try { fn(topics, lastType); } catch (e) { reportError(e); }
          }
        }
        pending.clear();
      } finally {
        notifying = false;
      }
    }

    function dispatch(type, payload) {
      const fn = Object.prototype.hasOwnProperty.call(handlers, type) ? handlers[type] : null;
      if (!fn) throw new Error('Unknown action: ' + type);
      const res = fn(state, payload || {}) || {};
      if (res.topics) for (const tp of res.topics) pending.add(tp);
      if (pending.size) flush(type);
      return res.result;
    }

    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    return { dispatch, subscribe, getState: () => state };
  }

  function reportError(e) {
    if (typeof console !== 'undefined') console.error(e);
  }

  return { createStore };
});
