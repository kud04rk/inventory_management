import { db } from "../db"
import type { ViewCtx } from "../types"
import { formatCurrency, formatNumber, formatDateTime } from "../format"
import { h } from "../ui"

export async function renderDashboard(ctx: ViewCtx): Promise<HTMLElement> {
  const [stats, lowStock, recent] = await Promise.all([
    db.getStats(ctx.stockType),
    db.getItems("", "", ctx.stockType),
    db.getMovements(6, null),
  ])

  const lowItems = lowStock.filter(
    (i) => i.reorder_level > 0 && i.quantity <= i.reorder_level,
  )

  const root = h("div", { class: "view dashboard-view" }, [])

  const cards = h("div", { class: "stat-grid" }, [
    statCard("Items", formatNumber(stats.totalItems), "accent", () => ctx.go("inventory")),
    statCard("Units in stock", formatNumber(stats.totalUnits), "default", undefined),
    statCard("Inventory value", formatCurrency(stats.totalValue, ctx.settings.currency), "green", undefined),
    statCard(
      "Low stock",
      formatNumber(stats.lowStockCount),
      stats.lowStockCount > 0 ? "red" : "default",
      stats.lowStockCount > 0 ? () => ctx.go("inventory") : undefined,
    ),
  ])

  root.append(cards)

  // Low stock section
  const lowHeader = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Needs restocking" }),
    lowItems.length
      ? h("span", { class: "badge badge-red", text: String(lowItems.length) })
      : h("span", { class: "muted", text: "All good" }),
  ])

  let lowList: HTMLElement
  if (lowItems.length === 0) {
    lowList = h("div", { class: "empty-card", text: "No items are running low. Set a low-stock alert level on items you want to track." })
  } else {
    lowList = h("div", { class: "card-list" }, lowItems.map((it) => {
      const row = h("div", { class: "list-row" }, [
        h("div", { class: "list-main" }, [
          h("div", { class: "list-title", text: it.name }),
          h("div", { class: "list-sub", text: `Only ${it.quantity}${it.unit ? " " + it.unit : ""} left \u00b7 alert at ${it.reorder_level}` }),
        ]),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => ctx.openStockModal(it) }, ["Restock"]),
      ])
      return row
    }))
  }
  root.append(h("section", { class: "panel" }, [lowHeader, lowList]))

  // Recent activity
  const recentHeader = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Recent activity" }),
    h("button", { class: "link-btn", type: "button", onclick: () => ctx.go("movements") }, ["See all"]),
  ])

  let recentList: HTMLElement
  if (recent.length === 0) {
    recentList = h("div", { class: "empty-card", text: "No stock movements yet. Use the Stock button on an item to record stock in or out." })
  } else {
    recentList = h("div", { class: "card-list" }, recent.map((m) => {
      const isIn = m.type === "in"
      return h("div", { class: "list-row" }, [
        h("div", { class: `move-icon ${isIn ? "move-in" : "move-out"}`, text: isIn ? "\u2191" : "\u2193" }),
        h("div", { class: "list-main" }, [
          h("div", { class: "list-title", text: m.item_name ?? "Unknown item" }),
          h("div", { class: "list-sub", text: `${isIn ? "Added" : "Removed"} ${m.quantity} \u00b7 ${m.reason ?? "No reason"} \u00b7 ${formatDateTime(m.created_at)}` }),
        ]),
        h("span", { class: `pill ${isIn ? "pill-green" : "pill-red"}`, text: `${isIn ? "+" : "\u2212"}${m.quantity}` }),
      ])
    }))
  }
  root.append(h("section", { class: "panel" }, [recentHeader, recentList]))

  return root
}

type Tone = "accent" | "default" | "green" | "red"

function statCard(
  label: string,
  value: string,
  tone: Tone,
  onClick?: () => void,
): HTMLElement {
  const cls = ["stat-card", `tone-${tone}`, onClick ? "stat-card-click" : ""]
    .filter(Boolean)
    .join(" ")
  const card = h(
    onClick ? "button" : "div",
    {
      class: cls,
      type: onClick ? "button" : undefined,
      onclick: onClick,
    },
    [
      h("div", { class: "stat-label", text: label }),
      h("div", { class: "stat-value", text: value }),
    ],
  )
  return card
}
