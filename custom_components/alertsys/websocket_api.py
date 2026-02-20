"""WebSocket API for AlertSys CRUD operations."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import jinja2
import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.template import Template
from homeassistant.util import dt as dt_util

from .const import (
    AUTO_QUIT_DEFAULTS,
    DOMAIN,
    NOTIF_DEFAULT_MESSAGE,
    NOTIF_DEFAULT_REPEAT_INTERVAL_SEC,
    NOTIF_DEFAULT_RESOLVE_MESSAGE,
    NOTIF_DEFAULT_TITLE,
    VALID_LEVELS,
)

_LOGGER = logging.getLogger(__name__)

NOTIFICATION_SCHEMA = {
    vol.Optional("enabled", default=False): bool,
    vol.Optional("targets", default=[]): [str],
    vol.Optional("title", default=""): str,
    vol.Optional("message", default=""): str,
    vol.Optional("data"): vol.Any(None, dict),
    # repeat_count: 0 = no repeat, otherwise repeat that many additional times
    vol.Optional("repeat_count", default=0): vol.All(vol.Coerce(int), vol.Range(min=0)),
    # repeat_interval_sec: only used when repeat_count > 0; minimum 5 seconds
    vol.Optional("repeat_interval_sec", default=NOTIF_DEFAULT_REPEAT_INTERVAL_SEC): vol.All(
        vol.Coerce(int),
        vol.Range(min=5),
    ),
    vol.Optional("send_resolve", default=False): bool,
    vol.Optional("resolve_title", default=""): str,
    vol.Optional("resolve_message", default=""): str,
    vol.Optional("resolve_data"): vol.Any(None, dict),
}


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register all AlertSys WebSocket commands."""
    websocket_api.async_register_command(hass, ws_list_alerts)
    websocket_api.async_register_command(hass, ws_create_alert)
    websocket_api.async_register_command(hass, ws_update_alert)
    websocket_api.async_register_command(hass, ws_delete_alert)
    websocket_api.async_register_command(hass, ws_list_categories)
    websocket_api.async_register_command(hass, ws_notify_services)
    websocket_api.async_register_command(hass, ws_test_notification)
    websocket_api.async_register_command(hass, ws_validate_template)
    websocket_api.async_register_command(hass, ws_get_translations)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "alertsys/alert/list"})
