"""Program selection; never optimistic and disabled in default read-only setup."""

from homeassistant.components.select import SelectEntity
from homeassistant.exceptions import HomeAssistantError

from .entity import SmartherMqttEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([SmartherProgramSelect(entry.runtime_data)])


class SmartherProgramSelect(SmartherMqttEntity, SelectEntity):
    """Use numeric IDs as identity even when vendor names are duplicated."""

    def __init__(self, hub):
        super().__init__(hub, "program_select", "Program")

    @property
    def options(self) -> list[str]:
        return ["Default", *[
            f"Program {index}: {name}"
            for index, name in sorted(self.hub.programs.items())
        ]]

    @property
    def current_option(self) -> str | None:
        num = self.hub.state.program_number
        if num == 0:
            return "Default"
        if num in self.hub.programs:
            return f"Program {num}: {self.hub.programs[num]}"
        return None

    async def async_select_option(self, option: str) -> None:
        if option not in self.options:
            raise HomeAssistantError("Unknown Smarther program option")
        if option == "Default":
            await self.hub.async_select_program(0)
            return
        for number, name in self.hub.programs.items():
            if option == f"Program {number}: {name}":
                await self.hub.async_select_program(number)
                return
        raise HomeAssistantError("Program no longer available")
