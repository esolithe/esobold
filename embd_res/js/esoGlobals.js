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