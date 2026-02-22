from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, LEVEL_ERROR, LEVEL_INFO, LEVEL_WARNING
from .entity import CounterEntity

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    manager = hass.data[DOMAIN]["manager"]

    async_add_entities(
        [
            CounterEntity(hass, LEVEL_INFO, manager),
            CounterEntity(hass, LEVEL_WARNING, manager),
            CounterEntity(hass, LEVEL_ERROR, manager),
        ]
    )