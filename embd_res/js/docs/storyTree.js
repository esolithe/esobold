/*
 * Native guide: storyTree.
 * Sources: treeHandler.js, treeViewer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "world-tree", title: "The world tree",
            blocks: [
                { p: "Every reply is recorded in the world tree. When you retry or edit, the story branches; the tree keeps all branches." },
                { p: "Open the tree with the tree icon in the top bar and click a point to load the story from there." },
                { tip: "Settings → Esobold → World tree settings: prune branches, choose how many levels of branches are shown, or show the whole tree (occasionally may have issues on very large saves)." },
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
                    "Open the world tree from the story controls. Each saved alternative is represented by a node/branch; the current story follows one path through that tree.",
                    "Click a branch/node summary, review the load confirmation, then switch. Switching changes the active story and its history; save first if you want an independent snapshot.",
                    "Undo and Redo navigate the current story history. Retry generates an alternative continuation, and subsequent submissions update the branch representation.",
                    "The viewer supports pan/zoom and a paginated neighborhood around the active node. Close the viewer before returning to normal input."
                ]
            },
            {
                "tip": "The graph is a visualization of session data, not a backup. A downloaded save is still needed if the browser storage or current session is lost."
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
                        "Prunes single-child chains in the displayed tree. It simplifies the view rather than intentionally deleting alternative story data."
                    ],
                    [
                        "World tree depth",
                        "Limits the neighborhood/separation shown by the paginated view."
                    ],
                    [
                        "Show all nodes",
                        "Requests the full graph; large sessions can take substantially more rendering work."
                    ]
                ]
            },
            {
                "p": "TreeHandler builds branches from shared story prefixes and reconstructs the active history from a selected tree key. TreeViewer uses Mermaid for layout and panzoom for navigation. If a large graph is slow, prefer the bounded/paginated view before trying the full tree."
            }
        ],
        "show": [
            { label: "Tree display settings", run: (ctx) => ctx.openSettings("esobold") }
        ]
    }
)
