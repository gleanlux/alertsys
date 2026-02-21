export const STYLES = `
      :host {
        display: block;
        --primary-color: var(--ha-primary-color, #03a9f4);
        --bg: var(--ha-card-background, var(--card-background-color, #fff));
        --text: var(--primary-text-color, #212121);
        --text-secondary: var(--secondary-text-color, #727272);
        --divider: var(--divider-color, #e0e0e0);
        --error-color: var(--ha-error-color, #db4437);
        --success-color: #4caf50;
        font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
        color: var(--text);
      }
      .panel {
        max-width: 900px;
        margin: 0 auto;
        padding: 16px;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .toolbar h1 {
        margin: 0;
        font-size: 1.4em;
        font-weight: 500;
      }
      .primary-btn {
        background: var(--primary-color);
        color: #fff;
        border: none;
        padding: 8px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      .primary-btn:hover { opacity: 0.85; }
      .primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .secondary-btn {
        background: transparent;
        color: var(--primary-color);
        border: 1px solid var(--primary-color);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      .category-group {
        background: var(--bg);
        border-radius: 8px;
        margin-bottom: 12px;
        border: 1px solid var(--divider);
        overflow: hidden;
      }
      .category-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        cursor: pointer;
        user-select: none;
        background: var(--bg);
      }
      .category-header:hover { opacity: 0.8; }
      .collapse-icon { font-size: 12px; color: var(--text-secondary); }
      .badge {
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
        margin-left: auto;
      }
      .category-body { padding: 0 8px 8px; }
      .alert-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 8px;
        border-bottom: 1px solid var(--divider);
      }
      .alert-row:last-child { border-bottom: none; }
      .alert-name { font-weight: 500; min-width: 120px; }
      .alert-condition { flex: 1; color: var(--text-secondary); font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
      .alert-condition code { background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 3px; }
      .alert-autoquit {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .alert-autoquit.is-default { opacity: 0.65; }
      .alert-menu-wrap { position: relative; flex-shrink: 0; }
      .icon-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        font-size: 16px;
        color: var(--text-secondary);
      }
      .icon-btn:hover { background: rgba(0,0,0,0.08); }
      .alert-menu {
        display: none;
        position: fixed;
        background: var(--bg);
        border: 1px solid var(--divider);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.18);
        z-index: 999;
        min-width: 150px;
        overflow: hidden;
      }
      .alert-menu.open { display: block; }
      .menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 14px;
        color: var(--text);
        text-align: left;
      }
      .menu-item:hover { background: rgba(0,0,0,0.06); }
      .menu-item.danger { color: var(--error-color); }
      .menu-item.danger:hover { background: rgba(219,68,55,0.08); }
      .empty-msg { color: var(--text-secondary); font-style: italic; padding: 8px; font-size: 13px; }
      .empty-state { text-align: center; color: var(--text-secondary); padding: 48px 16px; font-size: 16px; }

      /* Form */
      .form-container { background: var(--bg); border-radius: 8px; padding: 24px; border: 1px solid var(--divider); }
      .form-field { margin-bottom: 16px; }
      .form-field label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 14px; }
      .form-field input[type="text"],
      .form-field input[type="number"],
      .form-field textarea,
      .form-field select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--divider);
        border-radius: 4px;
        font-size: 14px;
        background: var(--bg);
        color: var(--text);
        box-sizing: border-box;
        font-family: inherit;
      }
      .form-field input[type="number"].narrow {
        width: 120px;
      }
      /* Disabled / inactive fields: visually dimmed for clarity */
      .form-field.is-disabled {
        opacity: 0.60;
      }
      .form-field input:disabled,
      .form-field textarea:disabled,
      .form-field select:disabled {
        background: rgba(0,0,0,0.04);
        color: var(--text-secondary);
        cursor: not-allowed;
      }
      .form-field.is-disabled input,
      .form-field.is-disabled textarea,
      .form-field.is-disabled select {
        cursor: not-allowed;
      }
      .form-field textarea { resize: vertical; }
      .form-field input.readonly { background: rgba(0,0,0,0.04); color: var(--text-secondary); }
      .id-input-wrap {
        display: flex;
        align-items: center;
        border: 1px solid var(--divider);
        border-radius: 4px;
        background: var(--bg);
        overflow: hidden;
      }
      .id-input-wrap:focus-within {
        border-color: var(--primary-color);
      }
      .id-prefix {
        padding: 8px 2px 8px 12px;
        font-size: 14px;
        color: var(--text-secondary);
        white-space: nowrap;
        flex-shrink: 0;
        user-select: none;
      }
      .id-input-wrap input {
        border: none !important;
        outline: none;
        padding: 8px 12px 8px 0;
        font-size: 14px;
        background: transparent;
        color: var(--text);
        flex: 1;
        min-width: 0;
        width: auto;
      }
      .id-error {
        font-size: 12px;
        color: var(--error-color);
        padding-right: 12px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .aq-row { display: flex; gap: 20px; align-items: center; }
      .checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
      .checkbox-label.dimmed { opacity: 0.45; }
      .cat-row { display: flex; gap: 8px; }
      .cat-row select { flex: 1; }
      .cat-row input { flex: 1; }
      .hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
      .condition-preview {
        margin-top: 6px;
        font-size: 13px;
        min-height: 18px;
      }
      .condition-preview.ok { color: var(--success-color); }
      .condition-preview.error { color: var(--error-color); }
      /* Notification section */
      .notif-toggle { font-weight: 500; gap: 8px; margin-top: 8px; padding: 10px 0; border-top: 1px solid var(--divider); }
      .notif-section {
        background: rgba(0,0,0,0.02);
        border: 1px solid var(--divider);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .target-row { display: flex; gap: 8px; margin-bottom: 8px; }
      .target-row select { flex: 1; }
      .secondary-btn.small { padding: 6px 12px; font-size: 13px; }
      .chip-list { display: flex; flex-wrap: wrap; gap: 6px; min-height: 8px; }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--primary-color);
        color: #fff;
        padding: 3px 8px 3px 10px;
        border-radius: 12px;
        font-size: 13px;
      }
      .chip-x {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0 2px;
        opacity: 0.7;
      }
      .chip-x:hover { opacity: 1; }

      .tpl-status { font-size: 12px; margin-top: 3px; }
      .tpl-status.ok, .tpl-status.valid { color: var(--success-color); }
      .tpl-status.error, .tpl-status.invalid { color: var(--error-color); }
      .test-btn-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; margin-bottom: 12px; }
      .form-actions { display: flex; gap: 12px; margin-top: 24px; }
      .error-msg { color: var(--error-color); background: rgba(219,68,55,0.08); padding: 10px 14px; border-radius: 4px; margin-top: 12px; }
    `;
