import { testNotification, suggestEntityId, checkEntityId } from "../api/ws.js";
import { bindTemplateStatus } from "../api/templates.js";
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

  const fullEntityId = (a.entity_id || '').trim();
  const objectId = fullEntityId.startsWith('binary_sensor.alertsys_') ? fullEntityId.slice('binary_sensor.alertsys_'.length) : (fullEntityId.split('.')[1] || '').replace(/^alertsys_/, '');

  const aqOverride = a.auto_quit !== null && a.auto_quit !== undefined;
  const aqValue = aqOverride ? !!a.auto_quit : true;

  const catOptions = renderCategoryOptions({
    categories: panel._categories,
    selectedId: a.category_id || "default",
    esc,
  });

  return `
    <div class="toolbar">
      <h1>${esc(title)}</h1>
      <button id="btn-back" class="secondary-btn">${esc(t("btn_back"))}</button>
    </div>

    <div class="form-container">

      <div class="form-field">
        <label>${esc(t("field_name"))}</label>
        <input type="text" id="f-name" value="${esc(a.name || "")}" placeholder="${esc(
    t("ph_name")
  )}" />
      </div>

      <div class="form-field">
        <label>${esc(t("field_entity_id"))}</label>
        <div class="id-input-wrap">
          <span class="id-prefix">binary_sensor.alertsys_</span>
          <input type="text" id="f-entity-id" value="${esc(objectId || "")}" placeholder="${esc(panel._entityIdPlaceholderObj || "")}" />
          <span class="id-error" id="id-error"></span>
        </div>
      </div>

      <div class="form-field">
        <label>${esc(t("field_description"))}</label>
        <textarea id="f-description" rows="2" maxlength="255" placeholder="${esc(t("ph_description"))}">${esc(a.description || "")}</textarea>
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
        <div class="condition-preview" id="condition-preview"></div>
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
          <textarea id="f-notif-data" rows="5" placeholder='${esc(
    t("ph_data_json")
  )}'>${nc.data ? JSON.stringify(nc.data, null, 2) : ""}</textarea>
        </div>

        <div class="form-field">
          <label>${esc(t("field_repeat_count"))}</label>
          <input type="number" id="f-notif-repeat-count" min="0" class="narrow" value="${
            nc.repeat_count !== undefined ? nc.repeat_count : 0
          }" />
          <div class="hint">${esc(t("hint_repeat_count_zero"))}</div>
        </div>

        <div class="form-field">
          <label>${esc(t("field_repeat_interval"))}</label>
          <input type="number" id="f-notif-interval" min="5" class="narrow" value="${
            nc.repeat_interval_sec !== undefined
              ? nc.repeat_interval_sec
              : panel._notifDefaults.repeat_interval_sec
          }" />
          <div class="hint">${esc(t("hint_repeat_interval_min"))}</div>
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
            <textarea id="f-notif-resolve-data" rows="5" placeholder='${esc(
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
    panel._updateSaveBtn?.();
  });

  // Notification numeric constraints:
  // - repeat_count: 0 = no repeat (send once), must be >= 0
  // - repeat_interval_sec: minimum 5 seconds (used only when repeat_count > 0)
  const repeatCountInput = root.querySelector("#f-notif-repeat-count");
  const intervalInput = root.querySelector("#f-notif-interval");

  const applyRepeatUiState = () => {
    if (!repeatCountInput || !intervalInput) return;
    const rc = parseInt(String(repeatCountInput.value ?? "0"), 10);
    const repeatCount = Number.isFinite(rc) ? rc : 0;
    const disabled = repeatCount <= 0;
    intervalInput.disabled = disabled;

    // Dim the whole field (label + hint + input) when interval is inactive
    const field = intervalInput.closest(".form-field");
    if (field) {
      field.classList.toggle("is-disabled", disabled);
    }
  };

  const normalizeRepeatCount = () => {
    if (!repeatCountInput) return;
    const raw = String(repeatCountInput.value ?? "").trim();
    if (!raw) return; // keep empty while typing
    let v = parseInt(raw, 10);
    if (!Number.isFinite(v) || v < 0) v = 0;
    repeatCountInput.value = String(v);
    applyRepeatUiState();
  };

  const normalizeInterval = () => {
    if (!intervalInput || intervalInput.disabled) return;
    const raw = String(intervalInput.value ?? "").trim();
    if (!raw) return; // keep empty while typing
    let v = parseInt(raw, 10);
    if (!Number.isFinite(v) || v < 5) v = 5;
    intervalInput.value = String(v);
  };

  repeatCountInput?.addEventListener("blur", normalizeRepeatCount);
  repeatCountInput?.addEventListener("change", normalizeRepeatCount);
  intervalInput?.addEventListener("blur", normalizeInterval);
  intervalInput?.addEventListener("change", normalizeInterval);

  // Initialize state on first render
  applyRepeatUiState();

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
    panel._updateSaveBtn?.();
  });

  // Helper: test notif context
  const getTestContext = () => {
    const name = root.querySelector("#f-name")?.value || "Test Alert";
    const level = root.querySelector("#f-level")?.value || "info";
    const condition = root.querySelector("#f-condition")?.value || "";
    const entInput = root.querySelector("#f-entity-id");
    const objectId = entInput?.value?.trim() || entInput?.placeholder?.trim() || "test";
    const entityId = objectId ? `binary_sensor.alertsys_${objectId}` : "binary_sensor.alertsys_test";
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
      await testNotification(panel._hass, { targets, title, message, data, is_resolve: false, ...getTestContext() });
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
      await testNotification(panel._hass, { targets, title, message, data, is_resolve: true, ...getTestContext() });
      statusEl.textContent = t("status_sent");
      statusEl.style.color = "var(--success-color)";
    } catch (e) {
      statusEl.textContent = t("err_prefix") + (e.message || e);
      statusEl.style.color = "var(--error-color)";
    }
    setTimeout(() => { statusEl.textContent = ""; }, 5000);
  });


  // Entity ID live validation (create + edit)
  const entInput = root.querySelector("#f-entity-id");
  const idError = root.querySelector("#id-error");
  const a = panel._editingAlert;

  const setIdError = (msg) => {
    if (idError) idError.textContent = msg || "";
  };

  // Description hard limit (safety even with maxlength)
  const descEl = root.querySelector("#f-description");
  if (descEl) {
    descEl.addEventListener("input", () => {
      if (descEl.value.length > 255) descEl.value = descEl.value.slice(0, 255);
    });
  }

  // Suggest entity_id placeholder from name (debounced)
  const nameInput = root.querySelector("#f-name");
  let suggestTimer = null;
  const runSuggest = async () => {
    if (!nameInput || !entInput) return;
    const name = nameInput.value.trim();
    try {
      const res = await suggestEntityId(panel._hass, name || "Alert", a?._isEdit ? a.id : undefined);
      
      const full = (res.entity_id || '').trim();
      const obj = full.startsWith('binary_sensor.alertsys_') ? full.slice('binary_sensor.alertsys_'.length) : (full.split('.')[1] || '').replace(/^alertsys_/, '');
      panel._entityIdPlaceholderObj = obj;

      if (!entInput.value.trim()) {
        entInput.placeholder = panel._entityIdPlaceholderObj || '';
      }
    } catch (_) {
      // ignore (backend not ready)
    }
  };

  if (nameInput && entInput) {
    // initial placeholder
    setTimeout(runSuggest, 0);
    nameInput.addEventListener("input", () => {
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(runSuggest, 400);
    });
  }

  let checkTimer = null;
  const validateEntityId = async () => {
    if (!entInput) return;
    const v = entInput.value.trim();
    const isEdit = !!a?._isEdit;

    // Empty allowed on create (auto), required on edit
    if (!v) {
      if (isEdit) {
        setIdError(t("err_id_required"));
        panel._idValid = false;
      } else {
        setIdError("");
        panel._idValid = true;
      }
      panel._updateSaveBtn();
      return;
    }

    // Quick local format check (official form only)
    const okFormat = /^[a-z0-9_]+$/.test(v);
    if (!okFormat) {
      setIdError(t("err_id_invalid"));
      panel._idValid = false;
      panel._updateSaveBtn();
      return;
    }

    try {
      const res = await checkEntityId(panel._hass, `binary_sensor.alertsys_${v}`, isEdit ? a.id : undefined);
      if (!res.valid) {
        setIdError(t("err_id_invalid"));
        panel._idValid = false;
      } else if (!res.available) {
        setIdError(t("err_id_exists"));
        panel._idValid = false;
      } else {
        setIdError("");
        panel._idValid = true;
      }
    } catch (e) {
      setIdError(t("err_prefix") + (e.message || e));
      panel._idValid = false;
    }
    panel._updateSaveBtn();
  };

  if (entInput) {
    panel._idValid = !a?._isEdit; // create starts valid, edit will validate
    entInput.addEventListener("input", () => {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(validateEntityId, 300);
    });
    // validate once on load
    setTimeout(validateEntityId, 0);
  }
  // Condition live preview (unified template validator/renderer)
  const condInput = root.querySelector("#f-condition");
  const condStatus = root.querySelector("#condition-preview");
  if (condInput && condStatus) {
    const cleanup = bindTemplateStatus({
      hass: panel._hass,
      inputEl: condInput,
      statusEl: condStatus,
      t,
      debounceMs: 500,
      render: true,
      requireBoolean: true,
      getVariables: () => (typeof panel._getTemplatePreviewVariables === "function" ? panel._getTemplatePreviewVariables() : null),
      onPlainValue: (val) => {
        const entityId = (val || "").trim();
        if (!entityId) return { text: "", cls: "", valid: null };
        const stateObj = panel._hass?.states?.[entityId];
        if (!stateObj) {
          return { text: t("preview_entity_not_found", { condition: entityId }), cls: "error", valid: false };
        }
        return { text: t("preview_entity_state", { val: stateObj.state }), cls: "ok", valid: true };
      },
      onValidityChange: (v) => {
        panel._conditionValid = v;
        panel._updateSaveBtn();
      },
      baseClass: "condition-preview",
      okClass: "ok",
      errorClass: "error",
      maxLen: 200,
    });
    if (typeof panel._registerCleanup === "function") {
      panel._registerCleanup(cleanup);
    }
  }

  // Template syntax validation
  const tplFields = [
    { input: "#f-notif-title", status: "#tpl-status-title", key: "title" },
    { input: "#f-notif-message", status: "#tpl-status-message", key: "message" },
    { input: "#f-notif-resolve-title", status: "#tpl-status-resolve-title", key: "resolve_title" },
    { input: "#f-notif-resolve-msg", status: "#tpl-status-resolve-message", key: "resolve_message" },
  ];

  for (const tf of tplFields) {
    const inputEl = root.querySelector(tf.input);
    const statusEl = root.querySelector(tf.status);
    if (inputEl && statusEl) {
      const cleanup = bindTemplateStatus({
        hass: panel._hass,
        inputEl,
        statusEl,
        t,
        debounceMs: 600,
        // Render previews for these fields too (not just syntax)
        render: true,
        requireBoolean: false,
        getVariables: () => (typeof panel._getTemplatePreviewVariables === "function" ? panel._getTemplatePreviewVariables() : null),
        onValidityChange: (v) => {
          if (!panel._notifTplValidity) panel._notifTplValidity = {};
          panel._notifTplValidity[tf.key] = v;
          panel._updateSaveBtn();
        },
        baseClass: "tpl-status",
        okClass: "ok",
        errorClass: "error",
        maxLen: 160,
      });
      if (typeof panel._registerCleanup === "function") {
        panel._registerCleanup(cleanup);
      }
    }
  }
}
