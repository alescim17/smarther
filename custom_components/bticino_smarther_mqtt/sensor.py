"""Diagnostic and measurement sensors for one Smarther device."""

from datetime import datetime
from zoneinfo import ZoneInfo

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import EntityCategory, PERCENTAGE
from .entity import SmartherMqttEntity


SENSORS = {
    "humidity": "Humidity",
    "load": "Heating state",
    "mode": "Vendor mode",
    "program": "Active program",
    "boost_end": "Boost end",
    "last_message": "Last MQTT message",
}


async def async_setup_entry(hass, entry, async_add_entities):
    hub = entry.runtime_data
    async_add_entities([SmartherSensor(hub, key, name) for key, name in SENSORS.items()])


class SmartherSensor(SmartherMqttEntity, SensorEntity):
    def __init__(self, hub, key, name):
        super().__init__(hub, key, name)
        self.key = key
        if key == "humidity":
            self._attr_device_class = SensorDeviceClass.HUMIDITY
            self._attr_native_unit_of_measurement = PERCENTAGE
            self._attr_state_class = SensorStateClass.MEASUREMENT
        elif key in ("boost_end", "last_message"):
            self._attr_device_class = SensorDeviceClass.TIMESTAMP
        if key in ("load", "mode", "last_message"):
            self._attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self):
        hub = self.hub
        state = hub.state
        if self.key == "humidity":
            return state.humidity_percent
        if self.key == "load":
            return state.load_state.lower() if state.load_state else None
        if self.key == "mode":
            return state.mode.lower() if state.mode else None
        if self.key == "program":
            if state.program_number is None:
                return None
            if state.program_number == 0:
                return "Default"
            return hub.programs.get(state.program_number, f"Program {state.program_number}")
        if self.key == "boost_end":
            if state.mode != "BOOST" or not state.boost_end:
                return None
            try:
                parsed = datetime.fromisoformat(state.boost_end)
                if parsed.tzinfo is None:
                    return parsed.replace(tzinfo=ZoneInfo(hub.hass.config.time_zone))
                return parsed
            except ValueError:
                return None
        if self.key == "last_message":
            return hub.last_received
        return None
