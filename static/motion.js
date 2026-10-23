/* Progressive motion: the page remains usable if animation is unavailable. */
(function () {
  if (typeof IntersectionObserver === "function") {
    // Observe the top edge rather than reading scrollY after layout writes.
    const edge = document.createElement("span");
    edge.setAttribute("aria-hidden", "true");
    edge.style.cssText =
      "position:absolute;top:0;left:0;width:1px;height:12px;pointer-events:none";
    document.body.append(edge);
    new IntersectionObserver(([entry]) => {
      document.body.classList.toggle("page-scrolled", !entry.isIntersecting);
    }).observe(edge);
  } else {
    const update = () =>
      document.body.classList.toggle("page-scrolled", scrollY > 12);
    window.addEventListener("scroll", update, { passive: true });
    update();
  }
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 1000;
  const arrivals = new Map();
  const selector =
    ".line-row, .goalie-slot, .special-unit, #extras-list .player-card";
  const reveal = (element, start) => {
    element.classList.remove("row-pending");
    if (performance.now() < start + duration) {
      element.style.setProperty(
        "--row-delay",
        start - performance.now() + "ms",
      );
      element.classList.add("row-entering");
    }
  };
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting || !entry.target.isConnected) continue;
              const el = entry.target;
              const start =
                performance.now() + Number(el.dataset.motionStagger || 0);
              if (arrivals.size >= 256)
                arrivals.delete(arrivals.keys().next().value);
              arrivals.set(el.dataset.motionKey, start);
              reveal(el, start);
              observer.unobserve(el);
            }
          },
          { threshold: 0.06, rootMargin: "0px 0px -12px 0px" },
        )
      : null;
  function refresh() {
    observer?.disconnect();
    document.querySelectorAll(selector).forEach((el, index) => {
      el.classList.remove("row-pending", "row-entering");
      if (preference.matches || !observer || el.closest("[hidden]")) return;
      const parent = el.closest(
        "#forward-lines, #defense-lines, #goalie-lines, #special-lines, #extras-list",
      );
      const ids = [el, ...el.querySelectorAll("[data-player]")]
        .filter((node) => node.dataset.player)
        .map((node) => node.dataset.player)
        .join(",");
      const mode =
        document.querySelector('[data-mode][aria-selected="true"]')?.dataset
          .mode || "even";
      const key = document.title + ":" + mode + ":" + parent?.id + ":" + ids;
      el.dataset.motionKey = key;
      el.dataset.motionStagger = String(Math.min(index % 3, 2) * 70);
      if (arrivals.has(key)) reveal(el, arrivals.get(key));
      else {
        el.classList.add("row-pending");
        observer.observe(el);
      }
    });
  }

  // Native wheel/touch scrolling avoids a blocking listener and per-frame JS.
  preference.addEventListener("change", refresh);
  window.LineMotion = { refresh };
})();
