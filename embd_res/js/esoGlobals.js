/**
 * Globals used by Eso  
 */
window.eso = {}

/**
 * Set this before triggering submit_generation to override which character speaks
 * 
 * After submit_generation, this gets reset to null
 */
window.eso.currentChatOpponentOverride = null;

/**
 * Set this fully hides the corpo left panel, instead of just making it always appear minimised when the advanced setting is enabled
 */
window.eso.forceCompleteHideOfCorpoLeftPanel = false;

/**
 * Overrides the limitation of using horde only when not running locally
 */
window.eso.allowHordeEvenWithLocalAccess = () => {
    return document.getElementById("customapidropdown").value == 0 || !localflag // Originally was !localflag; 
};


/**
 * Set this to supress the router popup on initial page load.  It can still be manually set using the AI button.
 */
window.eso.disableRouterPopupOnLoad = true;

/**
 * Set this to true to log all toolcalls to the console, which can be useful for debugging tools.  Note that this can cause a lot of logs if you have tools that are called frequently.
 */
window.eso.debugStreamingToolcalls = false;