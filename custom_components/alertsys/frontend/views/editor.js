import { renderAlertForm, bindAlertForm } from "../components/alert-form.js";

export function renderEditor(panel) {
  return `
    <div class="panel">
      ${renderAlertForm(panel)}
    </div>
  `;
}

export function bindEditor(panel) {
  bindAlertForm(panel);
}
