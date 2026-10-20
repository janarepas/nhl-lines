/* Patch changed markup without recreating unchanged portraits or focused cards. */
(function (root) {
  const snapshots = new WeakMap();
  function patch(parent, actual, before, after) {
    if (before?.isEqualNode(after)) return;
    if (
      !actual ||
      !before ||
      actual.nodeType !== after.nodeType ||
      actual.nodeName !== after.nodeName
    ) {
      const next = after.cloneNode(true);
      if (actual) parent.replaceChild(next, actual);
      else parent.appendChild(next);
      return;
    }
    if (after.nodeType !== Node.ELEMENT_NODE) {
      if (actual.nodeValue !== after.nodeValue)
        actual.nodeValue = after.nodeValue;
      return;
    }
    // Compare generated attributes, preserving runtime motion/focus state.
    for (const attribute of before.attributes) {
      if (!after.hasAttribute(attribute.name))
        actual.removeAttribute(attribute.name);
    }
    for (const attribute of after.attributes) {
      if (before.getAttribute(attribute.name) !== attribute.value)
        actual.setAttribute(attribute.name, attribute.value);
    }
    const previous = [...before.childNodes],
      next = [...after.childNodes];
    for (let i = 0; i < next.length; i++)
      patch(actual, actual.childNodes[i], previous[i], next[i]);
    while (actual.childNodes.length > next.length) actual.lastChild.remove();
  }
  function update(target, html) {
    if (typeof target === "string") target = document.querySelector(target);
    const previous = snapshots.get(target);
    if (previous?.html === html) return false;
    const template = document.createElement("template");
    template.innerHTML = html;
    if (!previous) target.replaceChildren(template.content.cloneNode(true));
    else {
      const before = [...previous.content.childNodes],
        after = [...template.content.childNodes];
      for (let i = 0; i < after.length; i++)
        patch(target, target.childNodes[i], before[i], after[i]);
      while (target.childNodes.length > after.length) target.lastChild.remove();
    }
    snapshots.set(target, { html, content: template.content });
    return true;
  }
  function text(target, value) {
    if (typeof target === "string") target = document.querySelector(target);
    const next = String(value ?? "");
    if (target.textContent !== next) target.textContent = next;
  }
  root.LineDOM = { update, text };
})(globalThis);
