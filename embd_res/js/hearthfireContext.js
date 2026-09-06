let checkForPendingRequest = () => {
    return !!pending_response_id
}

window.alias = (func, before, after) => {
  return (...args) => {
    let moddedArgs = before !== undefined ? before(...args) || args : args;
    let rtn = func(...moddedArgs);
    if (rtn !== undefined && typeof rtn === "object" && typeof rtn?.then === "function") {
        return after !== undefined ? rtn.then(after) || rtn : rtn;
    }
    return after !== undefined ? after(rtn) || rtn : rtn;
  }
}

let getHashForContext = () => cyrb_hash(concat_gametext(true), 0, 8);

let intervalId = null, previousContentHash;
let startHearthfireTimer = () => {
    if (localsettings.hearthfireContext) {
        console.log("Evaluating if hearthfire context should start");
        setTimeout(() => {
            let currentContentHash = getHashForContext();
            let hasContentChanged = currentContentHash !== previousContentHash;
            previousContentHash = currentContentHash;
            if (hasContentChanged && intervalId == null) {
                console.log("Content changed, starting Hearthfire timer to check for when it is safe to submit");
                intervalId = setInterval(() => {
                    if (!checkForPendingRequest() && !isEditModeActive()) {
                        clearInterval(intervalId);
                        intervalId = null;

                        console.log("Hearthfire timer triggered, submitting");
                        // Temporarily override the submit length
                        let og_finalize_submit_payload = finalize_submit_payload;
                        finalize_submit_payload = alias((submit_payload) => {
                            if (submit_payload && submit_payload.params) {
                                submit_payload.params.max_length = 1;
                            }
                            return submit_payload;
                        }, undefined, startHearthfireTimer);

                        // Trigger warmup request here
                        submit_generation("").then(() => {
                            // Reset the override
                            finalize_submit_payload = og_finalize_submit_payload;
                            console.log("Hearthfire timer finished");
                        })
                    }
                }, 1000);
            }
            else {
                console.log("Content has not changed, Hearthfire timer not started");
            }
        }, 10000)
    }
    else if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

window.addEventListener("load", () => {
    window.merge_edit_field = alias(merge_edit_field, undefined, startHearthfireTimer)
    window.prepare_submit_generation = alias(prepare_submit_generation, undefined, startHearthfireTimer)
});