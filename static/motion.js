/* Progressive motion: the page remains usable if animation is unavailable. */
(function () {
  const updateGlass = () =>
    document.body.classList.toggle("page-scrolled", scrollY > 12);
  window.addEventListener("scroll", updateGlass, { passive: true });
  updateGlass();
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 1000;
  const arrivals = new Map();
  const selector =
    ".line-row, .goalie-slot, .special-unit, #extras-list > .player-card";
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

  // Ease notched vertical mouse wheels; leave touch/trackpads and nested scroll
  // areas native. Never turn scrolling a picker into a selection change.
  let frame = 0,
    target = 0,
    previous = 0;
  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }
  function step(time) {
    const elapsed = previous ? Math.min(time - previous, 64) : 16;
    previous = time;
    target = Math.max(
      0,
      Math.min(target, document.documentElement.scrollHeight - innerHeight),
    );
    const remaining = target - scrollY;
    const movement = remaining * (1 - Math.exp(-elapsed / 90));
    const next =
      Math.abs(remaining) < 0.75
        ? target
        : scrollY + (Math.abs(movement) < 1 ? Math.sign(remaining) : movement);
    window.scrollTo({ top: next, behavior: "instant" });
    if (Math.abs(target - scrollY) > 0.75 && Math.abs(remaining) > 0.75)
      frame = requestAnimationFrame(step);
    else cancel();
  }
  function nestedScroll(el) {
    for (
      let node = el instanceof Element ? el : null;
      node && node !== document.body;
      node = node.parentElement
    ) {
      if (
        node.matches?.(
          'dialog, input, textarea, select, [contenteditable="true"]',
        )
      )
        return true;
      if (
        node.scrollHeight > node.clientHeight + 1 &&
        /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)
      )
        return true;
    }
    return false;
  }
  window.addEventListener(
    "wheel",
    (event) => {
      if (
        preference.matches ||
        !event.cancelable ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        nestedScroll(event.target)
      ) {
        cancel();
        return;
      }
      if (event.deltaMode === 0 && Math.abs(event.deltaY) < 40) {
        cancel();
        return;
      }
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - innerHeight,
      );
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      const next = Math.max(
        0,
        Math.min(max, (frame ? target : scrollY) + delta),
      );
      if (next === scrollY && !frame) return;
      event.preventDefault();
      target = next;
      if (!frame) frame = requestAnimationFrame(step);
    },
    { passive: false },
  );
  window.addEventListener("pointerdown", cancel, { passive: true });
  window.addEventListener("touchstart", cancel, { passive: true });
  window.addEventListener("keydown", cancel);
  document.addEventListener("click", cancel, true);
  window.addEventListener("resize", cancel);
  preference.addEventListener("change", () => {
    cancel();
    refresh();
  });
  window.LineMotion = { refresh };
})();
