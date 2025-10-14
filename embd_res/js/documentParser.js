class DocumentParser {
    extractTextFromDocument(content) {
        let reqOpt = {
            method: 'POST',
            headers: get_kobold_header(),
            body: JSON.stringify({
                docData: content
            }),
        };
        if (globalabortcontroller) {
            reqOpt.signal = globalabortcontroller.signal;
        }
        let sub_endpt = apply_proxy_url(`${custom_kobold_endpoint}/api/extra/extractText`);

        return fetch(sub_endpt, reqOpt)
            .then((response) => response.json())
    }

    addDocumentToTextDB() {
        let tryImportLorebookAsTextDB = (b64) => {
            try {
                let obj = JSON.parse(atob(b64.split(",")[1]))
                return importLorebookAsTextDB(obj)
            }
            catch (e) {
                return false
            }
        }
        promptUserForLocalFile(async (fileDetails) => {
            let { file, fileName, ext, content } = fileDetails
            let extractedText = await this.extractTextFromDocument(content)
            if (!!extractedText) {
                replaceDocumentFromTextDB(fileName, extractedText)
            }
        })
    }

    async extractTextFromB64(content) {
        let extractedText = undefined
        if (content.startsWith("data:image")) {
            let analysisPrompt = "Perform OCR on the provided image."
            extractedText = await generateAndGetTextFromPrompt(`${createInstructPrompt(analysisPrompt)}${instructendplaceholder}${!!localsettings?.inject_jailbreak_instruct ? localsettings.custom_jailbreak_text : ""}`, undefined, [content.split(",")[1]])
        }
        else if (content.startsWith("data:application/json") && tryImportLorebookAsTextDB(content)) {
            return
        }
        else if (content.startsWith("data:text/")) {
            try {
                extractedText = atob(content.split(",")[1])
            }
            catch (e) {
                console.error(e)
            }
        }
        else {
            extractedText = (await this.extractTextFromDocument(content))?.text
        }
        return extractedText
    }
}
window.documentParser = new DocumentParser()