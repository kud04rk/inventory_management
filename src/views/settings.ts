import { db, isPreview } from "../db"
import type { ViewCtx } from "../types"
import { h, toast } from "../ui"
import { confirmDialog } from "../modal"
import { formatDateTime } from "../format"

export async function renderSettings(ctx: ViewCtx): Promise<HTMLElement> {
  const settings = ctx.settings

  const storeName = document.createElement("input")
  storeName.className = "input"
  storeName.value = settings.storeName

  const currency = document.createElement("input")
  currency.className = "input"
  currency.value = settings.currency
  currency.maxLength = 5
  currency.style.maxWidth = "8rem"

  const saveBtn = h<HTMLButtonElement>("button", { class: "btn btn-primary", type: "button" }, ["Save settings"])
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true
    saveBtn.textContent = "Saving..."
    try {
      await db.setSetting("store_name", storeName.value.trim() || "My Store")
      await db.setSetting("currency", currency.value.trim() || "$")
      toast("Settings saved", "success")
      ctx.refresh()
    } catch (err) {
      toast("Could not save: " + (err as Error).message, "error")
      saveBtn.disabled = false
      saveBtn.textContent = "Save settings"
    }
  })

  // Export
  const exportBtn = h("button", { class: "btn btn-secondary", type: "button", text: "Export backup (.json)" })
  exportBtn.addEventListener("click", async () => {
    try {
      const json = await db.exportAll()
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `inventory-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast("Backup exported", "success")
    } catch (err) {
      toast("Export failed: " + (err as Error).message, "error")
    }
  })

  // Import
  const fileInput = document.createElement("input")
  fileInput.type = "file"
  fileInput.accept = "application/json,.json"
  fileInput.style.display = "none"
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const ok = await confirmDialog(
      "Importing will REPLACE all current data with the backup. Continue?",
      { title: "Restore backup", confirmText: "Replace data", danger: true },
    )
    if (!ok) {
      fileInput.value = ""
      return
    }
    try {
      const text = await file.text()
      await db.importAll(text)
      toast("Backup imported", "success")
      ctx.refresh()
    } catch (err) {
      toast("Import failed: " + (err as Error).message, "error")
    }
    fileInput.value = ""
  })
  const importBtn = h("button", { class: "btn btn-secondary", type: "button", text: "Restore from backup" })
  importBtn.addEventListener("click", () => fileInput.click())

  // Reset
  const resetBtn = h("button", { class: "btn btn-danger", type: "button", text: "Delete all data" })
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmDialog(
      "This permanently deletes ALL items and stock history. Settings are kept. This cannot be undone. Continue?",
      { title: "Delete all data", confirmText: "Delete everything", danger: true },
    )
    if (!ok) return
    try {
      const items = await db.getItems("", "", null)
      for (const it of items) await db.deleteItem(it.id)
      toast("All data deleted", "success")
      ctx.refresh()
    } catch (err) {
      toast("Could not reset: " + (err as Error).message, "error")
    }
  })

  const root = h("div", { class: "view settings-view" }, [
    h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [h("h2", { class: "section-title", text: "Store details" })]),
      h("div", { class: "settings-row" }, [
        h("label", { class: "field-label", text: "Store name" }),
        storeName,
      ]),
      h("div", { class: "settings-row" }, [
        h("label", { class: "field-label", text: "Currency symbol" }),
        currency,
      ]),
      h("div", {}, [saveBtn]),
    ]),

    h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [h("h2", { class: "section-title", text: "Backup & restore" })]),
      h("p", { class: "muted", text: "Keep a copy of your data safe. Backups are stored on your computer only." }),
      h("div", { class: "btn-row" }, [exportBtn, importBtn]),
      fileInput,
    ]),

    h("section", { class: "panel danger-panel" }, [
      h("div", { class: "section-head" }, [h("h2", { class: "section-title", text: "Danger zone" })]),
      h("p", { class: "muted", text: "Removes every item and all stock history. Consider exporting a backup first." }),
      resetBtn,
    ]),

    h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [h("h2", { class: "section-title", text: "About" })]),
      h("p", { class: "muted", text: isPreview()
        ? "Preview mode (running in a browser). Your data here is temporary and stored only in this browser."
        : "All your data is stored privately on this computer. The app works fully offline." }),
      h("p", { class: "muted", text: "Last opened: " + formatDateTime(new Date().toISOString()) }),
    ]),
  ])

  return root
}
