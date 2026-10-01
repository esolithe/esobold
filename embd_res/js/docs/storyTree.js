/*
 * Native guide: storyTree.
 * Sources: treeHandler.js, treeViewer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.writing.chapters.push(
    {
            id: "world-tree", title: "The world tree",
            blocks: [
                { p: "The world tree lets you revisit alternative versions of a story. Replies and retries form branches, so you can return to an earlier choice and continue in another direction." },
                { p: "Click the tree icon in the top bar. Choose a point in the tree, review the confirmation, and load the story from there." },
                { tip: "Use Settings → Esobold → World tree settings to simplify the display or limit its depth. Showing the whole tree can be slow for a large save." },
            ],
            show: [
                { label: "Tree icon", run: (ctx) => ctx.highlight("#openTreeDiagram", "Opens the world tree") },
            ],
        },
    {
        "id": "branch-workflow",
        "title": "World tree: branches, Undo and Retry",
        "blocks": [
            {
                "list": [
                    "Open the tree icon in the top bar. A node is a point in the story, and a branch is an alternative continuation. The current session follows one path.",
                    "Click the point you want to revisit and confirm the load. This changes the active story and conversation history; download a save first if you want to keep a separate copy.",
                    "Undo and Redo move through the current history. Retry asks the AI for another continuation, which can become a different branch when you continue.",
                    "Pan or zoom to explore the nearby branches. Close the tree when you want to return to typing."
                ]
            },
            {
                "tip": "The tree is part of the session, not a separate backup. Hover over the Library tab and choose Download to keep a copy outside the browser."
            }
        ]
    },
    {
        "id": "tree-display-settings",
        "title": "World tree display and size controls",
        "blocks": [
            {
                "table": [
                    [
                        "Settings → Esobold",
                        "Effect"
                    ],
                    [
                        "Merge single branches",
                        "Combines chains of points that have only one continuation to simplify the display; it does not delete alternative stories."
                    ],
                    [
                        "World tree depth",
                        "Limits how far the view extends around the current point."
                    ],
                    [
                        "Show all nodes",
                        "Shows the full tree. A large story may take longer to draw."
                    ]
                ]
            },
            {
                "p": "Branches share the story up to the point where they diverge. Selecting a point restores the history leading to it. If the full tree is slow, use the smaller nearby view and increase its depth only when needed."
            }
        ],
        "show": [
            { label: "Tree display settings", run: (ctx) => ctx.openSettings("esobold") }
        ]
    }
)
