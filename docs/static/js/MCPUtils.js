// Heavily based on https://www.json-rpc.dev/learn/examples/basic-client-server
class JsonRpcClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.requestId = 1;
    this.timeout = options.timeout || 5000;
  }

  // Generate unique request ID
  generateId() {
    return this.requestId++;
  }

  // Send HTTP request
  async sendRequest(payload) {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout)
      });

      // For notifications, expect 204 No Content
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.headers.has("mcp-session-id")) {
        if (!("headers" in this.options)) {
          this.options.headers = {}
        }
        this.options.headers["mcp-session-id"] = response.headers.get("mcp-session-id")
      }
      // else
      // {
      //   throw new Error("MCP session ID not provided, might be CORS issue")
      // }
      if (response.headers.get("content-type") === "text/event-stream") {
        let text = ""
        for await (const chunk of response.body) {
          text += new TextDecoder().decode(chunk);
        }
        let cleanedText = text.replace(/^event: message\r\ndata:/, "").trim()
        if (cleanedText == "") {
          return {}
        }
        return JSON.parse(cleanedText)
      }
      else {
        let respBody = await response.text();
        if (respBody == "") {
          return {}
        }
        return JSON.parse(respBody);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // Make a regular JSON-RPC call (expects response)
  async call(method, params) {
    const request = {
      jsonrpc: '2.0',
      method,
      id: this.generateId()
    };

    if (params !== undefined) {
      request.params = params;
    }

    const response = await this.sendRequest(request);

    if (response.error) {
      const error = new Error(response.error.message);
      error.code = response.error.code;
      error.data = response.error.data;
      throw error;
    }

    return response?.result || response;
  }

  // Send a notification (no response expected)
  async notify(method, params) {
    const notification = {
      jsonrpc: '2.0',
      method
    };

    if (params !== undefined) {
      notification.params = params;
    }

    await this.sendRequest(notification);
  }

  // Send batch request
  async batch(requests) {
    const batchRequest = requests.map(req => {
      const request = {
        jsonrpc: '2.0',
        method: req.method
      };

      if (req.params !== undefined) {
        request.params = req.params;
      }

      // Add ID only if it's not a notification
      if (!req.notification) {
        request.id = this.generateId();
      }

      return request;
    });

    const response = await this.sendRequest(batchRequest);

    // Handle case where all requests were notifications
    if (response === null) {
      return [];
    }

    // Process batch response
    const results = [];
    for (const res of response) {
      if (res.error) {
        const error = new Error(res.error.message);
        error.code = res.error.code;
        error.data = res.error.data;
        results.push({ error });
      } else {
        results.push({ result: res.result });
      }
    }

    return results;
  }
}
async function initMCP(url) {
  mcpClient = new JsonRpcClient(url, {
    headers: {
      "Accept": ["application/json", "text/event-stream"]
    }
  })
  await mcpClient.call("initialize", {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {},
      "elicitation": {}
    },
    "clientInfo": {
      "name": "EsoLiteClient",
      "title": "EsoLite MCP Client",
      "version": "1.0.0"
    }
  })
  await mcpClient.notify("notifications/initialized")
  let listOfTools = await mcpClient.call("tools/list")
  window.listOfTools = listOfTools

  let gc = getCommands
  getCommands = () => {
    let commands = gc()

    try {
      commands.push(...listOfTools.tools.map(tool => {
        let args = null
        if (tool?.inputSchema?.properties !== undefined && Object.keys(tool.inputSchema.properties).length > 0)
        {
          args = {
            toolCallArgs: {
              format: tool.inputSchema
            }
          }
        }
        return {
          "name": tool.name,
          "description": tool.description,
          "args": args,
          "enabled": true,
          "executor": async (action) => {
            let bodyToExec = {
              "name": tool.name,
              "arguments": action?.args?.toolCallArgs || null
            }
            let runCall = !!localsettings?.mcpDangerMode ? true : await new Promise(resolve => msgboxYesNo(`Tool call details:${JSON.stringify(bodyToExec)}`, "Run external tool call", () => resolve(true), () => resolve(false)));
            if (runCall) {
              let resp = await mcpClient.call("tools/call", bodyToExec)
              let webResp = objToText(resp.structuredContent);
              addThought(createSysPrompt, `Tool call response: \n\`\`\`\n${webResp}\n\`\`\``)
            }
            return false;
          }
        }
      }))
    } catch (e) {
      console.error(e)
    }
    return commands
  }
}

window.addEventListener("load", async () => {
  if (localsettings?.mcpServers !== undefined)
  {
    for (serverURL of localsettings.mcpServers.split("\n")) {
      if (serverURL.trim().length > 0)
      {
        try
        {
          await initMCP(serverURL.trim())
        }
        catch (e)
        {
          console.error(`${serverURL.trim()} is not a valid MCP server`, e)
        }
      }
    }
  }
})