/*
 * Native guide: mcp.
 * Sources: MCPUtils.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "mcp-workflow",
        "title": "MCP tools and external-service trust",
        "blocks": [
            {
                "list": [
                    "Enable the inherited tool-use setting, configure/connect MCP servers through the backend’s MCP configuration, and allow the intended tools. MCPUtils adapts discovered cached tools into Esobold commands.",
                    "Discovery imports tool names/descriptions and inputSchema/parameter schemas, but the reviewed legacy browser adapter executes get_cpu_info with null arguments instead of the requested tool. Do not rely on it as a generic agent-tool bridge; verify the actual backend integration separately.",
                    "Each server determines its own authentication, filesystem/network permissions and side effects. A frontend Allowed flag is not a replacement for server-side authorization.",
                    "Inspect returned errors and external state. A model describing a successful MCP call is not proof that the remote operation succeeded."
                ]
            },
            {
                "tip": "Connect only trusted servers and grant the narrowest permissions needed. Tool descriptions and results can contain untrusted instructions."
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
                    "If no MCP tools appear, check enable_tool_use, backend MCP capability, connected server/tool cache and allowed flags before changing agent prompts.",
                    "Discovered schema arguments are generated under toolCallArgs. The legacy adapter shows the requested arguments in its confirmation but does not correctly forward them to execution, as described above.",
                    "MCP results are recorded as tool responses/agent context and can be hidden from the visible conversation by the adapter. Hidden UI output is not removed from processing or necessarily private.",
                    "Not every caught adapter error forces replanning. Check the actual result and destination before retrying writes, sends or other non-idempotent operations."
                ]
            }
        ]
    }
)
