"""Entity classes for the AlertSys integration."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.entity import EntityCategory
from homeassistant.const import STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import (
    TrackTemplate,
    async_track_state_change_event,
    async_track_template_result,
    async_track_time_interval,
)
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.template import Template, result_as_boolean, is_template_string
from homeassistant.util import dt as dt_util

from .const import (
    ALERT_ENTITY_DOMAIN,
    ATTR_ACK,
    ATTR_CONDITION,
    ATTR_LEVEL,
    ATTR_AUTO_QUIT,
    ATTR_DESCRIPTION,
    COUNTER_ENTITY_IDS,
    DOMAIN,
    NOTIF_DEFAULT_TITLE,
    NOTIF_DEFAULT_MESSAGE,
    NOTIF_DEFAULT_RESOLVE_MESSAGE,
)

if TYPE_CHECKING:
    from .store import AlertSysManager

_LOGGER = logging.getLogger(__name__)


class AlertEntity(BinarySensorEntity, RestoreEntity):
    """Represents a single alert in the alertsys domain."""

    _attr_should_poll = False

    def __init__(
        self,
        hass: HomeAssistant,
        uid: str,
        name: str,
        level: str,
        condition_config: str,
        auto_quit: bool,
        manager: AlertSysManager,
        notification_config: dict | None = None,
        description: str = "",
    ) -> None:
        self.hass = hass
        self._uid = uid
        self._attr_name = name
        self._level = level
        self._condition_config = condition_config
        self._auto_quit = auto_quit
        self._manager = manager
        self._description = description or ""

        # State
        self._active = False
        self._condition_met = False
        self._ack = False

        # Determine condition type
        self._is_template = is_template_string(condition_config)
        self._template: Template | None = None
        self._tracked_entity_id: str | None = None
        self._track_template_info = None
        self._unsub_entity_tracker = None
         # Track last template error to avoid log spam
        self._last_template_error: str | None = None


        if self._is_template:
            self._template = Template(condition_config, hass)
        else:
            self._tracked_entity_id = condition_config

        # Notification
        self._notification_config = notification_config or {}
        self._notif_count = 0
        self._notif_timer_unsub = None
        self._triggered_at = None

    @property
    def unique_id(self) -> str:
        # Stable unique_id is the UID stored in our store
        return self._uid

    @property
    def is_on(self) -> bool:
        return self._active

    @property
    def icon(self) -> str:
        icons = {
            "info": "mdi:information-outline",
            "warning": "mdi:alert-outline",
            "error": "mdi:alert-circle-outline",
        }
        return icons.get(self._level, "mdi:alert-circle-outline")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            ATTR_CONDITION: self._condition_met,
            ATTR_ACK: self._ack,
            ATTR_LEVEL: self._level,
            ATTR_AUTO_QUIT: self._auto_quit,
            ATTR_DESCRIPTION: self._description,
        }

    @property
    def level(self) -> str:
        return self._level

    @property
    def is_active(self) -> bool:
        return self._active

    @property
    def condition_met(self) -> bool:
        return self._condition_met

    @property
    def is_acked(self) -> bool:
        return self._ack

    async def async_added_to_hass(self) -> None:
        """Start tracking condition when entity is added."""
        # Register with manager
        self._manager.register_alert_entity(self._uid, self)

        # Restore only ack from previous state
        restored_ack = False
        last_state = await self.async_get_last_state()
        if last_state is not None:
            restored_ack = last_state.attributes.get(ATTR_ACK, False)

        # Set up condition tracking
        if self._is_template:
            self._setup_template_tracking()
        else:
            self._setup_entity_tracking()

        # Re-apply restored ack if alert became active
        if self._active and restored_ack:
            self._ack = True
            self.async_write_ha_state()

    def _setup_template_tracking(self) -> None:
        """Track a template condition."""
        track = TrackTemplate(self._template, None, None)
        # Prevent Home Assistant from writing template preview/config errors
        # to the system log on every render (common while editing).
        def _noop_log_fn(_level: int, _message: str) -> None:
            return

        @callback
        def _template_result_changed(event, updates):
            track_result = updates.pop()
            result = track_result.result
            if isinstance(result, Exception):
                err = str(result)
                # Log at debug, and only when the error changes.
                if err != self._last_template_error:
                    _LOGGER.debug(
                        "Template error for %s: %s",
                        self.entity_id,
                        err,
                    )
                    self._last_template_error = err
                return
            # Clear error state once template renders again
            if self._last_template_error is not None:
                self._last_template_error = None
            try:
                new_condition = result_as_boolean(result)
            except ValueError:
                _LOGGER.error(
                    "Template result for %s is not boolean: %s",
                    self.entity_id,
                    result,
                )
                return
            self._update_condition(new_condition)

        self._track_template_info = async_track_template_result(
            self.hass,
            [track],
            _template_result_changed,
            log_fn=_noop_log_fn,
        )
        self._track_template_info.async_refresh()

    def _setup_entity_tracking(self) -> None:
        """Track a boolean entity condition."""
        current_state = self.hass.states.get(self._tracked_entity_id)
        if current_state and current_state.state not in (
            STATE_UNKNOWN,
            "unavailable",
        ):
            self._update_condition(
                current_state.state.lower() in ("on", "true", "1")
            )

        @callback
        def _entity_state_changed(event):
            new_state = event.data.get("new_state")
            if new_state is None:
                return
            new_condition = new_state.state.lower() in ("on", "true", "1")
            self._update_condition(new_condition)

        self._unsub_entity_tracker = async_track_state_change_event(
            self.hass,
            [self._tracked_entity_id],
            _entity_state_changed,
        )

    @callback
    def _update_condition(self, new_condition: bool) -> None:
        """Handle condition state change and apply lifecycle rules."""
        old_condition = self._condition_met
        self._condition_met = new_condition

        if new_condition and not self._active:
            # FRESH ACTIVATION
            self._active = True
            self._ack = False
            self._triggered_at = dt_util.utcnow()
            self.async_write_ha_state()
            self._update_counters()
            self._start_notification_cycle()

        elif not new_condition and old_condition and self._active:
            # CONDITION CLEARED (True -> False)
            self._stop_notification_timer()
            self._send_resolve_if_needed()
            self._notif_count = 0
            if self._auto_quit:
                self._active = False
                self._ack = False
                self._triggered_at = None
                self.async_write_ha_state()
                self._update_counters()
            else:
                self.async_write_ha_state()

        elif new_condition and not old_condition and self._active:
            # CONDITION RE-TRIGGERED (alert active, condition returned True)
            self._triggered_at = dt_util.utcnow()
            self._start_notification_cycle()
            self.async_write_ha_state()

        elif new_condition != old_condition:
            self.async_write_ha_state()

    def quit(self) -> bool:
        """Quit (reset) the alert. Returns True if successful."""
        if not self._active:
            return False
        if self._condition_met:
            return False
        self._active = False
        self._ack = False
        self._triggered_at = None
        self.async_write_ha_state()
        self._update_counters()
        return True

    def ack(self) -> bool:
        """Acknowledge the alert. Returns True if successful."""
        if not self._active:
            return False
        self._ack = True
        self._stop_notification_timer()
        self.async_write_ha_state()
        return True

    def unack(self) -> bool:
        """Remove acknowledgement. Returns True if successful."""
        if not self._active:
            return False
        self._ack = False
        # If condition still true, resume notification timer (keep count)
        if self._condition_met:
            self._continue_notification_cycle()
        self.async_write_ha_state()
        return True

    def ack_toggle(self) -> bool:
        """Toggle acknowledgement state. Returns True if successful."""
        if not self._active:
            return False
        if self._ack:
            return self.unack()
        return self.ack()

    # ------------------------------------------------------------------
    # Notification engine
    # ------------------------------------------------------------------

    @callback
    def _start_notification_cycle(self) -> None:
        """Start a fresh notification cycle (reset count, send first, start timer)."""
        nc = self._notification_config
        if not nc.get("enabled") or not nc.get("targets"):
            return

        self._stop_notification_timer()
        self._notif_count = 0

        # Send first notification immediately
        self.hass.async_create_task(self._async_send_notification())

        # Start repeat timer only if repeat_count > 0
        repeat_count = nc.get("repeat_count", 0)
        if repeat_count > 0:
            interval = nc.get("repeat_interval_sec", 60)
            self._notif_timer_unsub = async_track_time_interval(
                self.hass,
                self._notif_timer_tick,
                timedelta(seconds=interval),
            )

    @callback
    def _continue_notification_cycle(self) -> None:
        """Resume notification cycle after unack (preserve count)."""
        nc = self._notification_config
        if not nc.get("enabled") or not nc.get("targets"):
            return

        self._stop_notification_timer()

        # Stop if already reached total sends (1 initial + repeat_count)
        repeat_count = nc.get("repeat_count", 0)
        max_total = 1 + repeat_count
        if self._notif_count >= max_total:
            return

        # Send one immediately on resume
        self.hass.async_create_task(self._async_send_notification())

        # Resume repeat timer only if repeat_count > 0 and still remaining
        if repeat_count > 0:
            interval = nc.get("repeat_interval_sec", 60)
            self._notif_timer_unsub = async_track_time_interval(
                self.hass,
                self._notif_timer_tick,
                timedelta(seconds=interval),
            )

    @callback
    def _stop_notification_timer(self) -> None:
        """Cancel the repeat timer."""
        if self._notif_timer_unsub:
            self._notif_timer_unsub()
            self._notif_timer_unsub = None

    @callback
    def _notif_timer_tick(self, _now) -> None:
        """Handle repeat timer tick."""
        nc = self._notification_config
        if not nc.get("enabled"):
            self._stop_notification_timer()
            return

        # Stop if condition no longer met or acked
        if not self._condition_met or self._ack:
            self._stop_notification_timer()
            return

        # Stop if repeat_count reached (1 initial + repeat_count)
        repeat_count = nc.get("repeat_count", 0)
        if self._notif_count >= 1 + repeat_count:
            self._stop_notification_timer()
            return

        self.hass.async_create_task(self._async_send_notification())

    async def _async_send_notification(self) -> None:
        """Send a notification to all configured targets."""
        nc = self._notification_config
        if not nc.get("enabled") or not nc.get("targets"):
            return

        # Check repeat_count cap before sending (1 initial + repeat_count)
        repeat_count = nc.get("repeat_count", 0)
        if self._notif_count >= 1 + repeat_count:
            return

        title = self._render_notification_template(nc.get("title", ""))
        if not title:
            title = self._render_notification_template(NOTIF_DEFAULT_TITLE)
        message = self._render_notification_template(nc.get("message", ""))
        if not message:
            message = self._render_notification_template(NOTIF_DEFAULT_MESSAGE)

        for target in nc["targets"]:
            service_name = target.replace("notify.", "", 1) if target.startswith("notify.") else target
            service_data = {"message": message}
            if title:
                service_data["title"] = title
            data = nc.get("data")
            if data:
                service_data["data"] = data
            if not self.hass.services.has_service("notify", service_name):
                continue

            try:
                await self.hass.services.async_call(
                    "notify", service_name, service_data
                )
            except Exception:
                _LOGGER.exception(
                    "Failed to send notification for %s via notify.%s",
                    self.entity_id,
                    service_name,
                )

        self._notif_count += 1

    @callback
    def _send_resolve_if_needed(self) -> None:
        """Schedule resolve notification if configured."""
        nc = self._notification_config
        if nc.get("enabled") and nc.get("send_resolve") and nc.get("targets"):
            self.hass.async_create_task(self._async_send_resolve_notification())

    async def _async_send_resolve_notification(self) -> None:
        """Send resolve notification to all configured targets."""
        nc = self._notification_config

        title = self._render_notification_template(nc.get("resolve_title", ""))
        if not title:
            title = self._render_notification_template(NOTIF_DEFAULT_TITLE)
        
        message = self._render_notification_template(nc.get("resolve_message", ""))
        if not message:
            message = self._render_notification_template(NOTIF_DEFAULT_RESOLVE_MESSAGE)

        resolve_data = nc.get("resolve_data")

        for target in nc.get("targets", []):
            service_name = target.replace("notify.", "", 1) if target.startswith("notify.") else target
            service_data = {"message": message}
            if title:
                service_data["title"] = title
            if resolve_data:
                service_data["data"] = resolve_data

            try:
                await self.hass.services.async_call(
                    "notify", service_name, service_data
                )
            except Exception:
                _LOGGER.exception(
                    "Failed to send resolve notification for %s via notify.%s",
                    self.entity_id,
                    service_name,
                )

    def _render_notification_template(self, template_str: str) -> str:
        """Render a Jinja2 template with alert context variables."""
        if not template_str:
            return ""
        try:
            tpl = Template(template_str, self.hass)
            # Keep 'alert_id' as the object_id part for backward compatibility
            alert_id = ""
            if self.entity_id and self.entity_id.startswith(f"{ALERT_ENTITY_DOMAIN}."):
                alert_id = self.entity_id.replace(f"{ALERT_ENTITY_DOMAIN}.", "", 1)
            variables = {
                "name": self._attr_name,
                "level": self._level,
                "condition": self._condition_config,
                "entity_id": self.entity_id,
                "alert_id": alert_id,
                "alert_uid": self._uid,
                "count": self._notif_count + 1,
                "triggered_at": self._triggered_at,
            }
            return tpl.async_render(variables)
        except Exception:
            _LOGGER.exception(
                "Failed to render notification template for %s",
                self.entity_id,
            )
            return template_str

    # ------------------------------------------------------------------

    @callback
    def _update_counters(self) -> None:
        """Signal counter entities to update."""
        counter = self._manager.get_counter_entity(self._level)
        if counter:
            counter.async_schedule_update_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        """Clean up trackers and unregister from manager."""
        self._stop_notification_timer()
        self._manager.unregister_alert_entity(self._uid)
        if self._track_template_info:
            self._track_template_info.async_remove()
        if self._unsub_entity_tracker:
            self._unsub_entity_tracker()


class CounterEntity(SensorEntity):
    """Counts active alerts per level."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_state_class = None
    _attr_should_poll = False

    def __init__(
        self,
        hass: HomeAssistant,
        level: str,
        manager: AlertSysManager,
    ) -> None:
        self.hass = hass
        self._level = level
        self._manager = manager
        self._object_id = COUNTER_ENTITY_IDS[level]

    @property
    def unique_id(self) -> str:
        return f"{DOMAIN}_counter_{self._object_id}"

    @property
    def name(self) -> str:
        return f"AlertSys {self._level.title()} Count"

    @property
    def native_value(self) -> int:
        return sum(
            1
            for a in self._manager.alert_entities
            if a.level == self._level and a.is_active
        )

    @property
    def icon(self) -> str:
        icons = {
            "info": "mdi:information-outline",
            "warning": "mdi:alert-outline",
            "error": "mdi:alert-circle-outline",
        }
        return icons.get(self._level, "mdi:counter")

    async def async_added_to_hass(self) -> None:
        """Register with manager."""
        self._manager.register_counter_entity(self._level, self)
    
    async def async_will_remove_from_hass(self) -> None:
        """Unregister from manager to prevent stale references after reload."""
        self._manager._counter_entities.pop(self._level, None)
