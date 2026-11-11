"""Native Smarther thermostat with command sending gated in the hub."""

from homeassistant.components.climate import (
    ATTR_HVAC_MODE,
    ClimateEntity,
    ClimateEntityFeature,
    HVACAction,
    HVACMode,
)
from homeassistant.const import ATTR_TEMPERATURE, UnitOfTemperature
from homeassistant.exceptions import HomeAssistantError

from .const import MAX_CONTROL_AGE_SECONDS
from .entity import SmartherMqttEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([SmartherThermostat(entry.runtime_data)])


class SmartherThermostat(SmartherMqttEntity, ClimateEntity):
    """Legacy PROTECTION maps to OFF, which does not cut physical power."""

    _attr_hvac_modes = [HVACMode.OFF, HVACMode.HEAT, HVACMode.AUTO]
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.TURN_OFF
        | ClimateEntityFeature.TURN_ON
    )
    _attr_native_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_target_temperature_step = 0.1
    _attr_min_temp = 8
    _attr_max_temp = 30
    _attr_precision = 0.1

    def __init__(self, hub):
        super().__init__(hub, "thermostat", None)

    @property
    def hvac_mode(self):
        mode = self.hub.state.mode
        return {
            "PROTECTION": HVACMode.OFF,
            "MANUAL": HVACMode.HEAT,
            "BOOST": HVACMode.HEAT,
            "AUTOMATIC": HVACMode.AUTO,
        }.get(mode)

    @property
    def hvac_action(self):
        if not self.hub.has_state:
            return None
        if self.hub.state.mode == "PROTECTION":
            return HVACAction.OFF
        if self.hub.state.load_state == "ACTIVE":
            return HVACAction.HEATING
        if self.hub.state.load_state == "INACTIVE":
            return HVACAction.IDLE
        return None

    @property
    def native_current_temperature(self):
        return self.hub.state.ambient_c

    @property
    def native_target_temperature(self):
        return self.hub.state.setpoint_c

    @property
    def extra_state_attributes(self):
        return {
            "source": "bticino_mqtt_legacy_bridge",
            "vendor_mode": self.hub.state.mode,
            "remote_bridge_verified": False,
            "controls_enabled": not self.hub.read_only,
            "last_live_message": (
                self.hub.last_live.isoformat() if self.hub.last_live else None
            ),
            "last_message_retained": self.hub.last_retained,
            "control_max_age_seconds": MAX_CONTROL_AGE_SECONDS,
        }

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        if hvac_mode not in self.hvac_modes:
            raise HomeAssistantError("Unsupported Smarther HVAC mode")
        await self.hub.async_set_mode(hvac_mode.value)

    async def async_set_temperature(self, **kwargs) -> None:
        if ATTR_HVAC_MODE in kwargs:
            raise HomeAssistantError("Change HVAC mode and temperature separately")
        value = kwargs.get(ATTR_TEMPERATURE)
        if value is None:
            raise HomeAssistantError("Target temperature missing")
        await self.hub.async_set_temperature(float(value))

    async def async_turn_on(self) -> None:
        await self.hub.async_set_mode("heat")

    async def async_turn_off(self) -> None:
        await self.hub.async_set_mode("off")

