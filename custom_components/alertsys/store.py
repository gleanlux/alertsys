"""Persistent storage and runtime manager for AlertSys.

This module holds two layers:
- AlertSysStore: persistent config (alert definitions, categories)
- AlertSysManager: runtime bridge (entities, CRUD, entity registry helpers)

Design notes (v2):
- Alerts are keyed by a generated UID (uuid4) stored as the entity unique_id.
- The entity_id is NOT stored in our store; it is managed by the HA entity registry.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.template import Template, is_template_string
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.config_entries import ConfigEntry

from .const import (
    ALERT_ENTITY_DOMAIN,
    ALERT_OBJECT_ID_PREFIX,
    AUTO_QUIT_DEFAULTS,
    DEFAULT_CATEGORY_ID,
    DEFAULT_CATEGORY_NAME,
    DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
    VALID_LEVELS,
)

_LOGGER = logging.getLogger(__name__)


# -----------------------
# ID / validation helpers
# -----------------------

_OBJECT_ID_RE = re.compile(r"^[a-z0-9_]+$")
_ENTITY_ID_RE = re.compile(rf"^{ALERT_ENTITY_DOMAIN}\.{ALERT_OBJECT_ID_PREFIX}[a-z0-9_]+$")



def _slugify(text: str) -> str:
    """Convert text to a slug suitable for object IDs."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _validate_object_id(value: str) -> bool:
    """Check if value is a valid HA-style object_id."""
    return bool(value) and bool(_OBJECT_ID_RE.fullmatch(value))


def _normalize_entity_id(entity_id: str) -> str:
    """Normalize entity_id input."""
    return (entity_id or "").strip().lower()


def _validate_entity_id(entity_id: str) -> bool:
    """Check if entity_id is in official form: alertsys.<object_id>."""
    entity_id = _normalize_entity_id(entity_id)
    return bool(entity_id) and bool(_ENTITY_ID_RE.fullmatch(entity_id))


def _object_id_from_entity_id(entity_id: str) -> str:
    return _normalize_entity_id(entity_id).split(".", 1)[1]


