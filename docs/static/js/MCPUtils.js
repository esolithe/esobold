
// Original method of getting tools superceeded by core KCPP.
window.addEventListener("load", async () => {
  let gc = getCommands
  getCommands = () => {
    let commands = gc()

    try {
      commands.push(...MCPGetAllowedTools().map(tool => tool.function || tool).map(tool => {
        let args = null

        let hasParams = (tool?.inputSchema?.properties !== undefined && Object.keys(tool.inputSchema.properties).length > 0) || (tool?.parameters?.properties !== undefined && Object.keys(tool.parameters.properties).length > 0)
        if (hasParams) {
          args = {
            toolCallArgs: {
              format: tool?.inputSchema || tool?.parameters
            }
          }
        }
        return {
          "name": tool.name,
          "description": tool.description,
          "args": args,
          "enabled": true,
          "outputVisibleToUser": false,
          "executor": async (action) => {
            let bodyToExec = {
              "name": tool.name,
              "arguments": action?.args?.toolCallArgs || null
            }
            let runCall = !!localsettings?.tools_auto_exec ? true : await new Promise(resolve => msgboxYesNo(`Tool call details:${JSON.stringify(bodyToExec)}`, "Run external tool call", () => resolve(true), () => resolve(false)));
            if (runCall) {
              let mcpURL = GetMCPUrlOfTool("get_cpu_info")
              let customHeaders = localsettings.cached_mcp_tools[mcpURL].apikey ? { 'Authorization': `Bearer ${localsettings.cached_mcp_tools[mcpURL].apikey}` } : {};
              if (localsettings.corsproxy_mcp) {
                mcpURL = apply_proxy_url(mcpURL, true);
              }
              let resp = await MCPInit(mcpURL, customHeaders)
                .then(mcp_client => {
                  return MCPToolCallInternal(mcp_client, "get_cpu_info", null);
                })
              let webResp = "No content or error";
              if (resp.structuredContent)
              {
                webResp = objToText(resp.structuredContent);
              }
              else if (response.content && response.content.length > 0)
              {
                let tgt = replaceStringsInObject(resp.content[0], "&quot;", "\""); //we must remove existing escaped quotes or things break later
                webResp = JSON.stringify(tgt);
              }
              addThought(createSysPrompt, `Tool call response (hidden from user): \n\`\`\`\n${webResp}\n\`\`\``)
            }
            return false;
          }
        }
      }))
    } catch (e) {
      addThought(createSysPrompt, `Tool call response error (hidden from user): \n\`\`\`\n${e.message}\n\`\`\``)
      console.error(e)
    }
    return commands
  }
})