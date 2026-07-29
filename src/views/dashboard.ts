import { db } from "../db"
import type { DashboardMetrics, Item, Movement, TopSeller, ViewCtx } from "../types"
import { formatCurrency, formatNumber, formatDateTime } from "../format"
import { h } from "../ui"

export async function renderDashboard(ctx: ViewCtx): Promise<HTMLElement> {
  const [stats, lowStock, recent, metrics, topSellers] = await Promise.all([
    db.getStats(ctx.stockType),
    db.getItems("", "", ctx.stockType),
    db.getMovements(6, null),
    db.getDashboardMetrics(ctx.stockType),
    db.getTopSellers(ctx.stockType, 5),
  ])

  const lowItems = lowStock.filter(
    (i) => i.reorder_level > 0 && i.quantity <= i.reorder_level,
  )

  const profit = metrics.revenue - metrics.cogs
  const margin = metrics.revenue > 0 ? (profit / metrics.revenue) * 100 : 0
  const attRate =
    metrics.attendanceTotal > 0
      ? (metrics.present / metrics.attendanceTotal) * 100
      : 0

  const root = h("div", { class: "view dashboard-view" }, [])

  // ---- Financial KPIs ----
  const finCards = h("div", { class: "stat-grid" }, [
    statCard("Revenue", formatCurrency(metrics.revenue, ctx.settings.currency), "green", {
      sub: `${formatNumber(metrics.salesCount)} ${plural(metrics.salesCount, "sale")} \u00b7 ${formatNumber(metrics.unitsSold)} units sold`,
      onClick: () => ctx.go("movements"),
    }),
    statCard(
      "Gross profit",
      formatCurrency(profit, ctx.settings.currency),
      profit >= 0 ? "accent" : "red",
      {
        sub: `${margin.toFixed(1)}% margin \u00b7 sold cost (FIFO) ${formatCurrency(metrics.cogs, ctx.settings.currency)}`,
      },
    ),
    statCard(
      "Purchases",
      formatCurrency(metrics.purchaseCost, ctx.settings.currency),
      "default",
      {
        sub: `${formatNumber(metrics.purchaseCount)} ${plural(metrics.purchaseCount, "order")} \u00b7 ${formatNumber(metrics.unitsPurchased)} units in`,
        onClick: () => ctx.go("movements"),
      },
    ),
    statCard(
      "Inventory value",
      formatCurrency(stats.totalValue, ctx.settings.currency),
      "accent",
      { onClick: () => ctx.go("inventory") },
    ),
  ])
  root.append(h("div", { class: "dash-period-label", text: "This month" }))
  root.append(finCards)

  // ---- Stock KPIs ----
  const stockCards = h("div", { class: "stat-grid" }, [
    statCard("Items", formatNumber(stats.totalItems), "default", {
      onClick: () => ctx.go("inventory"),
    }),
    statCard("Units in stock", formatNumber(stats.totalUnits), "default"),
    statCard("Categories", formatNumber(stats.categories), "default"),
    statCard(
      "Low stock",
      formatNumber(stats.lowStockCount),
      stats.lowStockCount > 0 ? "amber" : "default",
      stats.lowStockCount > 0 ? { onClick: () => ctx.go("inventory") } : {},
    ),
  ])
  root.append(stockCards)

  // ---- Needs restocking + Top sellers (side by side on wide screens) ----
  const dashGrid = h("div", { class: "dash-grid" }, [
    restockPanel(lowItems, ctx),
    topSellersPanel(topSellers, ctx),
  ])
  root.append(dashGrid)

  // ---- Attendance snapshot ----
  root.append(attendancePanel(metrics, attRate, ctx))

  // ---- Recent activity ----
  root.append(recentActivityPanel(recent, ctx))

  return root
}

function plural(n: number, word: string): string {
  return n === 1 ? word : word + "s"
}

function restockPanel(lowItems: Item[], ctx: ViewCtx): HTMLElement {
  const header = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Needs restocking" }),
    lowItems.length
      ? h("span", { class: "badge badge-red", text: String(lowItems.length) })
      : h("span", { class: "muted", text: "All good" }),
  ])

  let body: HTMLElement
  if (lowItems.length === 0) {
    body = h("div", { class: "empty-card", text: "No items are running low. Set a low-stock alert level on items you want to track." })
  } else {
    body = h("div", { class: "card-list" }, lowItems.map((it) =>
      h("div", { class: "list-row" }, [
        h("div", { class: "list-main" }, [
          h("div", { class: "list-title", text: it.name }),
          h("div", { class: "list-sub", text: `Only ${it.quantity}${it.unit ? " " + it.unit : ""} left \u00b7 alert at ${it.reorder_level}` }),
        ]),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => ctx.openStockModal(it) }, ["Restock"]),
      ]),
    ))
  }
  return h("section", { class: "panel" }, [header, body])
}

