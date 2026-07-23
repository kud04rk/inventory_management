export type ItemType = "raw" | "finished"

export const UNITS = ["kg", "pcs", "bag", "drum", "liter"] as const
export type Unit = (typeof UNITS)[number]

export interface Item {
  id: string
  name: string
  type: ItemType
  sku: string | null
  category: string | null
  quantity: number
  unit: string | null
  price: number
  location: string | null
  reorder_level: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type ItemInput = Omit<Item, "id" | "created_at" | "updated_at">

export type MovementType = "in" | "out"

export interface Movement {
  id: string
  item_id: string
  type: MovementType
  quantity: number
  reason: string | null
  note: string | null
  created_at: string
  item_name?: string
  unit_price?: number | null
  remaining?: number | null
  consumed?: string | null
}

export interface Stats {
  totalItems: number
  totalUnits: number
  totalValue: number
  lowStockCount: number
  categories: number
}

export interface Settings {
  currency: string
  storeName: string
}

export type ViewName = "dashboard" | "inventory" | "movements" | "settings"

export interface ViewCtx {
  settings: Settings
  stockType: ItemType
  refresh(): void
  go(view: ViewName): void
  openItemForm(item?: Item): void
  openStockModal(item: Item): void
  openTransactionForm(): void
}
