export const buildSearchWebCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	return [
		{
			"name": "web_search",
			"description": "search the web for keyword",
			"args": {
				"query": "<query to research>"
			},
			"enabled": localsettings.websearch_enabled,
			"executor": async (action) => {
				await (new Promise((resolve) => { PerformWebsearch(`${action?.args?.query}`, resolve) }))
				let webResp = objToText(lastSearchResults)
				addThought(currentChainOfThought, createSysPrompt, `Web search results: \n${webResp}`)
			}
		},
		{
			"name": "search_history",
			"description": "Searches history for a series of keywords.",
			"args": {
				"searchString": "<string to search for>"
			},
			"enabled": documentdb_provider != "0",
			"executor": async (action) => {
				let searchHistoryString = action?.args?.searchString
				if (!!searchHistoryString) {
					let contentToSearch = documentdb_data
					if (!!documentdb_searchhistory) {
						contentToSearch += `\n\n[DOCUMENT BREAK][Chatlog history]${concat_gametext(true)}[DOCUMENT BREAK]`
					}
					let ltmSnippets = await DatabaseMinisearch(contentToSearch, searchHistoryString, "")
					if (ltmSnippets.length === 0) {
						addThought(currentChainOfThought, createSysPrompt, `History search performed: Nothing found`)
					}
					else {
						let ltmContent = "History search performed:";
						for (let i = 0; i < ltmSnippets.length; ++i) {
							ltmContent += getInfoSnippet(ltmSnippets[i])
						}
						addThought(currentChainOfThought, createSysPrompt, ltmContent)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Search string was empty, no search performed`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
	]
}
