"""The AlertSys integration."""

from __future__ import annotations

import logging
import time
from pathlib import Path

import voluptuous as vol
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_component import EntityComponent

from .const import (
    DOMAIN,
    LEVEL_ERROR,
    LEVEL_INFO,
    LEVEL_WARNING,
    SERVICE_ACK,
    SERVICE_ACK_TOGGLE,
    SERVICE_QUIT,
    SERVICE_UNACK,
)
from .entity import AlertEntity, CounterEntity
from .store import AlertSysManager, AlertSysStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)


PANEL_URL_ROOT = f"/{DOMAIN}_panel"
PANEL_FS_ROOT = str((Path(__file__).resolve().parent / "frontend"))


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the AlertSys domain (no YAML config)."""
    hass.data.setdefault(DOMAIN, {})

    # Domain-level registrations (standard HA pattern): do these once here.
    async_register_websocket_commands(hass)

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=PANEL_URL_ROOT,
                path=PANEL_FS_ROOT,
                cache_headers=False,
            )
        ]
    )

    component = EntityComponent[AlertEntity](_LOGGER, DOMAIN, hass)
    hass.data[DOMAIN]["component"] = component
    _register_services(hass, component)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up AlertSys from a config entry."""
    # Initialize store
    store = AlertSysStore(hass)
    await store.async_load()

    # Initialize manager
    manager = AlertSysManager(hass, store)
    hass.data[DOMAIN]["manager"] = manager

    # Use the domain-level entity component created in async_setup
    component: EntityComponent[AlertEntity] = hass.data[DOMAIN]["component"]

    # Create counter entities first (alerts may trigger counter updates immediately)
    counter_entities = []
    for level in (LEVEL_INFO, LEVEL_WARNING, LEVEL_ERROR):
        counter = CounterEntity(hass, level, manager)
        counter_entities.append(counter)
    await component.async_add_entities(counter_entities)

    # Provide the add_entities callback to the manager for dynamic CRUD
    def add_entities_cb(entities):
        hass.async_create_task(component.async_add_entities(entities))

    manager.set_add_entities_callback(add_entities_cb)

    # Create alert entities from stored definitions
    alert_entities = []
    for alert_id, alert_def in store.alerts.items():
        effective_aq = manager.resolve_auto_quit(alert_def)
        entity = AlertEntity(
            hass=hass,
            object_id=alert_id,
            name=alert_def["name"],
            level=alert_def["level"],
            condition_config=alert_def["condition"],
            auto_quit=effective_aq,
            manager=manager,
            notification_config=alert_def.get("notification"),
        )
        alert_entities.append(entity)
    if alert_entities:
        await component.async_add_entities(alert_entities)

    # Load entrypoint wrapper as an extra JS module.
    # It defines <ha-panel-alertsys>, which the built-in panel renders.
    entry_url = f"{PANEL_URL_ROOT}/entrypoint.js?v={int(time.time())}"
    frontend.add_extra_js_url(hass, entry_url)
    hass.data[DOMAIN]["panel_entry_url"] = entry_url

    # Register as built-in panel (HACS-style, stays mounted across WS reconnect)
    frontend.async_register_built_in_panel(
        hass,
        component_name=DOMAIN,  # -> <ha-panel-alertsys>
        sidebar_title="Alert Manager",
        sidebar_icon="mdi:alert-box-outline",
        frontend_url_path=DOMAIN,  # -> /alertsys
        require_admin=False,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload AlertSys config entry."""

    # Remove panel (ignore if already gone)
    frontend.async_remove_panel(hass, DOMAIN, warn_if_unknown=False)

    entry_url = hass.data.get(DOMAIN, {}).get("panel_entry_url")
    if entry_url:
        frontend.remove_extra_js_url(hass, entry_url)

    component: EntityComponent | None = hass.data.get(DOMAIN, {}).get("component")
    if component:
        for entity in list(component.entities):
            await component.async_remove_entity(entity.entity_id)

    # Keep domain storage; drop entry-bound runtime.
    hass.data.get(DOMAIN, {}).pop("manager", None)
    hass.data.get(DOMAIN, {}).pop("panel_entry_url", None)
    return True


@callback
def _register_services(
    hass: HomeAssistant,
    component: EntityComponent,
) -> None:
    """Register alertsys services."""

    # quit is special: without entity_id it targets all eligible alerts
    @callback
    def handle_quit(call: ServiceCall) -> None:
        entity_ids = call.data.get("entity_id")
        alerts = [e for e in component.entities if isinstance(e, AlertEntity)]

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

    # ack / unack / ack_toggle: explicitly target alert entities (not counters)
    def _resolve_alert_targets(entity_ids):
        alerts = [e for e in component.entities if isinstance(e, AlertEntity)]
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