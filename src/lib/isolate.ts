/**
 * Make everything on the page except `el` unreachable (inert and hidden from screen readers), for a view
 * that takes over the screen without being a separate dialog: keyboard focus and screen readers stay in it.
 * Returns a function that puts every element back exactly as it was.
 * Pop-ups opened afterwards (they are added to <body> later) are not affected, so they still work.
 */
export function isolate(el: HTMLElement): () => void {
  const changed: Array<{ node: Element; inert: boolean; ariaHidden: string | null }> = [];
  let node: Element = el;
  while (node.parentElement && node !== document.body) {
    for (const sib of Array.from(node.parentElement.children)) {
      if (sib === node || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
      changed.push({ node: sib, inert: sib.hasAttribute('inert'), ariaHidden: sib.getAttribute('aria-hidden') });
      sib.setAttribute('inert', '');
      sib.setAttribute('aria-hidden', 'true');
    }
    node = node.parentElement;
  }
  return () => {
    for (const c of changed) {
      if (!c.inert) c.node.removeAttribute('inert');
      if (c.ariaHidden === null) c.node.removeAttribute('aria-hidden');
      else c.node.setAttribute('aria-hidden', c.ariaHidden);
    }
  };
}
