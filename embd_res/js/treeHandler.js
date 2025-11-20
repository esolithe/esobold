// Example of tree splitter based on input text
class TreeHandler {
    getPruneSingleChains() {
        return localsettings?.worldTreePrune !== undefined ? localsettings?.worldTreePrune : false;
    }
    enabled = true
    minSplitForSubKeys = 100
    tree = {}
    pathMap = {}

    // Finds the maximum similar length between two strings
    findSharedLength(a, b) {
        let i = 0
        while (i < a.length && i < b.length) {
            if (a[i] !== b[i]) {
                break
            }
            i++
        }
        return i
    }

    // Finds and adds a tree branch for text input - will return the path to the created branch
    addTreeBranch(text, currentNode = this.tree, currentPath = []) {
        if (text === "") {
            return currentPath
        }
        if (currentPath.length === 0 && this.getPruneSingleChains()) {
            this.pruneTree()
        }
        let branch = Object.keys(currentNode).map(k => [k, this.findSharedLength(k, text)]).reduce((arr, c) => {
            if ((arr.length === 0 && c[1] > 0) || arr[1] < c[1]) {
                arr = c
            }
            return arr
        }, [])

        if (branch.length == 0) {
            currentNode[text] = {}
            currentPath.push(text)
            return currentPath
        } else if (branch[0].length === branch[1]) {
            currentPath.push(branch[0])
            return this.addTreeBranch(text.substring(branch[1]), currentNode[branch[0]], currentPath)
        } else if (branch[0].length > branch[1]) {
            let newKey = branch[0].substring(0, branch[1])
            // Prevents small chunks forming - slightly less efficient, but makes the UI harder to follow
            if (newKey.length < this.minSplitForSubKeys) {
                currentNode[text] = {}
                currentPath.push(text)
                return currentPath
            }
            else {
                let remappedPortion = branch[0].substring(branch[1])
                currentNode[newKey] = {}
                currentNode[newKey][remappedPortion] = currentNode[branch[0]]
                delete currentNode[branch[0]]
                currentPath.push(newKey)
                return this.addTreeBranch(text.substring(branch[1]), currentNode[newKey], currentPath)
            }
        }
    }

    getNodeFromTree(path, currentNode = treeHandler.tree, depth = 0) {
        if (depth === 0) {
            path = JSON.parse(JSON.stringify(path))
        }
        if (path.length > 0 && !!currentNode[path[0]]) {
            return this.getNodeFromTree(path.splice(1), currentNode[path[0]], depth + 1)
        } else if (path.length === 0) {
            return currentNode
        } else {
            return null
        }
    }

    convertToTreeKey(key) {
        let cleanedKey = replace_noninstruct_placeholders(remove_all_instruct_tags(key)).replaceAll(/[^\w\d .,']/g, " ").replaceAll(/\s+/g, " ")
        let summaryOfKey = cleanedKey.length > 100 ? `${cleanedKey.substr(0, 50).trim()}...${cleanedKey.substr(-50).trim()}` : cleanedKey
        if (summaryOfKey.trim() === "") {
            return "Content"
        }
        return summaryOfKey
    }

    // Converts the current tree
    treeToView(currentNode = this.tree, parentId = 0, path = [], maxDepth = 1000, depth = 0) {
        if (parentId == 0) {
            this.pathMap = {}
        }
        let childId = 0
        let keys = Object.keys(currentNode)
        if (keys.length > 0) {
            let output = "", runningId = parentId + 1
            if (depth > maxDepth) {
                return {
                    outputText: "",
                    returnedId: parentId
                }
            }
            else {
                keys.forEach(key => {
                    let treeKey = this.convertToTreeKey(key)
                    output += `${parentId} --> ${runningId}(["${treeKey}"])\n`
                    let updatedPath = [...path, key]
                    this.pathMap[runningId] = updatedPath
                    let {
                        outputText,
                        returnedId
                    } = this.treeToView(currentNode[key], runningId, updatedPath, maxDepth, depth + 1)
                    output += outputText
                    runningId = returnedId + 1
                })
                return {
                    outputText: output,
                    returnedId: runningId
                }
            }
        } else {
            return {
                outputText: "",
                returnedId: parentId
            }
        }
    }

    countTreeElements(node = this.tree) {
        return Object.keys(node).length + Object.keys(node).map(key => countTreeElements(node[key])).reduce((s, c) => s + c, 0)
    }

    switchToBranchFromSummary(runningId) {
        let path = treeHandler.pathMap[runningId]
        if (!!path) {
            gametext_arr = [...path]
            render_gametext()
        }
    }

    overrideFromGameArr() {
        let path = ""
        gametext_arr.forEach(segment => {
            path += segment
            treeHandler.addTreeBranch(path)
        })
    }

    pruneTree(currentNode = this.tree, parents = [], path = []) {
        if (parents.length > 1 && Object.keys(currentNode).length === 0) {
            let newKey = ""
            let i
            for (i = parents.length - 1; i >= 0; i--) {
                let keys = Object.keys(parents[i])
                let hasOnlyOneChild = keys.length === 1
                if (hasOnlyOneChild) {
                    newKey = keys[0] + newKey
                } else {
                    break
                }
            }

            if (!!newKey && i > -1) {
                let parentKey = path[i]
                delete parents[i][parentKey]
                parents[i][parentKey + newKey] = {}
            }
        } else {
            Object.keys(currentNode).forEach(key => {
                this.pruneTree(currentNode[key], [...parents, currentNode], [...path, key])
            })
        }
    }
}
window.treeHandler = new TreeHandler()