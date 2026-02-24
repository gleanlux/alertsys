"""The AlertSys integration."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv


_INTEGRATION_VERSION = json.loads(
    (Path(__file__).parent / "manifest.json").read_text()
).get("version", "0")


from .const import (
    DOMAIN,
    SERVICE_ACK,
    SERVICE_ACK_TOGGLE,
    SERVICE_QUIT,
    SERVICE_UNACK,
)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

from .store import AlertSysManager, AlertSysStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)


PANEL_URL_ROOT = f"/{DOMAIN}_panel"
PANEL_FS_ROOT = str((Path(__file__).resolve().parent / "frontend"))

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the AlertSys domain (no YAML config)."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up AlertSys from a config entry."""

    # --- One-time domain-level registrations (guarded, not unloadable) ---
    if not hass.data[DOMAIN].get("_ws_registered"):
        async_register_websocket_commands(hass)
        hass.data[DOMAIN]["_ws_registered"] = True

    if not hass.data[DOMAIN].get("_static_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    url_path=PANEL_URL_ROOT,
                    path=PANEL_FS_ROOT,
                    cache_headers=False,
                )
            ]
        )
        hass.data[DOMAIN]["_static_registered"] = True

    # --- Entry-bound resources ---

    # Initialize store
    store = AlertSysStore(hass)
    await store.async_load()

    # Initialize manager
    manager = AlertSysManager(hass, store, config_entry=entry)
    hass.data[DOMAIN]["manager"] = manager

    # Forward platforms → binary_sensor.py creates AlertEntity, sensor.py creates CounterEntity
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register services (entry-bound – removed on unload)
    _register_services(hass, manager)

    # Load entrypoint wrapper as an extra JS module.
    # It defines <ha-panel-alertsys>, which the built-in panel renders.
    entry_url = f"{PANEL_URL_ROOT}/entrypoint.js?v={_INTEGRATION_VERSION}"
    frontend.add_extra_js_url(hass, entry_url)
    hass.data[DOMAIN]["panel_entry_url"] = entry_url

    # Register as built-in panel (HACS-style, stays mounted across WS reconnect)
    frontend.async_register_built_in_panel(
        hass,
        component_name=DOMAIN,  # -> <ha-panel-alertsys>
        sidebar_title="Alert Manager",
        sidebar_icon="mdi:alert-box-outline",
        frontend_url_path=DOMAIN,  # -> /alertsys
        require_admin=True,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload AlertSys config entry."""

    # Remove panel
    frontend.async_remove_panel(hass, DOMAIN)

    entry_url = hass.data.get(DOMAIN, {}).get("panel_entry_url")
    if entry_url:
        frontend.remove_extra_js_url(hass, entry_url)

    # Unload platforms (removes AlertEntity + CounterEntity instances)
    await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    # Remove services registered in async_setup_entry
    for service in (SERVICE_QUIT, SERVICE_ACK, SERVICE_UNACK, SERVICE_ACK_TOGGLE):
        hass.services.async_remove(DOMAIN, service)

    # Keep domain-level flags (_ws_registered, _static_registered); drop entry-bound runtime.
    hass.data.get(DOMAIN, {}).pop("manager", None)
    hass.data.get(DOMAIN, {}).pop("panel_entry_url", None)
    return True


@callback
def _register_services(
    hass: HomeAssistant,
    manager: AlertSysManager,
) -> None:
    """Register alertsys services."""

    @callback
    def handle_quit(call: ServiceCall) -> None:
        entity_ids = call.data.get("entity_id")
        alerts = manager.alert_entities

        if entity_ids:
            if isinstance(entity_ids, str):
                entity_ids = [entity_ids]
            targets = [a for a in alerts if a.entity_id in entity_ids]
        else:
            targets = alerts

        for alert in targets:
            alert.quit()

    hass.services.async_register(
        DOMAIN,
        SERVICE_QUIT,
        handle_quit,
        schema=vol.Schema({
            vol.Optional("entity_id"): vol.Any(
                cv.entity_id, vol.All(cv.ensure_list, [cv.entity_id])
            ),
        }),
    )

    def _resolve_alert_targets(entity_ids):
        alerts = manager.alert_entities
        if isinstance(entity_ids, str):
            entity_ids = [entity_ids]
        return [a for a in alerts if a.entity_id in entity_ids]

    @callback
    def handle_ack(call: ServiceCall) -> None:
        for alert in _resolve_alert_targets(call.data["entity_id"]):
            alert.ack()

    hass.services.async_register(
        DOMAIN,
        SERVICE_ACK,
        handle_ack,
        schema=vol.Schema({
            vol.Required("entity_id"): vol.Any(
                cv.entity_id, vol.All(cv.ensure_list, [cv.entity_id])
            ),
        }),
    )

    @callback
    def handle_unack(call: ServiceCall) -> None:
        for alert in _resolve_alert_targets(call.data["entity_id"]):
            alert.unack()

    hass.services.async_register(
        DOMAIN,
        SERVICE_UNACK,
        handle_unack,
        schema=vol.Schema({
            vol.Required("entity_id"): vol.Any(
                cv.entity_id, vol.All(cv.ensure_list, [cv.entity_id])
            ),
        }),
    )
    
    @callback
    def handle_ack_toggle(call: ServiceCall) -> None:
        for alert in _resolve_alert_targets(call.data["entity_id"]):
            alert.ack_toggle()

    hass.services.async_register(
        DOMAIN,
        SERVICE_ACK_TOGGLE,
        handle_ack_toggle,
        schema=vol.Schema({
            vol.Required("entity_id"): vol.Any(
                cv.entity_id, vol.All(cv.ensure_list, [cv.entity_id])
            ),
        }),
    )