@websocket_api.async_response
async def ws_list_alerts(hass, connection, msg):
    """List all alert definitions."""
    try:
        manager = hass.data[DOMAIN]["manager"]
        connection.send_result(msg["id"], {
            "alerts": manager.list_alerts(),
            "categories": manager.list_categories(),
            "auto_quit_defaults": AUTO_QUIT_DEFAULTS,
            "notification_defaults": {
                "title": NOTIF_DEFAULT_TITLE,
                "message": NOTIF_DEFAULT_MESSAGE,
                "resolve_message": NOTIF_DEFAULT_RESOLVE_MESSAGE,
                "repeat_interval_sec": NOTIF_DEFAULT_REPEAT_INTERVAL_SEC,
            },
        })
    except Exception:
        _LOGGER.exception("Failed to list alerts")
        connection.send_error(msg["id"], "unknown_error", "Failed to list alerts")


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/alert/create",
    vol.Required("name"): str,
    vol.Optional("level", default="info"): vol.In(VALID_LEVELS),
    vol.Required("condition"): str,
    vol.Optional("auto_quit"): vol.Any(None, bool),
    vol.Optional("category_id"): vol.Any(None, str),
    vol.Optional("category_name"): vol.Any(None, str),
    vol.Optional("notification"): vol.Schema(NOTIFICATION_SCHEMA),
})
@websocket_api.async_response
async def ws_create_alert(hass, connection, msg):
    """Create a new alert."""
    try:
        manager = hass.data[DOMAIN]["manager"]
        result = await manager.async_create_alert({
            "name": msg["name"],
            "level": msg.get("level", "info"),
            "condition": msg["condition"],
            "auto_quit": msg.get("auto_quit"),
            "category_id": msg.get("category_id"),
            "category_name": msg.get("category_name"),
            "notification": msg.get("notification"),
        })
        connection.send_result(msg["id"], result)
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_input", str(exc))
    except Exception:
        _LOGGER.exception("Failed to create alert")
        connection.send_error(msg["id"], "unknown_error", "Failed to create alert")


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/alert/update",
    vol.Required("alert_id"): str,
    vol.Optional("new_alert_id"): str,
    vol.Optional("name"): str,
    vol.Optional("level"): vol.In(VALID_LEVELS),
    vol.Optional("condition"): str,
    vol.Optional("auto_quit"): vol.Any(None, bool),
    vol.Optional("category_id"): vol.Any(None, str),
    vol.Optional("category_name"): vol.Any(None, str),
    vol.Optional("notification"): vol.Schema(NOTIFICATION_SCHEMA),
})
@websocket_api.async_response
async def ws_update_alert(hass, connection, msg):
    """Update an existing alert."""
    try:
        manager = hass.data[DOMAIN]["manager"]
        data = {}
        for key in ("name", "level", "condition", "auto_quit", "category_id", "category_name", "new_alert_id", "notification"):
            if key in msg:
                data[key] = msg[key]
        result = await manager.async_update_alert(msg["alert_id"], data)
        connection.send_result(msg["id"], result)
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_input", str(exc))
    except Exception:
        _LOGGER.exception("Failed to update alert '%s'", msg.get("alert_id"))
        connection.send_error(msg["id"], "unknown_error", "Failed to update alert")


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/alert/delete",
    vol.Required("alert_id"): str,
})
@websocket_api.async_response
async def ws_delete_alert(hass, connection, msg):
    """Delete an alert."""
    try:
        manager = hass.data[DOMAIN]["manager"]
        await manager.async_delete_alert(msg["alert_id"])
        connection.send_result(msg["id"], {"success": True})
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_input", str(exc))
    except Exception:
        _LOGGER.exception("Failed to delete alert '%s'", msg.get("alert_id"))
        connection.send_error(msg["id"], "unknown_error", "Failed to delete alert")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "alertsys/category/list"})
