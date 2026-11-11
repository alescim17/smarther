"""Simple MQTT-prefix onboarding; no vendor credentials or commands in UI."""

from __future__ import annotations

from hashlib import sha256

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.const import CONF_NAME
import voluptuous as vol

from .const import (
    CONF_ENABLE_CONTROLS,
    CONF_TOPIC_PREFIX,
    DEFAULT_ENABLE_CONTROLS,
    DEFAULT_NAME,
    DOMAIN,
)
from .protocol import ProtocolError, validate_prefix


class SmartherMqttConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure one thermostat from its exact bridge topic prefix."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Only validate config locally; runtime telemetry proves connectivity."""
        errors = {}
        if user_input is not None:
            if "mqtt" not in self.hass.config.components:
                errors["base"] = "mqtt_not_ready"
            else:
                try:
                    prefix = validate_prefix(user_input[CONF_TOPIC_PREFIX])
                except ProtocolError:
                    errors[CONF_TOPIC_PREFIX] = "invalid_prefix"
                else:
                    stable_id = sha256(prefix.encode("utf-8")).hexdigest()[:24]
                    await self.async_set_unique_id(stable_id)
                    self._abort_if_unique_id_configured()
                    name = user_input[CONF_NAME].strip()[:80]
                    if name:
                        return self.async_create_entry(
                            title=name,
                            data={CONF_TOPIC_PREFIX: prefix, CONF_NAME: name},
                            options={CONF_ENABLE_CONTROLS: DEFAULT_ENABLE_CONTROLS},
                        )
                    errors[CONF_NAME] = "invalid_name"
        schema = vol.Schema(
            {
                vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                vol.Required(CONF_TOPIC_PREFIX): str,
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "setup_guide_url": "https://github.com/alescim17/smarther/blob/main/docs/FIRST_TIME_SETUP.md",
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Offer explicit, disabled-by-default command enablement."""
        return SmartherMqttOptionsFlow()


class SmartherMqttOptionsFlow(config_entries.OptionsFlow):
    """Write policy can only be changed by an explicit user options action."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_ENABLE_CONTROLS,
                    default=self.config_entry.options.get(
                        CONF_ENABLE_CONTROLS, DEFAULT_ENABLE_CONTROLS
                    ),
                ): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
