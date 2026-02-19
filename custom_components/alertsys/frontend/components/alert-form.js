import { testNotification } from "../api/ws.js";
import { looksLikeTemplate, validateTemplate } from "../api/templates.js";
import { renderCategoryOptions } from "./category-select.js";

// Renders the form body (inside .panel) and wires all form events.
// This intentionally stays "vanilla" (string render + querySelector bindings),
// keeping the project small and HA-friendly.

export function renderAlertForm(panel) {
  const a = panel._editingAlert;
  const isEdit = !!a._isEdit;
  const t = panel._t.bind(panel);
  const esc = panel._esc.bind(panel);

  const title = isEdit ? t("form_title_edit", { name: a.name }) : t("form_title_new");
  const nc = a.notification || {};

  const aqOverride = a.auto_quit !== null && a.auto_quit !== undefined;
  const aqValue = aqOverride ? !!a.auto_quit : true;

  const catOptions = renderCategoryOptions({
    categories: panel._categories,
    selectedId: a.category_id || "default",
    esc,
  });

  return `
    <div class="toolbar">
      <button id="btn-back" class="secondary-btn">${esc(t("btn_back"))}</button>
      <h1>${esc(title)}</h1>
    </div>

    <div class="form-container">
      ${
        isEdit
          ? `<div class="form-field"><label>${esc(t("field_entity_id"))}</label><div class="id-input-wrap"><span class="id-prefix">alertsys.</span><input type="text" id="f-id" value="${esc(a.id)}" /><span class="id-error" id="id-error"></span></div></div>`
          : ""
      }

      <div class="form-field">
        <label>${esc(t("field_name"))}</label>
        <input type="text" id="f-name" value="${esc(a.name || "")}" placeholder="${esc(
    t("ph_name")
  )}" />
      </div>

      <div class="form-field">
        <label>${esc(t("field_level"))}</label>
        <select id="f-level">
          <option value="info" ${a.level === "info" ? "selected" : ""}>${esc(t("level_info"))}</option>
          <option value="warning" ${a.level === "warning" ? "selected" : ""}>${esc(
    t("level_warning")
  )}</option>
          <option value="error" ${a.level === "error" ? "selected" : ""}>${esc(
    t("level_error")
  )}</option>
        </select>
      </div>

      <div class="form-field">
        <label>${esc(t("field_condition"))}</label>
        <textarea id="f-condition" rows="3" placeholder="${esc(
    t("ph_condition")
  )}">${esc(a.condition || "")}</textarea>
        <div class="condition-preview" id="condition-preview">${
          panel._conditionPreview ? esc(t("status_preview")) + esc(panel._conditionPreview) : ""
        }</div>
      </div>

      <div class="form-field">
        <label>${esc(t("field_auto_quit"))}</label>
        <div class="aq-row">
          <label class="checkbox-label">
            <input type="checkbox" id="f-aq-override" ${aqOverride ? "checked" : ""} />
            ${esc(t("hint_override_default"))}
          </label>
          <label class="checkbox-label${!aqOverride ? " dimmed" : ""}" id="aq-value-label">
            <input type="checkbox" id="f-aq-value" ${aqValue ? "checked" : ""} ${
    !aqOverride ? "disabled" : ""
  } />
            ${esc(t("hint_aq_enabled"))}
          </label>
        </div>
        <div class="hint" id="aq-hint"></div>
      </div>

      <div class="form-field">
        <label>${esc(t("field_category"))}</label>
        <div class="cat-row">
          <select id="f-category">
            ${catOptions}
            <option value="__new__">${esc(t("btn_create_category"))}</option>
          </select>
          <input type="text" id="f-newcat" placeholder="${esc(
    t("ph_new_category")
  )}" style="display:none" />
        </div>
      </div>

      <div class="form-field">
        <label class="checkbox-label notif-toggle">
          <input type="checkbox" id="f-notif-enabled" ${nc.enabled ? "checked" : ""} />
          <ha-icon icon="mdi:bell-outline" style="--mdc-icon-size:20px;"></ha-icon>
          ${esc(t("field_notif_enabled"))}
        </label>
      </div>

      <div id="notif-config" class="notif-section" style="display:${nc.enabled ? "block" : "none"}">
        <div class="form-field">
          <label>${esc(t("field_targets"))}</label>
          <div class="target-row">
            <select id="f-notif-target-select">
              <option value="">${esc(t("ph_select_target"))}</option>
              ${(panel._notifyServices || []).map((s) => `<option value="${s}">${s}</option>`).join("")}
            </select>
            <button type="button" id="btn-add-target" class="secondary-btn small">${esc(
    t("btn_add_target")
  )}</button>
          </div>
          <div id="notif-target-chips" class="chip-list">${(nc.targets || [])
            .map(
              (tt) =>
                `<span class="chip" data-target="${esc(tt)}">${esc(tt)} <button class="chip-x" data-rm="${esc(
                  tt
                )}">×</button></span>`
            )
            .join("")}</div>
        </div>

        <div class="form-field">
          <label>${esc(t("field_title"))}</label>
          <input type="text" id="f-notif-title" value="${esc(nc.title || "")}" placeholder="${esc(
    panel._notifDefaults.title
  )}" />
          <div class="hint">${esc(t("ph_title_template"))}</div>
          <div class="tpl-status" id="tpl-status-title"></div>
        </div>

        <div class="form-field">
          <label>${esc(t("field_message"))}</label>
          <textarea id="f-notif-message" rows="2" placeholder="${esc(
    panel._notifDefaults.message
  )}">${esc(nc.message || "")}</textarea>
          <div class="tpl-status" id="tpl-status-message"></div>
        </div>

        <div class="form-field">
          <label>${esc(t("field_data"))}</label>
          <textarea id="f-notif-data" rows="2" placeholder='${esc(
    t("ph_data_json")
  )}'>${nc.data ? JSON.stringify(nc.data, null, 2) : ""}</textarea>
        </div>

        <div class="form-field">
          <label>${esc(t("field_repeat_interval"))}</label>
          <input type="number" id="f-notif-interval" min="0" class="narrow" value="${
            nc.repeat_interval_sec !== undefined ? nc.repeat_interval_sec : 0
          }" />
          <div class="hint">${esc(t("hint_repeat_zero"))}</div>
        </div>

        <div class="form-field">
          <label>${esc(t("field_max_count"))}</label>
          <input type="number" id="f-notif-max" min="0" class="narrow" value="${
            nc.max_count !== undefined ? nc.max_count : 5
          }" />
          <div class="hint">${esc(t("hint_max_zero"))}</div>
        </div>

        <div class="form-field">
          <label class="checkbox-label">
            <input type="checkbox" id="f-notif-resolve" ${nc.send_resolve ? "checked" : ""} />
            ${esc(t("field_send_resolve"))}
          </label>
        </div>

        <div class="test-btn-row">
          <button type="button" id="btn-test-notif" class="secondary-btn">
            <ha-icon icon="mdi:send" style="--mdc-icon-size:16px;"></ha-icon> ${esc(t("btn_test_alert"))}
          </button>
          <span id="test-notif-status" class="hint"></span>
        </div>

        <div id="notif-resolve-wrap" style="display:${nc.send_resolve ? "block" : "none"}">
          <div class="form-field">
            <label>${esc(t("field_resolve_title"))}</label>
            <input type="text" id="f-notif-resolve-title" value="${esc(nc.resolve_title || "")}" placeholder="${esc(
    t("ph_resolve_title")
  )}" />
            <div class="tpl-status" id="tpl-status-resolve-title"></div>
          </div>
          <div class="form-field">
            <label>${esc(t("field_resolve_message"))}</label>
            <textarea id="f-notif-resolve-msg" rows="2" placeholder="${esc(
    panel._notifDefaults.resolve_message
  )}">${esc(nc.resolve_message || "")}</textarea>
            <div class="tpl-status" id="tpl-status-resolve-message"></div>
          </div>
          <div class="form-field">
            <label>${esc(t("field_resolve_data"))}</label>
            <textarea id="f-notif-resolve-data" rows="2" placeholder='${esc(
    t("ph_data_json")
  )}'>${nc.resolve_data ? JSON.stringify(nc.resolve_data, null, 2) : ""}</textarea>
          </div>
          <div class="test-btn-row">
            <button type="button" id="btn-test-resolve" class="secondary-btn">
              <ha-icon icon="mdi:send" style="--mdc-icon-size:16px;"></ha-icon> ${esc(t("btn_test_resolve"))}
            </button>
            <span id="test-resolve-status" class="hint"></span>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button id="btn-save" class="primary-btn">${isEdit ? esc(t("btn_update")) : esc(t("btn_create"))}</button>
        <button id="btn-cancel" class="secondary-btn">${esc(t("btn_cancel"))}</button>
      </div>

      <div id="form-error" class="error-msg" style="display:none"></div>
    </div>
  `;
}

export function bindAlertForm(panel) {
  const root = panel.shadowRoot;
  const t = panel._t.bind(panel);

  // Basic nav/actions
  root.querySelector("#btn-back")?.addEventListener("click", () => panel._closeForm());
  root.querySelector("#btn-cancel")?.addEventListener("click", () => panel._closeForm());
  root.querySelector("#btn-save")?.addEventListener("click", () => panel._saveAlert());

  // Auto-quit override toggle + hint
  const aqOvr = root.querySelector("#f-aq-override");
  const aqVal = root.querySelector("#f-aq-value");
  const aqHint = root.querySelector("#aq-hint");
  const levelSel = root.querySelector("#f-level");
  const aqValueLabel = root.querySelector("#aq-value-label");

  const updateAqHint = () => {
    const level = levelSel?.value || "info";
    const defaults = panel._autoQuitDefaults || {};
    if (!aqOvr?.checked) {
      aqHint.textContent = t("hint_level_default", {
        value: t(defaults[level] ? "status_aq_yes" : "status_aq_no"),
      });
    } else {
      aqHint.textContent = "";
    }
  };

  aqOvr?.addEventListener("change", () => {
    if (!aqVal) return;
    aqVal.disabled = !aqOvr.checked;
    aqValueLabel?.classList.toggle("dimmed", !aqOvr.checked);
    updateAqHint();
  });
  levelSel?.addEventListener("change", updateAqHint);
  updateAqHint();

  // Category "create new" toggle
  const catSel = root.querySelector("#f-category");
  const newCatInput = root.querySelector("#f-newcat");
  catSel?.addEventListener("change", () => {
    if (!newCatInput) return;
    newCatInput.style.display = catSel.value === "__new__" ? "" : "none";
  });

  // Notification toggle
  const notifEnabled = root.querySelector("#f-notif-enabled");
  const notifConfig = root.querySelector("#notif-config");
  notifEnabled?.addEventListener("change", () => {
    if (!notifConfig) return;
    notifConfig.style.display = notifEnabled.checked ? "block" : "none";
  });

  // Target chips add/remove
  const targetSelect = root.querySelector("#f-notif-target-select");
  const btnAddTarget = root.querySelector("#btn-add-target");
  const chipList = root.querySelector("#notif-target-chips");

  const addTargetChip = (target) => {
    if (!target || !chipList) return;
    if (chipList.querySelector(`[data-target="${CSS.escape(target)}"]`)) return;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.dataset.target = target;
    chip.innerHTML = `${panel._esc(target)} <button class="chip-x" data-rm="${panel._esc(target)}">×</button>`;
    chip.querySelector(".chip-x").addEventListener("click", () => chip.remove());
    chipList.appendChild(chip);
  };

  btnAddTarget?.addEventListener("click", () => {
    addTargetChip(targetSelect?.value);
    if (targetSelect) targetSelect.value = "";
  });

  chipList?.querySelectorAll(".chip-x").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".chip")?.remove());
  });

  // Resolve toggle
  const resolveChk = root.querySelector("#f-notif-resolve");
  const resolveWrap = root.querySelector("#notif-resolve-wrap");
  resolveChk?.addEventListener("change", () => {
    if (!resolveWrap) return;
    resolveWrap.style.display = resolveChk.checked ? "block" : "none";
  });

  // Helper: test notif context
  const getTestContext = () => {
    const name = root.querySelector("#f-name")?.value || "Test Alert";
    const level = root.querySelector("#f-level")?.value || "info";
    const condition = root.querySelector("#f-condition")?.value || "";
    const idInput = root.querySelector("#f-id");
    const entityId = idInput ? `alertsys.${idInput.value.trim()}` : "alertsys.test";
    return { context_name: name, context_level: level, context_condition: condition, context_entity_id: entityId };
  };
  const parseDataField = (selector) => {
    const str = root.querySelector(selector)?.value?.trim();
    if (!str) return null;
    try { return JSON.parse(str); } catch (_) { return null; }
  };

  // Test buttons
  root.querySelector("#btn-test-notif")?.addEventListener("click", async () => {
    const statusEl = root.querySelector("#test-notif-status");
    const targets = [...(chipList?.querySelectorAll(".chip") || [])].map((c) => c.dataset.target);
    if (targets.length === 0) {
      statusEl.textContent = t("status_no_targets");
      statusEl.style.color = "var(--error-color)";
      return;
    }
    const title = root.querySelector("#f-notif-title")?.value || "";
    const message = root.querySelector("#f-notif-message")?.value || "";
    const data = parseDataField("#f-notif-data");

    statusEl.textContent = t("status_sending");
    statusEl.style.color = "";
    try {
      await testNotification(panel._hass, { targets, title, message, data, ...getTestContext() });
      statusEl.textContent = t("status_sent");
      statusEl.style.color = "var(--success-color)";
    } catch (e) {
      statusEl.textContent = t("err_prefix") + (e.message || e);
      statusEl.style.color = "var(--error-color)";
    }
    setTimeout(() => { statusEl.textContent = ""; }, 5000);
  });

  root.querySelector("#btn-test-resolve")?.addEventListener("click", async () => {
    const statusEl = root.querySelector("#test-resolve-status");
    const targets = [...(chipList?.querySelectorAll(".chip") || [])].map((c) => c.dataset.target);
    if (targets.length === 0) {
      statusEl.textContent = t("status_no_targets");
      statusEl.style.color = "var(--error-color)";
      return;
    }
    const title =
      root.querySelector("#f-notif-resolve-title")?.value ||
      root.querySelector("#f-notif-title")?.value ||
      "";
    const message = root.querySelector("#f-notif-resolve-msg")?.value || "";
    const data = parseDataField("#f-notif-resolve-data");

    statusEl.textContent = t("status_sending");
    statusEl.style.color = "";
    try {
      await testNotification(panel._hass, { targets, title, message, data, ...getTestContext() });
      statusEl.textContent = t("status_sent");
      statusEl.style.color = "var(--success-color)";
    } catch (e) {
      statusEl.textContent = t("err_prefix") + (e.message || e);
      statusEl.style.color = "var(--error-color)";
    }
    setTimeout(() => { statusEl.textContent = ""; }, 5000);
  });

  // ID duplicate check (edit mode only)
  const idInput = root.querySelector("#f-id");
  const idError = root.querySelector("#id-error");
  const a = panel._editingAlert;
  if (idInput && idError) {
    const originalId = a.id;
    const checkIdDuplicate = () => {
      const suffix = idInput.value.trim();
      if (!suffix) {
        idError.textContent = t("err_id_empty");
        panel._idValid = false;
      } else {
        const exists = suffix !== originalId && (panel._alerts || []).some((al) => al.id === suffix);
        if (exists) {
          idError.textContent = t("err_id_exists");
          panel._idValid = false;
        } else {
          idError.textContent = "";
          panel._idValid = true;
        }
      }
      panel._updateSaveBtn();
    };
    idInput.addEventListener("input", checkIdDuplicate);
    panel._idValid = true;
  } else {
    panel._idValid = true;
  }

  // Condition live preview
  const condInput = root.querySelector("#f-condition");
  condInput?.addEventListener("input", () => panel._debounceConditionPreview(condInput.value));
  if (a.condition) panel._debounceConditionPreview(a.condition);

  // Template syntax validation
  const tplFields = [
    { input: "#f-notif-title", status: "#tpl-status-title" },
    { input: "#f-notif-message", status: "#tpl-status-message" },
    { input: "#f-notif-resolve-title", status: "#tpl-status-resolve-title" },
    { input: "#f-notif-resolve-msg", status: "#tpl-status-resolve-message" },
  ];

  for (const tf of tplFields) {
    const inputEl = root.querySelector(tf.input);
    const statusEl = root.querySelector(tf.status);
    if (inputEl && statusEl) {
      let tplTimer = null;
      const validate = () => {
        const val = inputEl.value || "";
        if (!looksLikeTemplate(val)) {
          statusEl.textContent = "";
          statusEl.className = "tpl-status";
          return;
        }
        clearTimeout(tplTimer);
        tplTimer = setTimeout(async () => {
          try {
            const res = await validateTemplate(panel._hass, val);
            if (res.valid) {
              statusEl.textContent = t("preview_template_ok");
              statusEl.className = "tpl-status valid";
            } else {
              statusEl.textContent = t("preview_syntax_error", { error: res.error });
              statusEl.className = "tpl-status invalid";
            }
          } catch (_) {
            statusEl.textContent = "";
            statusEl.className = "tpl-status";
          }
        }, 600);
      };

      inputEl.addEventListener("input", validate);
      if (inputEl.value) validate();
    }
  }
}
