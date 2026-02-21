// Template-related WS helpers (syntax validation).

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
  if (!hass?.connection?.subscribeMessage) {
    throw new Error("No Home Assistant websocket connection");
  }

  let done = false;
  let unsub = null;
  let wantUnsubAfterReady = false;

  return await new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        if (unsub) unsub();
      } catch (_) {}
      reject(new Error("No response from template renderer."));
    }, timeoutMs);

    const onMsg = (msg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      // We might receive the callback before `unsub` is assigned.
      if (unsub) {
        try {
          unsub();
        } catch (_) {}
      } else {
        wantUnsubAfterReady = true;
      }

      const payload = msg?.event ?? msg;
      const error = payload?.error ?? msg?.error;
      if (error) {
        reject(new Error(_normalizeWsError(error)));
        return;
      }
      resolve({ result: payload?.result });
    };

    const subscribe = async (withVars) => {
      const msg = { type: "render_template", template, strict };
      if (withVars && variables && typeof variables === "object") {
        msg.variables = variables;
      }
      return await hass.connection.subscribeMessage(onMsg, msg);
    };

    try {
      unsub = await subscribe(true);
      if (wantUnsubAfterReady) {
        try {
          unsub();
        } catch (_) {}
      }
    } catch (e) {
      // Compatibility fallback: some HA versions may reject unknown keys.
      if (variables) {
        try {
          unsub = await subscribe(false);
          if (wantUnsubAfterReady) {
            try {
              unsub();
            } catch (_) {}
          }
          return;
        } catch (_) {
          // fall through to error handling below
        }
      }
      clearTimeout(timer);
      if (done) return;
      done = true;
      try {
        if (unsub) unsub();
      } catch (_) {}
      reject(e);
    }
  });
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

  const setStatus = (text, cls) => {
    statusEl.textContent = text || "";
    statusEl.className = [baseClass, cls].filter(Boolean).join(" ");
  };

  const run = async () => {
    const cur = ++seq;
    const val = (inputEl.value || "").toString();
    const trimmed = val.trim();

    if (!trimmed) {
      setStatus("", "");
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
        setStatus(t("preview_syntax_error", { error: v.error || v.message || "" }), errorClass);
        if (typeof onValidityChange === "function") onValidityChange(false);
        return;
      }
    } catch (e) {
      if (cur !== seq) return;
      setStatus(t("preview_template_error", { error: e?.message || String(e) }), errorClass);
      if (typeof onValidityChange === "function") onValidityChange(false);
      return;
    }

    if (!render) {
      setStatus(t("preview_template_ok"), okClass);
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
      setStatus(t("preview_template_result", { result: clipped }), okClass);
      if (typeof onValidityChange === "function") onValidityChange(true);
    } catch (e) {
      if (cur !== seq) return;
      setStatus(t("preview_template_error", { error: e?.message || String(e) }), errorClass);
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
