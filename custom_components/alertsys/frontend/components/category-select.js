// Category select helper.

export function renderCategoryOptions({ categories, selectedId, esc }) {
  return (categories || [])
    .map(
      (c) =>
        `<option value="${c.id}" ${
          c.id === (selectedId || "default") ? "selected" : ""
        }>${esc(c.name)}</option>`
    )
    .join("");
}
