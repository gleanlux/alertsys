// AlertSys built-in panel entrypoint (lazy-loads the real panel to avoid early-load issues)
class HaPanelAlertsys extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._panelEl = null;
    this._hass = undefined;
    this._panel = undefined;
    this._narrow = undefined;
    this._loaded = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._panelEl) this._panelEl.hass = hass;
  }

  set panel(panel) {
    this._panel = panel;
    if (this._panelEl) this._panelEl.panel = panel;
  }

  set narrow(narrow) {
    this._narrow = narrow;
    if (this._panelEl) this._panelEl.narrow = narrow;
  }

  async connectedCallback() {
    if (this._loaded) return;
    this._loaded = true;

    // Load the actual panel implementation only when the HA router mounts this view.
    await import("./alertsys-panel.js");

    this._panelEl = document.createElement("alertsys-panel");
    this.shadowRoot.appendChild(this._panelEl);

    // Flush any props that arrived before we were connected.
    if (this._hass !== undefined) this._panelEl.hass = this._hass;
    if (this._panel !== undefined) this._panelEl.panel = this._panel;
    if (this._narrow !== undefined) this._panelEl.narrow = this._narrow;
  }
}

if (!customElements.get("ha-panel-alertsys")) {
  customElements.define("ha-panel-alertsys", HaPanelAlertsys);
}
