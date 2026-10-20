/* Restore the palette before the stylesheet paints; never refresh player data. */
(function () {
  const key = "nextshift-theme";
  const root = document.documentElement;
  const valid = (value) => value === "light" || value === "vintage";
  function apply(value) {
    const theme = valid(value) ? value : "vintage";
    root.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.setAttribute(
        "aria-label",
        theme === "light" ? "Switch to vintage theme" : "Switch to light theme",
      );
      button.title = button.getAttribute("aria-label");
    }
  }
  let stored;
  try {
    stored = localStorage.getItem(key);
  } catch {}
  apply(stored);
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      apply(root.dataset.theme);
      document.getElementById("theme-toggle")?.addEventListener("click", () => {
        const next = root.dataset.theme === "vintage" ? "light" : "vintage";
        apply(next);
        try {
          localStorage.setItem(key, next);
        } catch {}
      });
    },
    { once: true },
  );
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
