/*
 * Native guide: mcp.
 * Sources: MCPUtils.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "mcp-workflow",
        "title": "MCP: connecting external tools",
        "blocks": [
            {
                "p": "MCP (Model Context Protocol) connects an AI app to external tool services, such as a service that reads files. This integration is optional and currently has an important limitation."
            },
            {
                "list": [
                    "Enable tool use, connect the desired MCP server through the backend's configuration, then allow the intended tools. Discovered tool names and inputs can appear as agent commands.",
                    "In this version, the browser integration requests CPU information (get_cpu_info) with no inputs instead of running the chosen tool. Do not rely on it to run other MCP tools, even if they appear in the tool list.",
                    "Each tool server has its own passwords, file/network access and ability to change data. Tick Allowed only for tools you need, and configure access at the server too.",
                    "Read the actual tool result and check the destination after an action. An AI reply saying the call succeeded may not match what happened."
                ]
            },
            {
                "tip": "Connect services you trust and give them only the access they need. Review instructions in tool descriptions or results before following them."
            }
        ],
        "show": [
            { label: "Tool configuration", run: (ctx) => ctx.openSettings("tools") }
        ]
    },
    {
        "id": "mcp-errors",
        "title": "MCP availability, hidden output and errors",
        "blocks": [
            {
                "list": [
                    "If no MCP tools appear, check whether tool use is enabled (enable_tool_use) and inspect the Allowed checkboxes in Settings → Tools. The server also needs MCP support, a working connection and a discovered tool list.",
                    "The confirmation shows the AI's requested inputs (toolCallArgs), but this version does not pass them correctly to the external tool, as described in the previous chapter.",
                    "Tool results can be added to the agent's context while hidden from the visible conversation. Hidden output is still processed; hiding it does not make it private.",
                    "Some adapter errors do not start a new plan. Check the result before repeating a write or send, because retrying may perform the action twice."
                ]
            }
        ]
    }
)
