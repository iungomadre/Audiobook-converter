type Child = Node | string | number | null | undefined | false;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>> & {
  class?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
};

/** Tiny element factory: `h('button', { class: 'btn', onclick }, 'Save')`. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  const { class: className, dataset, attrs, ...rest } = props;
  if (className) element.className = className;
  Object.assign(element, rest);
  for (const [key, value] of Object.entries(dataset ?? {})) element.dataset[key] = value;
  for (const [key, value] of Object.entries(attrs ?? {})) element.setAttribute(key, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'number' ? String(child) : child);
  }
  return element;
};
