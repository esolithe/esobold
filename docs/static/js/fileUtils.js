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
let getDownloadDataFromManager = async (charName) => {
    let characterType = allCharacterNames.find(c => c.name === charName)?.type;
    if (characterType !== undefined) {
        let fileName = null, b64Url = null;
        let charData = await getCharacterData(charName);
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
                            b64Url = `data:application/json;base64,${btoa(jsObjToBytes(charData.data))}`
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