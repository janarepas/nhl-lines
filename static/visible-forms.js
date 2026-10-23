/* Fetch form icons only for visible cards; one queue and batched DOM updates. */
(function (root) {
  function create({ signal, isFresh, load, pending, changed, failed }) {
    const queued = new Set(),
      attempted = new Map(),
      observed = new WeakMap();
    const queue = [];
    let active = 0,
      stopped = false,
      paint = null,
      start = null;
    const notify = () => {
      if (paint !== null || stopped) return;
      paint = setTimeout(() => {
        paint = null;
        if (!stopped) changed();
      }, 100);
    };
    const schedule = () => {
      if (start !== null || stopped || document.hidden) return;
      // Let the header and season totals paint before optional form lookups.
      start = setTimeout(() => {
        start = null;
        pump();
      }, 80);
    };
    function request(id, explicit = false) {
      if (stopped || !Number.isSafeInteger(id) || isFresh(id) || queued.has(id))
        return;
      if (
        attempted.has(id) &&
        (!explicit || Date.now() - attempted.get(id) < 5000)
      )
        return;
      queued.add(id);
      queue.push(id);
      pending(id, true);
      schedule();
    }
    function pump() {
      if (stopped || document.hidden) return;
      while (active < 2 && queue.length) {
        const id = queue.shift();
        if (isFresh(id)) {
          queued.delete(id);
          pending(id, false);
          continue;
        }
        active++;
        attempted.set(id, Date.now());
        Promise.resolve()
          .then(() => load(id))
          .catch((error) => {
            if (error.rateLimited) {
              for (const waiting of queue.splice(0)) {
                queued.delete(waiting);
                pending(waiting, false);
              }
              stopped = true;
              observer?.disconnect();
            }
            failed?.(error);
          })
          .finally(() => {
            active--;
            queued.delete(id);
            pending(id, false);
            notify();
            schedule();
          });
      }
    }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                if (entry.isIntersecting) {
                  observer.unobserve(entry.target);
                  request(Number(entry.target.dataset.player));
                }
            },
            { rootMargin: "100px 0px", threshold: 0 },
          )
        : null;
    function observe() {
      if (stopped) return;
      for (const card of document.querySelectorAll(
        ".player-card[data-player]",
      )) {
        const id = Number(card.dataset.player);
        if (
          card.closest("[hidden]") ||
          !Number.isSafeInteger(id) ||
          observed.get(card) === id
        )
          continue;
        observed.set(card, id);
        if (observer) {
          observer.unobserve(card);
          observer.observe(card);
        } else request(id);
      }
    }
    const resume = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", resume);
    const destroy = () => {
      stopped = true;
      observer?.disconnect();
      clearTimeout(start);
      clearTimeout(paint);
      document.removeEventListener("visibilitychange", resume);
      for (const id of queued) pending(id, false);
      queued.clear();
      queue.length = 0;
    };
    signal.addEventListener("abort", destroy, { once: true });
    return { observe, request, destroy };
  }
  root.VisiblePlayerForms = { create };
})(globalThis);
