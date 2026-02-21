// Template-related WS helpers (syntax validation).

function _shortenTemplateError(err) {
  let s = (err ?? "").toString().trim();
  if (!s) return "Unknown template error";

  // Common duplicated prefixes from HA TemplateError wrapping
  s = s.replace(/^Template error:\s*/i, "");
  s = s.replace(/^ValueError:\s*/i, "");
  s = s.replace(/^Template error:\s*/i, "");

  // Drop the huge "when rendering template '...'" part (often contains the full template again)
  s = s.replace(/\s+when rendering template[\s\S]*$/i, "");

  // Friendly hints for very common pitfalls
  const mFloat = s.match(/float got invalid input '([^']+)'/i);
  if (mFloat) {
    return `float: invalid input '${mFloat[1]}'`;
  }
  const mInt = s.match(/int got invalid input '([^']+)'/i);
  if (mInt) {
    return `int: invalid input '${mInt[1]}'`;
  }

  // Keep it short
  const MAX = 160;
  if (s.length > MAX) s = s.slice(0, MAX - 1) + "…";
  return s;
}


export function looksLikeTemplate(str) {
  if (!str) return false;
  return str.includes("{{") || str.includes("{%");
}

export async function validateTemplate(hass, template) {
  if (!hass || typeof hass.callWS !== "function") return { valid: true };
  return hass.callWS({ type: "alertsys/validate_template", template });
}

function _normalizeWsError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

/**
 * Render a Jinja template once using HA's `render_template` WS subscription.
 * Subscribes, waits for the first message (result or error), then unsubscribes.
 */
export async function renderTemplateOnce(
  hass,
  template,
  { variables = null, strict = true, timeoutMs = 1500 } = {}
) {
  if (!hass || typeof hass.callWS !== "function") {
    throw new Error("No Home Assistant websocket connection");
  }
  // Use our own backend renderer to avoid HA log spam while typing.
  // The built-in `render_template` subscription logs template errors to the
  // system log on each partial/invalid render.
  const msg = {
    type: "alertsys/template/render_once",
    template,
    strict: !!strict,
  };
  if (variables && typeof variables === "object") {
    msg.variables = variables;
  }

  // Timeout guard (callWS itself has internal timeouts, but keep this local)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("No response from template renderer.")), timeoutMs)
  );

  const res = await Promise.race([hass.callWS(msg), timeout]);
  if (res?.error) {
    throw new Error(String(res.error));
  }
  return { result: res?.result };
}

/**
 * Bind a live template validator/renderer to an input and status element.
 * - If the value doesn't look like a template, clears the status.
 * - If syntax invalid, shows syntax error.
 * - If render enabled, shows rendered result (optionally boolean-checked).
 */
export function bindTemplateStatus({
  hass,
  inputEl,
  statusEl,
  t,
  debounceMs = 600,
  render = true,
  requireBoolean = false,
  getVariables = null,
  onPlainValue = null,
  onValidityChange = null,
  baseClass = "tpl-status",
  okClass = "ok",
  errorClass = "error",
  maxLen = 140,
}) {
  if (!inputEl || !statusEl || typeof t !== "function") {
    return () => {};
  }

  let timer = null;
  let seq = 0;

  const setStatus = (text, cls, title = "") => {
    statusEl.textContent = text || "";
    statusEl.className = [baseClass, cls].filter(Boolean).join(" ");
    statusEl.title = title || "";
  };

  const run = async () => {
    const cur = ++seq;
    const val = (inputEl.value || "").toString();
    const trimmed = val.trim();

    if (!trimmed) {
      setStatus("", "", "");
      if (typeof onValidityChange === "function") onValidityChange(null);
      return;
    }

    if (!looksLikeTemplate(val)) {
      if (typeof onPlainValue === "function") {
        const out = onPlainValue(val);
        if (out && typeof out === "object") {
          setStatus(out.text || "", out.cls || "");
          if (typeof onValidityChange === "function") {
            onValidityChange(out.valid === undefined ? null : out.valid);
          }
          return;
        }
      }
      setStatus("", "");
      if (typeof onValidityChange === "function") onValidityChange(null);
      return;
    }

    // Syntax validation
    try {
      const v = await validateTemplate(hass, val);
      if (cur !== seq) return;
      if (v && v.valid === false) {
        const full = (v.error || v.message || "").toString();
        const short = _shortenTemplateError(full);
        setStatus(t("preview_syntax_error", { error: short }), errorClass, full);
        if (typeof onValidityChange === "function") onValidityChange(false);
        return;
      }
    } catch (e) {
      if (cur !== seq) return;
      const full = (e?.message || String(e) || "").toString();
      const short = _shortenTemplateError(full);
      setStatus(t("preview_template_error", { error: short }), errorClass, full);
      if (typeof onValidityChange === "function") onValidityChange(false);
      return;
    }

    if (!render) {
      setStatus(t("preview_template_ok"), okClass, "");
      if (typeof onValidityChange === "function") onValidityChange(true);
      return;
    }

    // Render (once)
    try {
      const variables = typeof getVariables === "function" ? getVariables() : null;
      const { result } = await renderTemplateOnce(hass, val, { variables, strict: true, timeoutMs: 1500 });
      if (cur !== seq) return;

      const resStr = result === undefined || result === null ? "" : String(result);
      if (requireBoolean) {
        const s = resStr.trim().toLowerCase();
        const boolLike = ["true", "false", "on", "off", "1", "0", "yes", "no"].includes(s);
        if (!boolLike) {
          setStatus(t("preview_template_not_bool", { result: resStr }), errorClass);
          if (typeof onValidityChange === "function") onValidityChange(false);
          return;
        }
      }

      const clipped = resStr.length > maxLen ? resStr.slice(0, maxLen - 1) + "…" : resStr;
      setStatus(t("preview_template_result", { result: clipped }), okClass, "");
      if (typeof onValidityChange === "function") onValidityChange(true);
    } catch (e) {
      if (cur !== seq) return;
      const full = (e?.message || String(e) || "").toString();
      const short = _shortenTemplateError(full);
      setStatus(t("preview_template_error", { error: short }), errorClass, full);
      if (typeof onValidityChange === "function") onValidityChange(false);
    }
  };

  const onInput = () => {
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  };

  inputEl.addEventListener("input", onInput);

  // Initial validate
  if ((inputEl.value || "").trim()) {
    onInput();
  }

  return () => {
    clearTimeout(timer);
    // Invalidate any in-flight async
    seq++;
    try {
      inputEl.removeEventListener("input", onInput);
    } catch (_) {}
  };
}