def _validate_condition(condition: str, hass: HomeAssistant | None = None) -> str | None:
    """Validate condition string. Returns an error message or None if valid.

    If the condition contains a template, validate it using Home Assistant's
    Template engine (same environment/filters as runtime), not a plain Jinja2
    parser. This avoids false positives/negatives.
    """
    if not condition or not condition.strip():
        return "Condition must not be empty"

    condition = condition.strip()

    if is_template_string(condition):
        if hass is None:
            return "Template validation requires Home Assistant instance"
        try:
            tpl = Template(condition, hass)
            tpl.ensure_valid()
        except TemplateError as exc:
            return f"Invalid template: {exc}"
        except Exception as exc:  # safety net
            _LOGGER.debug("Failed to validate template condition: %s", exc)
            return "Invalid template"

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
        """Return all alert definitions (keyed by uid)."""
        return self._data.get("alerts", {})

    @property
    def categories(self) -> dict[str, dict]:
        """Return all categories."""
        return self._data.get("categories", {})

    def get_alert(self, alert_uid: str) -> dict | None:
        return self._data["alerts"].get(alert_uid)

    def set_alert(self, alert_uid: str, alert_data: dict) -> None:
        self._data["alerts"][alert_uid] = alert_data

    def remove_alert(self, alert_uid: str) -> dict | None:
        return self._data["alerts"].pop(alert_uid, None)

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

    def __init__(
        self,
        hass: HomeAssistant,
        store: AlertSysStore,
        *,
        config_entry: ConfigEntry,
    ) -> None:
        self.hass = hass
        self.store = store
        self._config_entry = config_entry


        # Runtime entity tracking (populated by entity platform)
        self._alert_entities: dict[str, Any] = {}  # uid -> AlertEntity
        self._counter_entities: dict[str, Any] = {}  # level -> CounterEntity
        self._async_add_entities_cb = None  # set by entity platform

    def set_add_entities_callback(self, cb) -> None:
        """Set the async_add_entities callback from the platform setup."""
        self._async_add_entities_cb = cb

    @callback
    def register_alert_entity(self, alert_uid: str, entity) -> None:
        """Register a live alert entity."""
        self._alert_entities[alert_uid] = entity

    @callback
    def unregister_alert_entity(self, alert_uid: str) -> None:
        """Unregister an alert entity."""
        self._alert_entities.pop(alert_uid, None)

    @callback
    def register_counter_entity(self, level: str, entity) -> None:
        """Register a live counter entity."""
        self._counter_entities[level] = entity

    def get_alert_entity(self, alert_uid: str):
        """Get a live alert entity by UID."""
        return self._alert_entities.get(alert_uid)

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

    # -----------------------
    # Entity registry helpers
    # -----------------------

    def _registry(self) -> er.EntityRegistry:
        return er.async_get(self.hass)

    async def async_get_entity_id(self, alert_uid: str) -> str | None:
        """Get current entity_id for a UID from the entity registry."""
        return self._registry().async_get_entity_id(ALERT_ENTITY_DOMAIN, DOMAIN, alert_uid)

    async def async_entity_id_available(self, entity_id: str, exclude_uid: str | None = None) -> bool:
        """Check entity_id availability in the entity registry."""
        entity_id = _normalize_entity_id(entity_id)
        entry = self._registry().async_get(entity_id)
        if entry is None:
            return True
        if exclude_uid and entry.domain == ALERT_ENTITY_DOMAIN and entry.platform == DOMAIN and entry.unique_id == exclude_uid:
            return True
        return False

    async def async_suggest_entity_id(self, name: str, exclude_uid: str | None = None) -> str:
        """Suggest a free entity_id for a given name (auto numbering on conflicts)."""
        base = _slugify(name or "") or "alert"
        if not _validate_object_id(base):
            base = "alert"

        candidate = f"{ALERT_OBJECT_ID_PREFIX}{base}"
        suffix = 1
        while True:
            entity_id = f"{ALERT_ENTITY_DOMAIN}.{candidate}"
            if await self.async_entity_id_available(entity_id, exclude_uid=exclude_uid):
                return entity_id
            suffix += 1
            candidate = f"{ALERT_OBJECT_ID_PREFIX}{base}_{suffix}"

    async def async_create_registry_entry(self, alert_uid: str, name: str, entity_id: str | None = None, *, strict: bool = False) -> str:
        """Ensure registry entry exists for UID, optionally targeting a specific entity_id."""
        reg = self._registry()

        current = reg.async_get_entity_id(ALERT_ENTITY_DOMAIN, DOMAIN, alert_uid)
        if current and entity_id is None:
            return current

        if entity_id is not None:
            entity_id = _normalize_entity_id(entity_id)
            if not _validate_entity_id(entity_id):
                raise ValueError("Invalid entity_id format")
            if not await self.async_entity_id_available(entity_id, exclude_uid=alert_uid):
                raise ValueError("Entity ID already exists")
            object_id = _object_id_from_entity_id(entity_id)
        else:
            entity_id = await self.async_suggest_entity_id(name, exclude_uid=alert_uid)
            object_id = _object_id_from_entity_id(entity_id)

        entry = reg.async_get_or_create(
            domain=ALERT_ENTITY_DOMAIN,
            platform=DOMAIN,
            unique_id=alert_uid,
            config_entry=self._config_entry,
            suggested_object_id=object_id,
            original_name=name,
        )

        # If user requested a specific entity_id, enforce it strictly.
        if strict and entity_id and entry.entity_id != entity_id:
            raise ValueError("Entity ID could not be reserved")

        return entry.entity_id

    async def async_rename_entity_id(self, alert_uid: str, new_entity_id: str) -> str:
        """Rename the entity_id for a UID via the entity registry."""
        new_entity_id = _normalize_entity_id(new_entity_id)
        if not _validate_entity_id(new_entity_id):
            raise ValueError("Invalid entity_id format")

        reg = self._registry()
        current = reg.async_get_entity_id(ALERT_ENTITY_DOMAIN, DOMAIN, alert_uid)
        if current is None:
            # No entry yet; create it
            return await self.async_create_registry_entry(alert_uid, name="Alert", entity_id=new_entity_id, strict=True)

        if current == new_entity_id:
            return current

        if not await self.async_entity_id_available(new_entity_id, exclude_uid=alert_uid):
            raise ValueError("Entity ID already exists")

        reg.async_update_entity(current, new_entity_id=new_entity_id)
        return new_entity_id

    # -------------
    # CRUD operations
    # -------------

    async def async_create_alert(self, data: dict) -> dict:
        """Create a new alert. Returns the full alert dict with uid + entity_id."""
        from .entity import AlertEntity  # avoid circular import

        name = data["name"].strip()
        if not name:
            raise ValueError("Name must not be empty")

        level = data.get("level", "info")
        if level not in VALID_LEVELS:
            raise ValueError(f"Invalid level: {level!r}")

        condition = data.get("condition", "")
        err = _validate_condition(condition, self.hass)
        if err:
            raise ValueError(err)

        category_id = data.get("category_id") or DEFAULT_CATEGORY_ID
        if category_id not in self.store.categories:
            cat_name = data.get("category_name", category_id)
            self.store.set_category(category_id, {"name": cat_name})

        auto_quit = data.get("auto_quit")  # None, True, or False
        notification = data.get("notification") or {}

        description = (data.get("description") or "").strip()
        if len(description) > 255:
            raise ValueError("Description too long")

        alert_uid = str(uuid.uuid4())

        # Reserve/create entity registry entry
        requested_entity_id = data.get("entity_id")
        entity_id = await self.async_create_registry_entry(alert_uid, name=name, entity_id=requested_entity_id, strict=bool(requested_entity_id))

        alert_def = {
            "name": name,
            "level": level,
            "condition": condition.strip(),
            "auto_quit": auto_quit,
            "category_id": category_id,
            "notification": notification,
            "description": description,
        }
        self.store.set_alert(alert_uid, alert_def)
        await self.store.async_save()

        # Create and register entity
        if self._async_add_entities_cb:
            effective_aq = self.resolve_auto_quit(alert_def)
            entity = AlertEntity(
                hass=self.hass,
                uid=alert_uid,
                name=name,
                level=level,
                condition_config=condition.strip(),
                auto_quit=effective_aq,
                manager=self,
                notification_config=notification,
                description=description,
            )
            self._async_add_entities_cb([entity])

        return {**alert_def, "id": alert_uid, "entity_id": entity_id}

    async def async_update_alert(self, alert_uid: str, data: dict) -> dict:
        """Update an existing alert."""
        from .entity import AlertEntity

        existing = self.store.get_alert(alert_uid)
        if existing is None:
            raise ValueError(f"Alert not found: {alert_uid!r}")

        # Merge fields
        name = data.get("name", existing["name"]).strip()
        if not name:
            raise ValueError("Name must not be empty")

        level = data.get("level", existing["level"])
        if level not in VALID_LEVELS:
            raise ValueError(f"Invalid level: {level!r}")

        condition = data.get("condition", existing["condition"])
        err = _validate_condition(condition, self.hass)
        if err:
            raise ValueError(err)

        auto_quit = data.get("auto_quit", existing.get("auto_quit"))

        old_category = existing.get("category_id", DEFAULT_CATEGORY_ID)
        category_id = data.get("category_id", old_category) or DEFAULT_CATEGORY_ID
        if category_id not in self.store.categories:
            cat_name = data.get("category_name", category_id)
            self.store.set_category(category_id, {"name": cat_name})

        notification = data.get("notification", existing.get("notification", {})) or {}

        description = (data.get("description", existing.get("description", "")) or "").strip()
        if len(description) > 255:
            raise ValueError("Description too long")

        # Optionally rename entity_id
        if "entity_id" in data and data.get("entity_id") is not None:
            await self.async_rename_entity_id(alert_uid, data["entity_id"])

        alert_def = {
            "name": name,
            "level": level,
            "condition": condition.strip(),
            "auto_quit": auto_quit,
            "category_id": category_id,
            "notification": notification,
            "description": description,
        }

        self.store.set_alert(alert_uid, alert_def)
        self.store.cleanup_empty_categories()
        await self.store.async_save()

        # Recreate entity on update (simple and robust).
        # In-place update would preserve _active/_ack state across edits,
        # but the added complexity is not justified: alert edits are rare,
        # intentional admin actions, not triggered during normal operation.
        old_entity = self._alert_entities.get(alert_uid)
        if old_entity:
            await old_entity.async_remove()
            self.unregister_alert_entity(alert_uid)

        if self._async_add_entities_cb:
            effective_aq = self.resolve_auto_quit(alert_def)
            entity = AlertEntity(
                hass=self.hass,
                uid=alert_uid,
                name=name,
                level=level,
                condition_config=condition.strip(),
                auto_quit=effective_aq,
                manager=self,
                notification_config=notification,
                description=description,
            )
            self._async_add_entities_cb([entity])

        self._update_all_counters()

        entity_id = await self.async_get_entity_id(alert_uid)
        return {**alert_def, "id": alert_uid, "entity_id": entity_id}

    async def async_delete_alert(self, alert_uid: str) -> None:
        """Delete an alert."""
        existing = self.store.get_alert(alert_uid)
        if existing is None:
            raise ValueError(f"Alert not found: {alert_uid!r}")

        self.store.remove_alert(alert_uid)
        self.store.cleanup_empty_categories()
        await self.store.async_save()

        old_entity = self._alert_entities.get(alert_uid)
        if old_entity:
            await old_entity.async_remove()
            self.unregister_alert_entity(alert_uid)

        # Remove entity registry entry (free up entity_id)
        reg = self._registry()
        entity_id = reg.async_get_entity_id(ALERT_ENTITY_DOMAIN, DOMAIN, alert_uid)
        if entity_id:
            reg.async_remove(entity_id)

        self._update_all_counters()

    @callback
    def _update_all_counters(self) -> None:
        """Signal all counter entities to recalculate."""
        for counter in self._counter_entities.values():
            counter.async_schedule_update_ha_state()

    def list_alerts(self) -> list[dict]:
        """Return all alert definitions with their UID + entity_id."""
        reg = self._registry()
        result: list[dict] = []
        for uid, adef in self.store.alerts.items():
            entity_id = reg.async_get_entity_id(ALERT_ENTITY_DOMAIN, DOMAIN, uid)
            result.append({**adef, "id": uid, "entity_id": entity_id})
        return result

    def list_categories(self) -> list[dict]:
        """Return all categories with their IDs."""
        return [{**cdef, "id": cid} for cid, cdef in self.store.categories.items()]