function topSellersPanel(top: TopSeller[], ctx: ViewCtx): HTMLElement {
  const header = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Top sellers" }),
    top.length
      ? h("button", { class: "link-btn", type: "button", onclick: () => ctx.go("movements") }, ["See all"])
      : h("span", { class: "muted", text: "No sales yet" }),
  ])

  let body: HTMLElement
  if (top.length === 0) {
    body = h("div", { class: "empty-card", text: "Record a sale (Stock out \u2192 Sale) to see your best-performing products here." })
  } else {
    body = h("div", { class: "card-list" }, top.map((s, i) =>
      h("div", { class: "list-row" }, [
        h("div", { class: "ts-rank", text: String(i + 1) }),
        h("div", { class: "list-main" }, [
          h("div", { class: "list-title", text: s.item_name ?? "Unknown item" }),
          h("div", { class: "list-sub", text: `${formatNumber(s.units)} ${plural(s.units, "unit")} sold` }),
        ]),
        h("span", { class: "ts-rev", text: formatCurrency(s.revenue, ctx.settings.currency) }),
      ]),
    ))
  }
  return h("section", { class: "panel" }, [header, body])
}

function attendancePanel(m: DashboardMetrics, rate: number, ctx: ViewCtx): HTMLElement {
  const header = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Attendance \u00b7 this month" }),
    h("button", { class: "link-btn", type: "button", onclick: () => ctx.go("attendance") }, ["Open attendance"]),
  ])

  if (m.attendanceTotal === 0) {
    return h("section", { class: "panel" }, [
      header,
      h("div", { class: "empty-card", text: "No attendance recorded yet." }),
    ])
  }

  const tiles = h("div", { class: "att-stats" }, [
    attTile("Present today", String(m.todayPresent), "green"),
    attTile("Attendance rate", `${rate.toFixed(0)}%`, "accent"),
    attTile("Employees", String(m.employeeCount), "default"),
    attTile("Records", String(m.attendanceTotal), "default"),
  ])

  const total = m.attendanceTotal
  const pPct = (m.present / total) * 100
  const lPct = (m.leave / total) * 100
  const aPct = (m.absent / total) * 100
  const bar = h("div", { class: "att-bar" }, [
    h("div", { class: "att-bar-seg att-bar-present", style: `width:${pPct}%` }),
    h("div", { class: "att-bar-seg att-bar-leave", style: `width:${lPct}%` }),
    h("div", { class: "att-bar-seg att-bar-absent", style: `width:${aPct}%` }),
  ])

  const legend = h("div", { class: "att-legend" }, [
    attLegend("Present", m.present, "green"),
    attLegend("On leave", m.leave, "red"),
    attLegend("Absent", m.absent, "muted"),
  ])

  return h("section", { class: "panel" }, [header, tiles, h("div", { class: "att-breakdown" }, [bar, legend])])
}

function recentActivityPanel(recent: Movement[], ctx: ViewCtx): HTMLElement {
  const header = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: "Recent activity" }),
    h("button", { class: "link-btn", type: "button", onclick: () => ctx.go("movements") }, ["See all"]),
  ])

  let body: HTMLElement
  if (recent.length === 0) {
    body = h("div", { class: "empty-card", text: "No stock movements yet. Use the Stock button on an item to record stock in or out." })
  } else {
    body = h("div", { class: "card-list" }, recent.map((m) => {
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
  return h("section", { class: "panel" }, [header, body])
}

function attTile(label: string, value: string, tone: AttTone): HTMLElement {
  return h("div", { class: `att-tile tone-${tone}` }, [
    h("div", { class: "att-tile-value", text: value }),
    h("div", { class: "att-tile-label", text: label }),
  ])
}

function attLegend(label: string, count: number, tone: "green" | "red" | "muted"): HTMLElement {
  return h("div", { class: "att-legend-item" }, [
    h("span", { class: `att-legend-dot att-dot-${tone}` }),
    h("span", { text: label }),
    h("span", { class: "att-legend-count", text: String(count) }),
  ])
}

type Tone = "accent" | "default" | "green" | "red" | "amber"
type AttTone = "accent" | "default" | "green"

function statCard(
  label: string,
  value: string,
  tone: Tone,
  opts: { sub?: string; onClick?: () => void } = {},
): HTMLElement {
  const cls = ["stat-card", `tone-${tone}`, opts.onClick ? "stat-card-click" : ""]
    .filter(Boolean)
    .join(" ")
  const kids: (Node | string)[] = [
    h("div", { class: "stat-label", text: label }),
    h("div", { class: "stat-value", text: value }),
  ]
  if (opts.sub) kids.push(h("div", { class: "stat-sub", text: opts.sub }))
  return h(
    opts.onClick ? "button" : "div",
    {
      class: cls,
      type: opts.onClick ? "button" : undefined,
      onclick: opts.onClick,
    },
    kids,
  )
}
