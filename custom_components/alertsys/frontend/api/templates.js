// Template-related WS helpers (syntax validation).

export function looksLikeTemplate(str) {
  if (!str) return false;
  return str.includes("{{") || str.includes("{%");
}

export async function validateTemplate(hass, template) {
  if (!hass || typeof hass.callWS !== "function") return { valid: true };
  return hass.callWS({ type: "alertsys/validate_template", template });
}
