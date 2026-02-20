import { renderAlertRow } from "../components/alert-row.js";

export function renderList(panel) {
  const groups = panel._getGrouped();
  const groupEntries = Object.entries(groups);
  const t = panel._t.bind(panel);
  const esc = panel._esc.bind(panel);

  let listHtml = "";
  for (const [catId, group] of groupEntries) {
    const alertRows = (group.alerts || [])
      .map((alert) => renderAlertRow({ alert, t, esc, autoQuitDefaults: panel._autoQuitDefaults }))
      .join("");

    const isEmpty = (group.alerts || []).length === 0;
    listHtml += `
      <div class="category-group" data-cat="${catId}">
        <div class="category-header" data-cat="${catId}">
          <span class="collapse-icon">▼</span>
          <strong>${esc(group.name)}</strong>
          <span class="badge">${(group.alerts || []).length}</span>
        </div>
        <div class="category-body">
          ${isEmpty ? `<div class="empty-msg">${esc(t("empty_category"))}</div>` : alertRows}
        </div>
      </div>`;
  }

  return `
    <div class="panel">
      <div class="toolbar">
        <h1>${esc(t("title"))}</h1>
        <button id="btn-new" class="primary-btn">${esc(t("btn_new"))}</button>
      </div>
      <div class="list-container">
        ${
          panel._alerts.length === 0 && groupEntries.length <= 1
            ? `<div class="empty-state">${esc(t("empty_no_alerts", { btn_new: t("btn_new") }))}</div>`
            : listHtml
        }
      </div>
    </div>
  `;
}

// Single delegated click handler for list view.
// Returns true if handled.
export async function handleListClick(panel, e) {
  const root = panel.shadowRoot;

  // New
  const newBtn = e.target.closest("#btn-new");
  if (newBtn) {
    panel._openNew();
    return true;
  }

  // Toggle category collapse
  const header = e.target.closest(".category-header");
  if (header && !e.target.closest(".alert-menu-wrap")) {
    const body = header.nextElementSibling;
    const icon = header.querySelector(".collapse-icon");
    if (body && icon) {
      if (body.style.display === "none") {
        body.style.display = "";
        icon.textContent = "▼";
      } else {
        body.style.display = "none";
        icon.textContent = "▶";
      }
    }
    return true;
  }

  // Menu toggle
  const menuBtn = e.target.closest(".menu-btn");
  if (menuBtn) {
    e.stopPropagation();
    const menuId = menuBtn.dataset.menuId;
    const menu = root.querySelector(`#menu-${CSS.escape(menuId)}`);

    // Close other menus
    root.querySelectorAll(".alert-menu.open").forEach((m) => {
      if (m !== menu) m.classList.remove("open");
    });

    if (menu && !menu.classList.contains("open")) {
      const rect = menuBtn.getBoundingClientRect();
      menu.style.top = rect.bottom + "px";
      menu.style.right = (window.innerWidth - rect.right) + "px";
      menu.classList.add("open");
    } else if (menu) {
      menu.classList.remove("open");
    }
    return true;
  }

  // Menu actions
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.dataset.id;
    panel._openEdit(id);
    return true;
  }

  const delBtn = e.target.closest('[data-action="delete"]');
  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    await panel._confirmAndDelete(id);
    return true;
  }

  // Outside click closes menus
  if (!e.target.closest(".alert-menu-wrap")) {
    root.querySelectorAll(".alert-menu.open").forEach((m) => m.classList.remove("open"));
  }

  return false;
}
