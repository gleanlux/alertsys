// Render a single alert row in the list view.

export function renderAlertRow({ alert, t, esc }) {
  const levelMeta = {
    error: { icon: "mdi:alert-circle-outline", color: "#db4437" },
    warning: { icon: "mdi:alert-outline", color: "#ffa600" },
    info: { icon: "mdi:information-outline", color: "#039be5" },
  };
  const lm = levelMeta[alert.level] || levelMeta.info;
  const aqText =
    alert.auto_quit === null
      ? t("status_aq_default")
      : alert.auto_quit
        ? t("status_aq_yes")
        : t("status_aq_no");

  return `
    <div class="alert-row" data-id="${alert.id}">
      <ha-icon icon="${lm.icon}" style="color:${lm.color}; --mdc-icon-size:22px; flex-shrink:0;"></ha-icon>
      <span class="alert-name">${esc(alert.name)}</span>
      <span class="alert-condition"><code>${esc(alert.condition)}</code></span>
      <span class="alert-autoquit">${esc(t("status_aq_prefix"))}${aqText}</span>
      <div class="alert-menu-wrap">
        <button class="icon-btn menu-btn" data-menu-id="${alert.id}" title="${esc(t("status_actions"))}">
          <ha-icon icon="mdi:dots-vertical" style="--mdc-icon-size:20px;"></ha-icon>
        </button>
        <div class="alert-menu" id="menu-${alert.id}">
          <button class="menu-item" data-action="edit" data-id="${alert.id}">
            <ha-icon icon="mdi:pencil" style="--mdc-icon-size:18px;"></ha-icon> ${esc(t("btn_edit"))}
          </button>
          <button class="menu-item danger" data-action="delete" data-id="${alert.id}">
            <ha-icon icon="mdi:delete" style="--mdc-icon-size:18px;"></ha-icon> ${esc(t("btn_delete"))}
          </button>
        </div>
      </div>
    </div>`;
}
