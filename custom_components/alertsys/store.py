"""Persistent storage and runtime manager for AlertSys."""

from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

import jinja2
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .const import (
    AUTO_QUIT_DEFAULTS,
    DEFAULT_CATEGORY_ID,
    DEFAULT_CATEGORY_NAME,
    DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
    VALID_LEVELS,
)

_LOGGER = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    """Convert text to a slug suitable for IDs."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _validate_slug(value: str) -> bool:
    """Check if value is a valid slug."""
    return bool(value) and bool(re.fullmatch(r"[a-z0-9_]+", value))


def _validate_condition(condition: str) -> str | None:
    """Validate condition string. Returns error message or None if valid."""
    if not condition or not condition.strip():
        return "Condition must not be empty"
    condition = condition.strip()
    if "{{" in condition:
        try:
            jinja2.Environment().parse(condition)
        except jinja2.TemplateSyntaxError as exc:
            return f"Invalid Jinja2 template: {exc}"
    return None


class AlertSysStore:
    """Manage persistent storage for alert definitions and categories."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"alerts": {}, "categories": {}}

    async def async_load(self) -> None:
        """Load data from disk."""
        stored = await self._store.async_load()
        if stored:
            self._data = stored
        # Ensure default category always exists
        if DEFAULT_CATEGORY_ID not in self._data.get("categories", {}):
            self._data.setdefault("categories", {})[DEFAULT_CATEGORY_ID] = {
                "name": DEFAULT_CATEGORY_NAME
            }

    async def async_save(self) -> None:
        """Persist data to disk."""
        await self._store.async_save(self._data)

    @property
    def alerts(self) -> dict[str, dict]:
        """Return all alert definitions."""
        return self._data.get("alerts", {})

    @property
    def categories(self) -> dict[str, dict]:
        """Return all categories."""
        return self._data.get("categories", {})

    def get_alert(self, alert_id: str) -> dict | None:
        return self._data["alerts"].get(alert_id)

    def set_alert(self, alert_id: str, alert_data: dict) -> None:
        self._data["alerts"][alert_id] = alert_data

    def remove_alert(self, alert_id: str) -> dict | None:
        return self._data["alerts"].pop(alert_id, None)

    def set_category(self, category_id: str, category_data: dict) -> None:
        self._data["categories"][category_id] = category_data

    def remove_category(self, category_id: str) -> None:
        if category_id != DEFAULT_CATEGORY_ID:
            self._data["categories"].pop(category_id, None)

    def cleanup_empty_categories(self) -> None:
        """Remove categories that have no alerts (except default)."""
        used = {
            a.get("category_id", DEFAULT_CATEGORY_ID)
            for a in self._data["alerts"].values()
        }
        empty = [
            cid
            for cid in list(self._data["categories"])
            if cid != DEFAULT_CATEGORY_ID and cid not in used
        ]
        for cid in empty:
            del self._data["categories"][cid]


