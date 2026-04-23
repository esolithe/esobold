/**
 * Embedded Content Viewer Button
 * 
 * Adds a button next to agent toggles that opens the file system picker
 * and displays selected files in a floating embed window.
 * 
 * Shows only when:
 * - Agent mode is enabled (localsettings.agentBehaviour)
 * - File system is available (is_using_kcpp_with_fs())
 */

let embeddedContentViewerInitialized = false;

let ensureEmbeddedContentViewerButtons = () => {
    if (embeddedContentViewerInitialized) {
        return;
    }

    // Only initialize if both conditions are met
    if (typeof is_using_kcpp_with_fs !== 'function' || !is_using_kcpp_with_fs()) {
        return;
    }

    embeddedContentViewerInitialized = true;

    // Add button next to btn_toggleAgent (main interface)
    let agentBtn = document.getElementById('btn_toggleAgent');
    if (agentBtn && !document.getElementById('btn_viewEmbeddedContent')) {
        addEmbeddedContentViewerButton(agentBtn.parentElement, 'btn_viewEmbeddedContent');
    }

    // Add button next to btn_toggleAgentAesthetic (chat interface)
    let agentBtnAesthetic = document.getElementById('btn_toggleAgentAesthetic');
    if (agentBtnAesthetic && !document.getElementById('btn_viewEmbeddedContent_aesthetic')) {
        addEmbeddedContentViewerButton(agentBtnAesthetic.parentElement, 'btn_viewEmbeddedContent_aesthetic');
    }
};

let addEmbeddedContentViewerButton = (parentContainer, buttonId) => {
    if (!parentContainer || document.getElementById(buttonId)) {
        return;
    }

    let button = document.createElement('button');
    button.type = 'button';
    button.id = buttonId;
    button.className = 'btn actbtn btn-primary mainnav slim';
    button.title = 'Click to view embedded content';
    button.setAttribute('data-icon', 'folder');
    
    // Create SVG folder icon
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '1em');
    svg.setAttribute('height', '1em');
    svg.setAttribute('fill', 'currentColor');
    svg.style.verticalAlign = 'middle';
    
    // Folder path
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z');
    
    svg.appendChild(path);
    button.appendChild(svg);

    button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEmbeddedContentPicker();
    };

    // Insert after the agent button
    parentContainer.insertBefore(button, parentContainer.querySelector('#btn_toggleAgent') ? 
        parentContainer.querySelector('#btn_toggleAgent').nextSibling : 
        parentContainer.querySelector('#btn_toggleAgentAesthetic').nextSibling);
};

let openEmbeddedContentPicker = async () => {
    if (typeof openAgentFsPickerPopup !== 'function') {
        console.error('File system picker is not available');
        return;
    }

    // Open the file system picker
    let selectedEntries = await openAgentFsPickerPopup();
    
    if (!Array.isArray(selectedEntries) || selectedEntries.length === 0) {
        return;
    }

    // Take only the first file (single selection)
    
    let currentOffset = 0;
    for (let selectedFile of selectedEntries) {
        if (selectedFile.isDirectory) {
            console.warn('Selected entry is a directory, skipping:', selectedFile);
            continue;
        }
        try {
            // Generate a unique embed name based on the file path
            let filePath = selectedFile.path;
            let embedName = `embedded_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

            // Open the file in a floating embed window
            await openFsEmbedByName({
                name: embedName,
                file_path: filePath,
                x: 50 + currentOffset, // Offset each new window to avoid exact overlap
                y: 50 + currentOffset,
                width: 500,
                height: 500
            });
            currentOffset += 30; // Increment offset for next window
        } catch (error) {
            console.error('Failed to open embedded content:', error);
        }
    }
};

// Initialize buttons when DOM is ready
let initializeEmbeddedContentViewerWhenReady = () => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureEmbeddedContentViewerButtons();
            // Also set up periodic checks in case agent mode is toggled later
            setupAgentModeMonitor();
        });
    } else {
        ensureEmbeddedContentViewerButtons();
        setupAgentModeMonitor();
    }
};

// Monitor for agent mode changes and recreate buttons if needed
let agentModeMonitorInterval = null;

let setupAgentModeMonitor = () => {
    if (agentModeMonitorInterval !== null) {
        return; // Already set up
    }

    let lastFsState = is_using_kcpp_with_fs();
    let buttonExists = !!document.getElementById('btn_viewEmbeddedContent');

    agentModeMonitorInterval = setInterval(() => {
        // let currentAgentState = !!localsettings.agentBehaviour;
        let currentFsState = is_using_kcpp_with_fs();
        
        // Check if state changed enough to require reinitialization
        if ((currentFsState !== lastFsState) && currentFsState) {
            
            // Reset initialized flag to allow button creation
            embeddedContentViewerInitialized = false;
            ensureEmbeddedContentViewerButtons();
            
            lastFsState = currentFsState;
        }
    }, 500);
};

// Start initialization
initializeEmbeddedContentViewerWhenReady();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (agentModeMonitorInterval !== null) {
        clearInterval(agentModeMonitorInterval);
    }
});
