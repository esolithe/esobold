// Reloading utils
class ReloadUtils {
    async waitForCompletion() {
        return new Promise((resolve) => setInterval(() => {
            let imagesComplete = Object.keys(image_db).filter(i => image_db[i].queue === "Generating").length === 0
            let audioComplete = !ttsIsBeingGenerated
            if (imagesComplete && audioComplete) {
                resolve()
            }
        }, 1000))
    }

    async sleepAsync(time) {
        return new Promise((resolve) => setTimeout(resolve, time))
    }

    async updateFromCustomEndpoint() {
        localsettings.saved_a1111_url = custom_kobold_endpoint

        let connectA1111 = async (silent = false) => {
            console.log("Attempt A1111 Connection...");
            //establish initial connection to a1111 api
            let modelsdata = await fetch(localsettings.saved_a1111_url + a1111_models_endpoint)
                .then(x => x.json())
                .catch((error) => {
                    a1111_is_connected = false;
                    return
                });

            console.log("Reading Settings...");
            await fetch(localsettings.saved_a1111_url + a1111_options_endpoint)
                .then(y => y.json())
                .then(optionsdata => {
                    console.log(optionsdata);
                    if (optionsdata.samples_format == null || modelsdata.length == 0) {

                    } else {
                        let a1111_current_loaded_model = optionsdata.sd_model_checkpoint;
                        console.log("Current model loaded: " + a1111_current_loaded_model);

                        //repopulate our model list
                        let dropdown = document.getElementById("generate_images_local_model");
                        let selectionhtml = ``;
                        for (var i = 0; i < modelsdata.length; ++i) {
                            selectionhtml += `<option value="` + modelsdata[i].title + `" ` + (a1111_current_loaded_model == modelsdata[i].title ? "selected" : "") + `>` + modelsdata[i].title + `</option>`;
                        }
                        dropdown.innerHTML = selectionhtml;
                        a1111_is_connected = true;
                    }
                }).catch((error) => {
                    a1111_is_connected = false;
                });
        }

        await (fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_version_endpoint), {
            method: 'GET',
            headers: get_kobold_header(),
        })
            .then(x => x.json())
            .then(data => {
                if (data && data != "" && data.version && data.version != "") {
                    koboldcpp_version_obj = data;
                    koboldcpp_version = data.version;
                    console.log("KoboldCpp Detected: " + koboldcpp_version);
                    document.getElementById("connectstatus").innerHTML = (`<span style='cursor: pointer;' onclick='fetch_koboldcpp_perf()'>KoboldCpp ${koboldcpp_version}</a>`);
                    koboldcpp_has_vision = (data.vision ? true : false);
                    koboldcpp_has_whisper = (data.transcribe ? true : false);
                    koboldcpp_has_multiplayer = (data.multiplayer ? true : false);
                    koboldcpp_has_websearch = (data.websearch ? true : false);
                    koboldcpp_has_tts = (data.tts ? true : false);
                    koboldcpp_admin_type = (data.admin ? data.admin : 0);
                    koboldcpp_has_savedatafile = (data.savedata ? true : false);
                    koboldcpp_has_guidance = (data.guidance ? true : false);
                    koboldcpp_has_server_saving = (data.hasServerSaving ? true : false)
                    koboldcpp_has_embeddings = (data.embeddings ? true : false)
                    koboldcpp_has_admin_with_HF = (data.hasAdminWithHF ? true : false)
                }
            }))

        //check if image gen is supported
        await (fetch(apply_proxy_url(custom_kobold_endpoint + a1111_models_endpoint))
            .then(response => response.json())
            .then(async values6 => {
                console.log(values6);
                if (values6 && values6.length > 0 && values6[0].model_name != "inactive" && values6[0].filename != null) {
                    let firstitem = values6[0];
                    //local image gen is available
                    localsettings.generate_images_mode = 2;
                    localsettings.saved_a1111_url = custom_kobold_endpoint;
                    await connectA1111();
                    render_gametext(true);
                }
            }).catch(error => {
                console.log("Failed to get local image models: " + error);
            }));
    }

    async getCurrentConfigAndModel() {
        let originalConfig = await (await fetch(`${custom_kobold_endpoint}/api/admin/current_config`, {
            method: 'GET',
            headers: get_kobold_header(),
        })).text()

        let originalModel = await (await fetch(`${custom_kobold_endpoint}/api/admin/current_model`, {
            method: 'GET',
            headers: get_kobold_header(),
        })).text()

        return { config: originalConfig, model: originalModel }
    }

    async waitForReload() {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                let startTime = Date.now(),
                    intervalId = setInterval(async () => {
                        if (await fetch(custom_kobold_endpoint + "/api/admin/health").then(c => c.text()).catch(e => {
                            /*Ignore error*/
                        }) === "true") {
                            clearInterval(intervalId);
                            resolve(Date.now() - startTime);
                        }
                    }, 1000);
            }, 3000)
        })
    }

    async triggerReload(filename, modelName = "") {
        let resp = await fetch(custom_kobold_endpoint + koboldcpp_admin_reload_endpoint, {
            method: 'POST',
            headers: get_kobold_header(),
            body: JSON.stringify({
                "filename": filename,
                "modelName": modelName
            })
        })
        let json = await resp.json()
        return !!json && !!json?.success
    }

    async reloadAndWait(filename, modelName = "") {
        try {
            // await sleepAsync(2000)
            await this.waitForCompletion()
            let reloadSuccess = await this.triggerReload(filename, modelName)
            if (reloadSuccess) {
                console.log("KoboldCpp is now restarting");
                let reloadTime = await this.waitForReload()
                await reloadUtils.updateFromCustomEndpoint()
                console.log("Restart complete");
            } else {
                msgbox("The request to reload KoboldCpp with a new configuration failed!\n\nPlease check if the feature is enabled, the admin directory is set, and selected config and password are correct.", "KoboldCpp Reload Failed");
            }

        } catch (error) {
            console.log("Error: " + error);
            msgbox(error, "Error");
        };
    }
}

window.reloadUtils = new ReloadUtils()