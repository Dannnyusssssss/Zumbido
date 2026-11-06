/** Creación de nodos DOM sin innerHTML: todo el texto se asigna con textContent. */

export interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs !== undefined) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

export function button(text: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', { className, text, attrs: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}

export function show(node: HTMLElement, visible: boolean): void {
  node.hidden = !visible;
}
