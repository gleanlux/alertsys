"""Binary sensor platform for AlertSys – alert entities."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import AlertEntity

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up AlertSys alert entities from a config entry."""
    manager = hass.data[DOMAIN]["manager"]
    store = manager.store

    # Provide the add_entities callback to the manager for dynamic CRUD
    manager.set_add_entities_callback(async_add_entities)

    # Create alert entities from stored definitions
    alert_entities = []
    for alert_uid, alert_def in store.alerts.items():
        try:
            await manager.async_create_registry_entry(
                alert_uid, name=alert_def.get("name", "Alert")
            )
        except Exception as exc:
            _LOGGER.warning(
                "Failed to ensure registry entry for %s: %s", alert_uid, exc
            )
        effective_aq = manager.resolve_auto_quit(alert_def)
        entity = AlertEntity(
            hass=hass,
            uid=alert_uid,
            name=alert_def["name"],
            level=alert_def["level"],
            condition_config=alert_def["condition"],
            auto_quit=effective_aq,
            manager=manager,
            notification_config=alert_def.get("notification"),
            description=alert_def.get("description", ""),
        )
        alert_entities.append(entity)

    if alert_entities:
        async_add_entities(alert_entities)