class AlertSysManager:
    """Runtime manager: bridges store, entities, and CRUD operations."""

    def __init__(self, hass: HomeAssistant, store: AlertSysStore) -> None:
        self.hass = hass
        self.store = store
        # Runtime entity tracking (populated by entity platform)
        self._alert_entities: dict[str, Any] = {}  # alert_id -> AlertEntity
        self._counter_entities: dict[str, Any] = {}  # level -> CounterEntity
        self._async_add_entities_cb = None  # set by entity platform

    def set_add_entities_callback(self, cb) -> None:
        """Set the async_add_entities callback from the platform setup."""
        self._async_add_entities_cb = cb

    @callback
    def register_alert_entity(self, alert_id: str, entity) -> None:
        """Register a live alert entity."""
        self._alert_entities[alert_id] = entity

    @callback
    def unregister_alert_entity(self, alert_id: str) -> None:
        """Unregister an alert entity."""
        self._alert_entities.pop(alert_id, None)

    @callback
    def register_counter_entity(self, level: str, entity) -> None:
        """Register a live counter entity."""
        self._counter_entities[level] = entity

    def get_alert_entity(self, alert_id: str):
        """Get a live alert entity by alert_id."""
        return self._alert_entities.get(alert_id)

    def get_alert_entity_by_entity_id(self, entity_id: str):
        """Get a live alert entity by full entity_id."""
        for ent in self._alert_entities.values():
            if ent.entity_id == entity_id:
                return ent
        return None

    @property
    def alert_entities(self) -> list:
        """Return list of all live alert entities."""
        return list(self._alert_entities.values())

    def get_counter_entity(self, level: str):
        return self._counter_entities.get(level)

    def resolve_auto_quit(self, alert_data: dict) -> bool:
        """Resolve effective auto_quit for an alert definition."""
        aq = alert_data.get("auto_quit")
        if aq is None:
            return AUTO_QUIT_DEFAULTS.get(alert_data["level"], True)
        return bool(aq)

    async def async_create_alert(self, data: dict) -> dict:
        """Create a new alert. Returns the full alert dict with id."""
        from .entity import AlertEntity  # avoid circular import

        name = data["name"].strip()
        alert_id = data.get("id") or _slugify(name)
        if not _validate_slug(alert_id):
            raise ValueError(f"Invalid alert ID: {alert_id!r}")

        if alert_id in self.store.alerts:
            raise ValueError(f"Alert ID already exists: {alert_id!r}")

        level = data.get("level", "info")
        if level not in VALID_LEVELS:
            raise ValueError(f"Invalid level: {level!r}")

        condition = data.get("condition", "")
        err = _validate_condition(condition)
        if err:
            raise ValueError(err)

        category_id = data.get("category_id") or DEFAULT_CATEGORY_ID
        if category_id not in self.store.categories:
            # Auto-create category
            cat_name = data.get("category_name", category_id)
            self.store.set_category(category_id, {"name": cat_name})

        auto_quit = data.get("auto_quit")  # None, True, or False

        notification = data.get("notification") or {}

        alert_def = {
            "name": name,
            "level": level,
            "condition": condition.strip(),
            "auto_quit": auto_quit,
            "category_id": category_id,
            "notification": notification,
        }
        self.store.set_alert(alert_id, alert_def)
        await self.store.async_save()

        # Create and register entity
        if self._async_add_entities_cb:
            effective_aq = self.resolve_auto_quit(alert_def)
            entity = AlertEntity(
                self.hass, alert_id, name, level, condition.strip(), effective_aq, self,
                notification_config=notification,
            )
            self._async_add_entities_cb([entity])

        return {**alert_def, "id": alert_id}

    async def async_update_alert(self, alert_id: str, data: dict) -> dict:
        """Update an existing alert (remove + recreate entity)."""
        from .entity import AlertEntity

        existing = self.store.get_alert(alert_id)
        if existing is None:
            raise ValueError(f"Alert not found: {alert_id!r}")

        # Handle ID rename
        new_alert_id = data.pop("new_alert_id", None)
        target_id = alert_id
        if new_alert_id and new_alert_id != alert_id:
            if not _validate_slug(new_alert_id):
                raise ValueError(f"Invalid alert ID: {new_alert_id!r}")
            if new_alert_id in self.store.alerts:
                raise ValueError(f"Alert ID already exists: {new_alert_id!r}")
            target_id = new_alert_id

        # Merge fields
        name = data.get("name", existing["name"]).strip()
        level = data.get("level", existing["level"])
        if level not in VALID_LEVELS:
            raise ValueError(f"Invalid level: {level!r}")

        condition = data.get("condition", existing["condition"])
        err = _validate_condition(condition)
        if err:
            raise ValueError(err)

        auto_quit = data.get("auto_quit", existing.get("auto_quit"))

        old_category = existing.get("category_id", DEFAULT_CATEGORY_ID)
        category_id = data.get("category_id", old_category)
        if not category_id:
            category_id = DEFAULT_CATEGORY_ID
        if category_id not in self.store.categories:
            cat_name = data.get("category_name", category_id)
            self.store.set_category(category_id, {"name": cat_name})

        notification = data.get("notification", existing.get("notification", {})) or {}

        alert_def = {
            "name": name,
            "level": level,
            "condition": condition.strip(),
            "auto_quit": auto_quit,
            "category_id": category_id,
            "notification": notification,
        }

        # If ID changed, remove old entry first
        if target_id != alert_id:
            self.store.remove_alert(alert_id)

        self.store.set_alert(target_id, alert_def)
        self.store.cleanup_empty_categories()
        await self.store.async_save()

        # Remove old entity and create new one
        old_entity = self._alert_entities.get(alert_id)
        if old_entity:
            await old_entity.async_remove()
            self.unregister_alert_entity(alert_id)

        if self._async_add_entities_cb:
            effective_aq = self.resolve_auto_quit(alert_def)
            entity = AlertEntity(
                self.hass, target_id, name, level, condition.strip(), effective_aq, self,
                notification_config=notification,
            )
            self._async_add_entities_cb([entity])

        # Update counters
        self._update_all_counters()

        return {**alert_def, "id": target_id}

    async def async_delete_alert(self, alert_id: str) -> None:
        """Delete an alert."""
        existing = self.store.get_alert(alert_id)
        if existing is None:
            raise ValueError(f"Alert not found: {alert_id!r}")

        self.store.remove_alert(alert_id)
        self.store.cleanup_empty_categories()
        await self.store.async_save()

        old_entity = self._alert_entities.get(alert_id)
        if old_entity:
            await old_entity.async_remove()
            self.unregister_alert_entity(alert_id)

        self._update_all_counters()

    @callback
    def _update_all_counters(self) -> None:
        """Signal all counter entities to recalculate."""
        for counter in self._counter_entities.values():
            counter.async_schedule_update_ha_state()

    def list_alerts(self) -> list[dict]:
        """Return all alert definitions with their IDs."""
        result = []
        for aid, adef in self.store.alerts.items():
            result.append({**adef, "id": aid})
        return result

    def list_categories(self) -> list[dict]:
        """Return all categories with their IDs."""
        result = []
        for cid, cdef in self.store.categories.items():
            result.append({**cdef, "id": cid})
        return result
