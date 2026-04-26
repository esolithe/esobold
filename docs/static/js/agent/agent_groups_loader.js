import { buildMessagingCommands } from "./agent_messaging.js"
import { buildPlanningInputCommands } from "./agent_planning_input.js"
import { buildMacroCommands } from "./agent_macros.js"
import { buildSearchWebCommands } from "./agent_search_web.js"
import { buildWorldStateCommands } from "./agent_world_state.js"
import { buildLibraryUtilsCommands } from "./agent_library_utils.js"
import { buildUtilityCommands } from "./agent_utilities.js"
import { buildMediaCommands } from "./agent_media.js"
import { buildFilesystemCommands } from "./agent_filesystem.js"
import { buildOpenlumaraCommands } from "./agent_openlumara.js"

window.eso = window.eso || {}
window.eso.agentCommandGroupBuilders = {
	...(window.eso.agentCommandGroupBuilders || {}),
	messaging: buildMessagingCommands,
	planning_input: buildPlanningInputCommands,
	macros: buildMacroCommands,
	search_web: buildSearchWebCommands,
	world_state: buildWorldStateCommands,
	library_utils: buildLibraryUtilsCommands,
	utilities: buildUtilityCommands,
	media: buildMediaCommands,
	filesystem: buildFilesystemCommands,
	openlumara: buildOpenlumaraCommands,
}
