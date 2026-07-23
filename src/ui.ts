export type TagProps = Record<string, unknown> & {
  class?: string
  text?: string
}

export function h<T extends HTMLElement = HTMLElement>(
  tag: string,
  props: TagProps = {},
  children: (Node | string)[] = [],
): T {
  const node = document.createElement(tag) as T
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue
    if (key === "class") {
      node.className = String(value)
    } else if (key === "text") {
      node.textContent = String(value)
    } else if (key === "dataset" && typeof value === "object") {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
        node.dataset[dk] = String(dv)
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === "html") {
      node.innerHTML = String(value)
    } else {
      node.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child)
  }
  return node
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

let toastTimer: number | undefined
export function toast(message: string, type: "info" | "error" | "success" = "info"): void {
  let host = document.getElementById("toast-host")
  if (!host) {
    host = h("div", { id: "toast-host" }) as HTMLElement
    document.body.appendChild(host)
  }
  clear(host)
  const t = h("div", { class: `toast toast-${type}` }, [message])
  host.appendChild(t)
  host.classList.add("show")
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    host.classList.remove("show")
  }, 2600)
}
