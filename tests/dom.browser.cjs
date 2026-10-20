const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="test"></main>');
    await page.addScriptTag({
      path: require("node:path").resolve("static/dom.js"),
    });
    const result = await page.evaluate(() => {
      const markup = (points) =>
        `<div class="row"><button data-player="1"><img alt="portrait"><b>${points}</b></button><button data-player="2">Other</button></div>`;
      LineDOM.update("#test", markup(1));
      const button = document.querySelector("button"),
        image = document.querySelector("img"),
        row = document.querySelector(".row");
      row.classList.add("row-entering");
      row.style.setProperty("--row-delay", "-100ms");
      button.focus();
      let clicks = 0;
      button.addEventListener("click", () => clicks++);
      const changed = LineDOM.update("#test", markup(2));
      const observer = new MutationObserver(() => {});
      observer.observe(document.querySelector("#test"), {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      const noChange = LineDOM.update("#test", markup(2));
      const noOpMutations = observer.takeRecords().length;
      observer.disconnect();
      button.click();
      const state = {
        changed,
        noChange,
        noOpMutations,
        sameButton: button === document.querySelector("button"),
        sameImage: image === document.querySelector("img"),
        focus: document.activeElement === button,
        points: document.querySelector("b").textContent,
        animation: row.classList.contains("row-entering"),
        delay: row.style.getPropertyValue("--row-delay"),
        clicks,
      };
      LineDOM.update("#test", "<p>Changed team</p>");
      state.replacedStructure =
        document.querySelector("#test").textContent === "Changed team";
      return state;
    });
    assert.deepEqual(result, {
      changed: true,
      noChange: false,
      noOpMutations: 0,
      sameButton: true,
      sameImage: true,
      focus: true,
      points: "2",
      animation: true,
      delay: "-100ms",
      clicks: 1,
      replacedStructure: true,
    });
    console.log(
      "PASS: incremental DOM updates preserve images, focus, event handlers and animation state; unchanged markup performs zero mutations; structure changes still render.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
