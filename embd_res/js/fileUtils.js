let downloadB64URL = (name, data) => {
    let a = document.createElement("a");
    a.href = data
    a.download = `${name}`
    a.click();
    a.remove();
}
let jsObjToBytes = (data) => {
    let bytes = new TextEncoder().encode(JSON.stringify(data)), text = "";
    for (var i = 0; i < Math.ceil(bytes.length / 32768.0); i++) {
        text += String.fromCharCode.apply(null, bytes.slice(i * 32768, Math.min((i + 1) * 32768, bytes.length)))
    }
    return text
}
let bytesToB64 = (bytes) => {
    let text = "";
    for (var i = 0; i < Math.ceil(bytes.length / 32768.0); i++) {
        text += String.fromCharCode.apply(null, bytes.slice(i * 32768, Math.min((i + 1) * 32768, bytes.length)))
    }
    return btoa(text)
}

let textToBytesToB64 = (text) => {
    return btoa(new TextEncoder().encode(text)) 
}
let b64ToBytesToText = (b64) => {
    return new TextDecoder().decode(new Uint8Array(atob(b64).split(",").map(Number)));
}
// A character without a portrait is downloaded as a TavernCard V2 JSON ({ spec, spec_version, data },
// V1 fields mirrored at the top), the same card format as inside a portrait PNG. The bare inner object
// was read as a V1 card by SillyTavern and others, which then dropped system_prompt,
// post_history_instructions, alternate_greetings, character_book and extensions.
// The stored data goes into `data` unchanged; only required V2 fields that are missing are added
// (empty). Esolite's own import (managerUploadHandler, also "Upload all") unwraps `data` again.
let characterToTavernV2 = (inner) => {
    if (!!inner?.spec && !!inner?.data) {
        return inner
    }
    let data = Object.assign({}, inner || {})
    let required = { name: "", description: "", personality: "", scenario: "", first_mes: "", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: [], creator: "", character_version: "", extensions: {} }
    for (let [key, value] of Object.entries(required)) {
        if (data[key] === undefined) {
            data[key] = Array.isArray(value) ? [] : (typeof value === "object" ? {} : value)
        }
    }
    return { spec: "chara_card_v2", spec_version: "2.0", name: data.name, description: data.description, personality: data.personality, scenario: data.scenario, first_mes: data.first_mes, mes_example: data.mes_example, data }
}
let getDownloadDataFromManager = async (charName) => {
    let normalizedName = `${charName || ""}`.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim()
    let characterMeta = (allCharacterNames || []).find(c => `${c?.name || ""}`.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim() === normalizedName)
    let characterType = characterMeta?.type;
    if (characterType !== undefined) {
        let fileName = null, b64Url = null;
        let charData = await getCharacterData(characterMeta?.id || charName);
        if (!!charData)
            {

            switch (characterType) {
                case "Character":
                    if (!!charData?.image) {
                        fileName = `${charName}.png`
                        b64Url = charData.image
                    }
                    else {
                        try {
                            fileName = `${charName}.json`
                            b64Url = `data:application/json;base64,${btoa(jsObjToBytes(characterToTavernV2(charData.data)))}`
                        }
                        catch (e) {
                            handleError(e)
                        }
                    }
                    break;
                case "World Info":
                    let { originalData } = charData;
                    if (!!originalData) {
                        try {
                            fileName = `${charName}.json`
                            b64Url = `data:application/json;base64,${btoa(jsObjToBytes(originalData))}`
                        }
                        catch (e) {
                            handleError(e)
                        }
                    }
                    else {
                        handleError("Could not download file")
                    }
                    break;
                case "Save":
                case "Scenario":
                    if (!!charData?.data) {
                        try {
                            fileName = `${charName}.json`
                            b64Url = `data:application/json;base64,${btoa(jsObjToBytes(charData.data))}`
                        }
                        catch (e) {
                            handleError(e)
                        }
                    }
                    else {
                        handleError("Could not download file")
                    }
                    break;
                case "Document":
                    if (!!charData?.data) {
                        try {
                            let ext = ".txt"
                            switch (charData.dataType) {
                                case "application/pdf":
                                    ext = ".pdf"
                                    break
                            }
                            fileName = `${charName}${ext}`
                            b64Url = charData.data
                        }
                        catch (e) {
                            handleError(e)
                        }
                    }
                    else {
                        handleError("Could not download file")
                    }
            }
        }

        if (fileName !== null && b64Url !== null) {
            return { fileName, b64Url }
        }
    }

    return null
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let myUUID = uuidv4();

let generateZipExport = async () => {
    const zipWriter = new zip.ZipWriter(new zip.Data64URIWriter("application/zip"));
    await Promise.all(allCharacterNames.map(c => getDownloadDataFromManager(c.name)).map(promise => promise.then(data => {
        if (!!data) {
            zipWriter.add(data.fileName || uuidv4(), new zip.Data64URIReader(data.b64Url))
        }
    }))).catch(handleError);
    return zipWriter.close();
}

let downloadZipExport = async () => {
    await generateZipExport().then(zipDataUrl => downloadB64URL("LiteExport.zip", zipDataUrl));
}

let uploadZipImport = async () => {
    promptUserForLocalFile(async result => {
        let { file, fileName, ext, content, plaintext, dataArr } = result;
        const zipReader = new zip.ZipReader(new zip.Data64URIReader(content));
        let entries = await zipReader.getEntries()
        await Promise.all(entries.map(async entry => {
            let filename = entry.filename
            let text = await entry.getData(new zip.TextWriter())
            let uInt8 = await entry.getData(new zip.Uint8ArrayWriter())
            let extSplit = filename.lastIndexOf(".")
            return {
                fileName: filename.substring(0, extSplit),
                ext: filename.substring(extSplit),
                plaintext: text,
                dataArr: uInt8
            }
        }).map(promise => promise.then(managerUploadHandler)))
        await zipReader.close();
    })
}