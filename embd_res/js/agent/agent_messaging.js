export const buildMessagingCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createAIPrompt,
	} = ctx

	return [
		{
			"name": "send_message",
			"description": "Sends text to the user.",
			"args": {
				"whoToSendMessageAs": {
					description: "<whose perspective is the response written from>",
					pattern: (!!agentRunState?.agentName ? `^${agentRunState.agentName}$` : undefined),
					type: "string",
					skip: !agentRunState?.agentName
				},
				"messages": {
					description: "<text to send>",
					type: "array",
					items: {
						type: "string",
					},
					minItems: 1,
					maxItems: 5
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": (action) => {
				if (!!action?.args?.messages) {
					action?.args?.messages.forEach(message => {
						if (!!message && message.trim().length > 0)
						{
							addThought(currentChainOfThought, createAIPrompt, agentRunState?.agentName ? `${agentRunState?.agentName}: ${message}` : message)
						}
					})
				}
			}
		}
	]
}
