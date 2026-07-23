import { h, clear } from "./ui"

let overlay: HTMLElement | null = null

export function openModal(
  title: string,
  content: HTMLElement,
  options: { onClose?: () => void } = {},
): void {
  closeModal()
  const card = h("div", { class: "modal-card" }, [])
  const header = h("div", { class: "modal-header" }, [
    h("h2", { class: "modal-title", text: title }),
    h(
      "button",
      {
        class: "modal-close",
        "aria-label": "Close",
        type: "button",
        onclick: () => {
          options.onClose?.()
          closeModal()
        },
      },
      ["\u00d7"],
    ),
  ])
  card.append(header, content)
  overlay = h("div", { class: "modal-overlay" }, [card])
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      options.onClose?.()
      closeModal()
    }
  })
  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay?.classList.add("show"))
}

export function closeModal(): void {
  if (!overlay) return
  const node = overlay
  node.classList.remove("show")
  overlay = null
  window.setTimeout(() => {
    if (node.parentNode) node.parentNode.removeChild(node)
  }, 160)
}

export function modalBody(children: (Node | string)[]): HTMLElement {
  const body = h("div", { class: "modal-body" }, children)
  clear(body)
  for (const c of children) {
    body.append(typeof c === "string" ? document.createTextNode(c) : c)
  }
  return body
}
