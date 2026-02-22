/**
 * AlertSys Panel – custom panel for Home Assistant.
 * Manages alerts via WebSocket CRUD commands.
 * Optimized version with dynamic translation loading.
 */
import { STYLES } from "./styles.js";
import { listAlerts, notifyServices, deleteAlert, getTranslations, createAlert, updateAlert } from "./api/ws.js";
import { renderList, handleListClick } from "./views/list.js";
import { renderEditor, bindEditor } from "./views/editor.js";

// NOTE: This panel is implemented as a vanilla custom element (HTMLElement) to keep it simple.

// Minimal fallback translations (only for critical errors when backend is unavailable)
const FALLBACK_TRANSLATIONS = {
  title: "Alert Manager",
  btn_retry: "Retry",
  btn_back: "← Back",
  btn_new: "+ New Alert",
  btn_cancel: "Cancel",
  err_load_failed: "Failed to load alerts. Check the connection and try again.",
  err_translations_failed: "Failed to load translations. Using English fallback.",
};

// Simple approach: use globalThis lit or raw HTMLElement
class AlertSysPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._alerts = [];
    this._categories = [];
    this._editingAlert = null; // null = list view, {} = new, {id:...} = editing
    this._conditionValid = null; // null = unknown, true/false
    // Live template validity for notification fields (title/message/resolve_*)
    this._notifTplValidity = { title: null, message: null, resolve_title: null, resolve_message: null };
    this._notifyServices = []; // cached from WS
    this._autoQuitDefaults = { info: true, warning: true, error: false }; // overwritten from backend
    this._notifDefaults = { title: "", message: "", resolve_message: "" }; // overwritten from backend
    this._translations = {};
    this._translationsLoaded = false;
    this._currentLanguage = null;
    // WS connection listeners (for reconnect after tab hidden)
    this._connection = null;
    this._connReadyHandler = null;
    this._connDiscHandler = null;
    this._onShadowClick = this._onShadowClick.bind(this);

    // Cleanup callbacks registered by form bindings (timers, listeners, etc.)
    this._cleanupFns = [];
  }

  async _loadTranslations() {
    const lang = this._hass?.language || "en";
    
    // Skip if already loaded for this language
    if (this._translationsLoaded && this._currentLanguage === lang) {
      return;
    }

    try {
      const result = await getTranslations(this._hass, lang);
      this._translations = result.translations || {};
      this._translationsLoaded = true;
      this._currentLanguage = lang;
      console.log(`AlertSys: Translations loaded for '${lang}'`);
    } catch (e) {
      console.warn("AlertSys: Failed to load translations, using fallback", e);
      this._translations = FALLBACK_TRANSLATIONS;
      this._translationsLoaded = true;
      this._currentLanguage = "en";
    }
  }

  _t(key, vars) {
    let s = this._translations[key] || FALLBACK_TRANSLATIONS[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, v);
      }
    }
    return s;
  }

  set hass(hass) {
    const hadHass = !!this._hass;
    const oldConn = this._hass?.connection;
    const newConn = hass?.connection;
    const langChanged = this._hass && this._hass.language !== hass.language;
    this._hass = hass;
    // (Re)attach WS connection listeners when connection object changes
    if (newConn && newConn !== oldConn) {
      this._detachConnectionListeners();
      this._attachConnectionListeners(newConn);
    }
    
    // Reload translations if language changed
    if (langChanged) {
      this._translationsLoaded = false;
      this._loadData();
      return;
    }
    
    if (!this._loaded) {
      this._loaded = true;
      this._loadData();
    } else if (hadHass && this._connected && !this.shadowRoot.querySelector(".panel")) {
      // Panel was re-attached but DOM content is gone – reload
      this._loadData();
    }
  }

  set panel(panel) {
    this._panel = panel;
  }

  connectedCallback() {
    this._connected = true;
    // Ensure WS connection listeners are attached
    if (this._hass?.connection && !this._connection) {
      this._attachConnectionListeners(this._hass.connection);
    }
    this._dlog("connectedCallback");
    // Attach delegated click handler once
    if (!this._shadowClickBound) {
      this._shadowClickBound = true;
      this.shadowRoot.addEventListener("click", this._onShadowClick);
    }
    // If we already had data but the DOM is empty, re-render
    if (this._hass && this._loaded && !this.shadowRoot.querySelector(".panel")) {
      this._loadData();
    }
  }

  disconnectedCallback() {
    this._connected = false;
    this._runCleanup();
    this._detachConnectionListeners();
  }

  // --- View routing helpers (used by views/list.js) ---
  _openNew() {
    this._editingAlert = { name: "", entity_id: "", description: "", level: "info", condition: "", auto_quit: null, category_id: "default" };
    this._render();
  }

  _openEdit(id) {
    const alertObj = this._alerts.find(a => a.id === id);
    if (!alertObj) return;
    this._editingAlert = { ...alertObj, _isEdit: true };
    this._render();
  }

  async _confirmAndDelete(id) {
    const alertObj = this._alerts.find(a => a.id === id);
    if (!alertObj) return;
    if (!confirm(this._t("confirm_delete", { name: alertObj.name }))) return;
    try {
      await deleteAlert(this._hass, id);
      await this._loadData();
    } catch (err) {
      window.alert(this._t("err_prefix") + (err.message || err));
    }
  }

  async _onShadowClick(e) {
    // Error view retry
    if (e.target.closest("#btn-retry")) {
      this._loadData();
      return;
    }

    // List view handlers
    if (this._editingAlert === null) {
      // This handles menu toggles, edit/delete/new, and outside-click menu close.
      await handleListClick(this, e);
      return;
    }
  }

  _debugEnabled() {
    try {
      return localStorage.getItem("alertsys_debug") === "1" || window.__ALERTSYS_DEBUG__ === true;
    } catch (_) {
      return window.__ALERTSYS_DEBUG__ === true;
    }
  }

  _dlog(message, extra) {
    if (!this._debugEnabled()) return;
    try {
      const state = {
        connected: !!this._connected,
        loaded: !!this._loaded,
        hasPanel: !!this.shadowRoot?.querySelector?.(".panel"),
        innerLen: this.shadowRoot?.innerHTML?.length ?? null,
        visibility: document.visibilityState,
      };
      console.debug(`AlertSys(panel): ${message}`, { ...state, ...extra });
    } catch (_) {
      // ignore
    }
  }

  _attachConnectionListeners(conn) {
    if (!conn || this._connection === conn) return;
    this._connection = conn;

    this._connReadyHandler = () => this._onConnectionReady();
    this._connDiscHandler = () => this._onConnectionDisconnected();

    try {
      conn.addEventListener("ready", this._connReadyHandler);
      conn.addEventListener("disconnected", this._connDiscHandler);
      this._dlog("attached ws listeners");
    } catch (e) {
      // If HA changes the connection API, we don't want to break the panel
      this._dlog("failed to attach ws listeners", { error: String(e) });
    }
  }

  _detachConnectionListeners() {
    const conn = this._connection;
    if (!conn) return;

    try {
      if (this._connReadyHandler) conn.removeEventListener("ready", this._connReadyHandler);
      if (this._connDiscHandler) conn.removeEventListener("disconnected", this._connDiscHandler);
    } catch (_) {
      // ignore
    }
    this._connection = null;
    this._connReadyHandler = null;
    this._connDiscHandler = null;
    this._dlog("detached ws listeners");
  }

  _onConnectionDisconnected() {
    // No UI change here by default; we just log for diagnostics.
    this._dlog("ws disconnected");
  }

  _onConnectionReady() {
    // HA closes the WS when the tab is hidden for ~5 minutes; when we come back,
    // we reload data to restore the panel without requiring navigation/refresh.
    this._dlog("ws ready -> reload");
    if (this._hass && this._loaded) {
      this._loadData();
    }
  }

  async _loadData() {
    if (this._loading) return;
    this._loading = true;
    
    try {
      // Load translations first if not loaded
      if (!this._translationsLoaded) {
        await this._loadTranslations();
      }
      
      const result = await listAlerts(this._hass);
      this._alerts = result.alerts || [];
      this._categories = result.categories || [];
      if (result.auto_quit_defaults) this._autoQuitDefaults = result.auto_quit_defaults;
      if (result.notification_defaults) this._notifDefaults = result.notification_defaults;
      
      // Load notify services in background
      try {
        const ns = await notifyServices(this._hass);
        this._notifyServices = ns.services || [];
      } catch (_) { /* ignore if not available */ }
      
      this._render();
    } catch (e) {
      console.error("AlertSys: failed to load data", e);
      this._renderError(this._t("err_load_failed"));
    } finally {
      this._loading = false;
    }
  }

  _renderError(message) {
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="panel">
        <div class="toolbar">
          <h1>${this._esc(this._t("title"))}</h1>
        </div>
        <div class="list-container">
          <div class="empty-state" style="color: var(--error-color, #db4437);">
            ${this._esc(message)}
            <br><br>
            <button class="primary-btn" id="btn-retry">${this._esc(this._t("btn_retry"))}</button>
          </div>
        </div>
      </div>`;
  }

  _getGrouped() {
    const groups = {};
    // Ensure default category exists
    const defaultCat = this._categories.find(c => c.id === "default");
    groups["default"] = {
      name: this._t("uncategorized"),
      alerts: [],
    };
    // Add other categories
    for (const cat of this._categories) {
      if (cat.id !== "default") {
        groups[cat.id] = { name: cat.name, alerts: [] };
      }
    }
    // Place alerts
    for (const alert of this._alerts) {
      const catId = alert.category_id || "default";
      if (!groups[catId]) {
        groups[catId] = { name: catId, alerts: [] };
      }
      groups[catId].alerts.push(alert);
    }
    return groups;
  }

  _render() {
    // Clear any pending timers/listeners from a previous view render
    this._runCleanup();

    // List view
    if (this._editingAlert === null) {
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        ${renderList(this)}
      `;
      return;
    }

    // Editor view
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      ${renderEditor(this)}
    `;
    bindEditor(this);
  }

  // Form rendering moved to views/editor.js + components/alert-form.js

  _registerCleanup(fn) {
    if (typeof fn === "function") {
      this._cleanupFns.push(fn);
    }
  }

  _runCleanup() {
    const fns = this._cleanupFns;
    this._cleanupFns = [];
    for (const fn of fns) {
      try {
        fn();
      } catch (_) {}
    }
  }

  _getTemplatePreviewVariables() {
    const root = this.shadowRoot;
    const name = root?.querySelector("#f-name")?.value?.trim?.() || "";
    const level = root?.querySelector("#f-level")?.value || "info";
    const condition = root?.querySelector("#f-condition")?.value?.trim?.() || "";
    const entEl = root?.querySelector("#f-entity-id");
    // Entity ID input holds only object_id; domain prefix is fixed in UI.
    const obj = entEl?.value?.trim?.() || entEl?.placeholder?.trim?.() || "";
    const entity_id = obj ? `binary_sensor.alertsys_${obj}` : "binary_sensor.alertsys_preview";
    return {
      name,
      level,
      condition,
      entity_id,
      count: 1,
      triggered_at: new Date().toISOString(),
    };
  }

  async _saveAlert() {
    const isEdit = !!this._editingAlert._isEdit;
    const errDiv = this.shadowRoot.querySelector("#form-error");
    errDiv.style.display = "none";

    const name = this.shadowRoot.querySelector("#f-name").value.trim();
    const object_id = this.shadowRoot.querySelector("#f-entity-id").value.trim();
    const entity_id = object_id ? `binary_sensor.alertsys_${object_id}` : "";
    const description = this.shadowRoot.querySelector("#f-description").value.trim();
    const level = this.shadowRoot.querySelector("#f-level").value;
    const condition = this.shadowRoot.querySelector("#f-condition").value.trim();
    const aqOvr = this.shadowRoot.querySelector("#f-aq-override").checked;
    const aqVal = this.shadowRoot.querySelector("#f-aq-value").checked;
    const catSel = this.shadowRoot.querySelector("#f-category").value;
    const newCat = this.shadowRoot.querySelector("#f-newcat").value.trim();

    if (!name) { this._showError(this._t("err_name_required")); return; }
    if (!condition) { this._showError(this._t("err_condition_required")); return; }
    if (this._conditionValid === false) { this._showError(this._t("err_condition_invalid")); return; }
    if (this._idValid === false) { this._showError(this._t("err_id_invalid")); return; }

    const auto_quit = aqOvr ? aqVal : null;

    let category_id = catSel;
    let category_name = null;
    if (catSel === "__new__") {
      if (!newCat) { this._showError(this._t("err_category_required")); return; }
      // Create slug from name (NFD strips accents: á→a, ü→u, etc.)
      category_id = newCat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      category_name = newCat;
    }

    // Collect notification config
    const notifEnabledChk = this.shadowRoot.querySelector("#f-notif-enabled");
    const notification = {
      enabled: notifEnabledChk?.checked || false,
      targets: [...(this.shadowRoot.querySelectorAll("#notif-target-chips .chip") || [])].map(c => c.dataset.target),
      title: this.shadowRoot.querySelector("#f-notif-title")?.value || "",
      message: this.shadowRoot.querySelector("#f-notif-message")?.value || "",
      data: null,
      repeat_count: parseInt(this.shadowRoot.querySelector("#f-notif-repeat-count")?.value || "0", 10),
      repeat_interval_sec: parseInt(
        this.shadowRoot.querySelector("#f-notif-interval")?.value ||
          String(this._notifDefaults?.repeat_interval_sec ?? 60),
        10
      ),
      send_resolve: this.shadowRoot.querySelector("#f-notif-resolve")?.checked || false,
      resolve_title: this.shadowRoot.querySelector("#f-notif-resolve-title")?.value || "",
      resolve_message: this.shadowRoot.querySelector("#f-notif-resolve-msg")?.value || "",
      resolve_data: null,
    };
    // Parse data JSON if provided
    const dataStr = this.shadowRoot.querySelector("#f-notif-data")?.value?.trim();
    if (dataStr) {
      try {
        notification.data = JSON.parse(dataStr);
      } catch (_) {
        this._showError(this._t("err_notif_data_json"));
        return;
      }
    }
    // Parse resolve data JSON if provided
    const resolveDataStr = this.shadowRoot.querySelector("#f-notif-resolve-data")?.value?.trim();
    if (resolveDataStr) {
      try {
        notification.resolve_data = JSON.parse(resolveDataStr);
      } catch (_) {
        this._showError(this._t("err_resolve_data_json"));
        return;
      }
    }

    // Validate numeric constraints
    if (!Number.isFinite(notification.repeat_count) || notification.repeat_count < 0) {
      this._showError(this._t("err_repeat_count_min"));
      return;
    }
    if (notification.repeat_count > 0) {
      if (!Number.isFinite(notification.repeat_interval_sec) || notification.repeat_interval_sec < 5) {
        this._showError(this._t("err_repeat_interval_min"));
        return;
      }
    }


    // Block saving if any *active* notification template field has a template error.
    if (notification.enabled) {
      const invalid = [];
      const v = this._notifTplValidity || {};
      if (v.title === false) invalid.push(this._t("field_title"));
      if (v.message === false) invalid.push(this._t("field_message"));
      if (notification.send_resolve) {
        if (v.resolve_title === false) invalid.push(this._t("field_resolve_title"));
        if (v.resolve_message === false) invalid.push(this._t("field_resolve_message"));
      }
      if (invalid.length) {
        this._showError(this._t("err_notif_templates_invalid", { fields: invalid.join(", ") }));
        return;
      }
    }

    // NOTE: Do not block saving if notification config is incomplete.
    // Users may want to save a draft while still editing notification targets/templates.

    // entity_id is optional on create; required on edit
    if (isEdit && !object_id) { this._showError(this._t("err_id_required")); return; }

        try {
      if (isEdit) {
        await updateAlert(this._hass, { alert_uid: this._editingAlert.id, entity_id, description, name, level, condition, auto_quit, category_id, category_name, notification });
      } else {
        await createAlert(this._hass, { entity_id: entity_id || undefined, description, name, level, condition, auto_quit, category_id, category_name, notification });
      }
      this._closeForm();
      await this._loadData();
    } catch (e) {
      this._showError(e.message || String(e));
    }
  }

  _updateSaveBtn() {
    const btn = this.shadowRoot?.querySelector("#btn-save");
    if (!btn) return;

    // Notification template invalid? (only when notification is enabled)
    let notifInvalid = false;
    try {
      const notifEnabled = !!this.shadowRoot?.querySelector("#f-notif-enabled")?.checked;
      if (notifEnabled) {
        const sendResolve = !!this.shadowRoot?.querySelector("#f-notif-resolve")?.checked;
        const v = this._notifTplValidity || {};
        notifInvalid = (v.title === false) || (v.message === false) || (sendResolve && ((v.resolve_title === false) || (v.resolve_message === false)));
      }
    } catch (_) {
      notifInvalid = false;
    }

    // Disable save when hard validation fails (entity_id / condition / notification templates)
    const hardInvalid = this._conditionValid === false || this._idValid === false || notifInvalid;
    btn.disabled = hardInvalid;

    if (this._conditionValid === false) {
      btn.title = this._t("tooltip_condition_bool");
    } else if (this._idValid === false) {
      btn.title = this._t("tooltip_fix_id");
    } else if (notifInvalid) {
      btn.title = this._t("tooltip_fix_notification");
    } else {
      btn.title = "";
    }
  }

  _showError(msg) {
    const errDiv = this.shadowRoot.querySelector("#form-error");
    if (errDiv) {
      errDiv.textContent = msg;
      errDiv.style.display = "";
    }
  }

  _closeForm() {
    this._runCleanup();
    this._editingAlert = null;
    this._conditionValid = null;
    this._notifTplValidity = { title: null, message: null, resolve_title: null, resolve_message: null };
    this._idValid = true;
    this._render();
  }

  _esc(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
}

if (!customElements.get("alertsys-panel")) {
  customElements.define("alertsys-panel", AlertSysPanel);
}
