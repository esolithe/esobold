let originalIndexDBSave = indexeddb_save
let numberOfActionsBetweenSaves = 5, currentTurn = 0
indexeddb_save = async (name, data) => {
    if (is_using_kcpp_with_server_saving() && !!localsettings?.enableAutosaveToServer) {
        if (name === "story") {
            if (currentTurn === numberOfActionsBetweenSaves) {
                try {
                    await fetch(`${custom_kobold_endpoint}/api/data/delete`, {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ filename: "Autosave" })
                    })
                        .catch(e => {

                        })

                    let data = generate_compressed_story(true, true, true)
                    let bodyData = {
                        filename: "Autosave",
                        data: btoa(data),
                        type: "Save",
                        isEncrypted: "0",
                        group: "Public (can be accessed by anybody)",
                        type: null,
                        thumbnail: null
                    };
                    fetch(`${custom_kobold_endpoint}/api/data/put`, {
                        method: "POST",
                        body: JSON.stringify(bodyData),
                        headers: getAuthHeaders()
                    })
                        .then(resp => resp.json())
                        .catch(e => {
                            handleError(e)
                        })
                }
                catch (e) {
                    console.error(e)
                }

                currentTurn = 0
            }
            else {
                currentTurn++
            }
        }
    }

    return originalIndexDBSave(name, data)
}