let originalIndexDBSave = indexeddb_save
let numberOfActionsBetweenSaves = 5, currentTurn = 0
indexeddb_save = async (name, data) => {
    if (name === "story") {
        if (currentTurn === numberOfActionsBetweenSaves)
        {
            try
            {
                let remoteDataSettings = JSON.parse(await indexeddb_load("remoteDataSettings"))
                if (!!remoteDataSettings) {
                    let { remoteDataStorageUrl, autosaveName, autosaveMaxNumber, autosaveRemoteSync } = remoteDataSettings;
                    await syncAutosave(autosaveName, true)
                }
            }
            catch (e)
            {
                console.error("Error during autosave", e)
            }
            currentTurn = 0
        }
        else
        {
            currentTurn++
        }
    }

    return originalIndexDBSave(name, data)
}