@websocket_api.async_response
async def ws_list_categories(hass, connection, msg):
    """List all categories."""
    try:
        manager = hass.data[DOMAIN]["manager"]
        connection.send_result(msg["id"], {
            "categories": manager.list_categories(),
        })
    except Exception:
        _LOGGER.exception("Failed to list categories")
        connection.send_error(msg["id"], "unknown_error", "Failed to list categories")


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "alertsys/notify_services"})
@websocket_api.async_response
async def ws_notify_services(hass, connection, msg):
    """List available notify services."""
    try:
        services = hass.services.async_services().get("notify", {})
        result = [f"notify.{svc}" for svc in sorted(services.keys())]
        connection.send_result(msg["id"], {"services": result})
    except Exception:
        _LOGGER.exception("Failed to list notify services")
        connection.send_error(msg["id"], "unknown_error", "Failed to list notify services")


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/test_notification",
    vol.Required("targets"): [str],
    vol.Optional("title", default=""): str,
    vol.Optional("message", default="Test notification from AlertSys"): str,
    vol.Optional("data"): vol.Any(None, dict),
    # Context fields for Jinja2 rendering
    vol.Optional("context_name", default="Test Alert"): str,
    vol.Optional("context_level", default="info"): str,
    vol.Optional("context_condition", default=""): str,
    vol.Optional("context_entity_id", default="alertsys.test"): str,
})
@websocket_api.async_response
async def ws_test_notification(hass, connection, msg):
    """Send a test notification with Jinja2 template rendering."""
    try:
        variables = {
            "name": msg.get("context_name", "Test Alert"),
            "level": msg.get("context_level", "info"),
            "condition": msg.get("context_condition", ""),
            "entity_id": msg.get("context_entity_id", "alertsys.test"),
            "alert_id": msg.get("context_entity_id", "alertsys.test").replace("alertsys.", "", 1),
            "count": 1,
            "triggered_at": dt_util.utcnow(),
        }

        def _render(template_str):
            if not template_str:
                return ""
            try:
                tpl = Template(template_str, hass)
                return tpl.async_render(variables)
            except Exception:
                return template_str

        rendered_title = _render(msg.get("title", ""))
        rendered_message = _render(msg.get("message", ""))
        if not rendered_message:
            rendered_message = "Test notification from AlertSys"

        errors = []
        for target in msg["targets"]:
            service_name = target.replace("notify.", "", 1) if target.startswith("notify.") else target
            service_data = {"message": rendered_message}
            if rendered_title:
                service_data["title"] = rendered_title
            if msg.get("data"):
                service_data["data"] = msg["data"]
            try:
                await hass.services.async_call("notify", service_name, service_data)
            except Exception as exc:
                errors.append(f"{target}: {exc}")

        if errors:
            connection.send_error(msg["id"], "notification_failed", "; ".join(errors))
        else:
            connection.send_result(msg["id"], {"success": True})
    except Exception:
        _LOGGER.exception("Failed to send test notification")
        connection.send_error(msg["id"], "unknown_error", "Failed to send test notification")


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/validate_template",
    vol.Required("template"): str,
})
@websocket_api.async_response
async def ws_validate_template(hass, connection, msg):
    """Validate a Jinja2 template syntax."""
    try:
        template_str = msg["template"].strip()
        if not template_str:
            connection.send_result(msg["id"], {"valid": True})
            return
        jinja2.Environment().parse(template_str)
        connection.send_result(msg["id"], {"valid": True})
    except jinja2.TemplateSyntaxError as exc:
        connection.send_result(msg["id"], {
            "valid": False,
            "error": str(exc),
        })
    except Exception:
        _LOGGER.exception("Failed to validate template")
        connection.send_error(msg["id"], "unknown_error", "Failed to validate template")


def _read_json_file(file_path: Path) -> dict:
    """Read and parse JSON file synchronously."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        _LOGGER.error("Failed to read translation file %s: %s", file_path, e)
        return {}


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "alertsys/get_translations",
    vol.Optional("language"): str,
})
@websocket_api.async_response
async def ws_get_translations(hass, connection, msg):
    """Return panel translations for the requested language.
    
    Custom panels should load translations directly from JSON files
    as they are not part of the standard HA translation categories.
    This is the recommended approach for custom frontend components.
    """
    try:
        language = msg.get("language") or hass.config.language
        
        # Get the integration directory
        integration_dir = Path(__file__).parent
        translation_file = integration_dir / "translations" / f"{language}.json"
        
        # Fallback to English if language file not found
        if not translation_file.exists():
            _LOGGER.debug(
                "Translation file not found for '%s', falling back to English",
                language
            )
            language = "en"
            translation_file = integration_dir / "translations" / "en.json"
        
        # Load and parse the translation file in executor (non-blocking I/O)
        if translation_file.exists():
            translations = await hass.async_add_executor_job(
                _read_json_file, translation_file
            )
            
            # Extract panel section
            panel_strings = translations.get("panel", {})
            
            if not panel_strings:
                _LOGGER.warning(
                    "No 'panel' section found in translation file for '%s'",
                    language
                )
        else:
            _LOGGER.error(
                "Translation file not found: %s",
                translation_file
            )
            panel_strings = {}
        
        _LOGGER.debug(
            "Loaded %d panel translation strings for language '%s'",
            len(panel_strings),
            language
        )
        
        connection.send_result(msg["id"], {
            "language": language,
            "translations": panel_strings
        })
    except Exception:
        _LOGGER.exception(
            "Failed to get translations for language '%s'",
            msg.get("language")
        )
        connection.send_error(msg["id"], "unknown_error", "Failed to get translations")
