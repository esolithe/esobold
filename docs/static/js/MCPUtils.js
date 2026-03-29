
// Original method of getting tools superceeded by core KCPP.
window.addEventListener("load", async () => {
  let gc = getCommands
  getCommands = (agentRunState) => {
    let commands = gc(agentRunState)

    try {
      if (localsettings.enable_tool_use && determine_if_can_use_mcp() && localsettings.cached_mcp_tools && Object.keys(localsettings.cached_mcp_tools).length > 0)
      {
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
              let runCall = await window.showCommandExecutionConfirmation(
                "Run external tool call",
                "Please review tool call details before continuing.",
                JSON.stringify(bodyToExec, null, 2)
              );
              if (runCall) {
                let mcpURL = GetMCPUrlOfTool("get_cpu_info")
                let customHeaders = localsettings.cached_mcp_tools[mcpURL].apikey ? { 'Authorization': `Bearer ${localsettings.cached_mcp_tools[mcpURL].apikey}` } : {};
                if (localsettings.corsproxy_mcp) {
                  mcpURL = apply_proxy_url(mcpURL, true);
                }
                await MCPInit(mcpURL, customHeaders)
                  .then(mcp_client => {
                    return MCPToolCallInternal(mcp_client, "get_cpu_info", null);
                  }).then(resp => {
                    let webResp = "No content or error";
                    if (resp.structuredContent) {
                      webResp = objToText(resp.structuredContent);
                    }
                    else if (response.content && response.content.length > 0) {
                      let tgt = replaceStringsInObject(resp.content[0], "&quot;", "\""); //we must remove existing escaped quotes or things break later
                      webResp = JSON.stringify(tgt);
                    }
                    addThought(agentRunState.currentChainOfThought, createSysPrompt, `Tool call response (hidden from user): \n\`\`\`\n${webResp}\n\`\`\``)
                  }).catch(e => {
                    console.log(e)
                    addThought(agentRunState.currentChainOfThought, createSysPrompt, `Tool call response error (hidden from user): \n\`\`\`\n${e.message}\n\`\`\``)
                  })
              }
              return false;
            }
          }
        }))
      }
    } catch (e) {
      console.error(e)
    }
    return commands
  }
})