"""Config flow for AlertSys integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN


class AlertSysConfigFlow(ConfigFlow, domain=DOMAIN):
    """Minimal config flow – just enables the integration."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle a flow initialized by the user."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="AlertSys", data={})

        return self.async_show_form(step_id="user")
