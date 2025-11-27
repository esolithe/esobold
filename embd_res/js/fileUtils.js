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

let generateZipExport = async () => {
    let dataForZip = await Promise.all(allCharacterNames.map(c => getDownloadDataFromManager(c.name)))

    const zipWriter = new zip.ZipWriter(new zip.Data64URIWriter("application/zip"));

    await Promise.all(dataForZip.map(data => zipWriter.add(data.fileName, new zip.Data64URIReader(data.b64Url))))
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
        let managerPreppedData = await Promise.all(entries.map(async entry => {
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
        }))
        managerPreppedData.forEach(managerUploadHandler)
        //   const firstEntry = (await zipReader.getEntries()).shift();
        //   const helloWorldText = await firstEntry.getData(helloWorldWriter);
        await zipReader.close();
    })
}