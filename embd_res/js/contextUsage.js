class ContextUsage {
    contextUsage = {};
    hierarchy = {};

    reset() {
        this.contextUsage = {};
        this.hierarchy = {};
    }

    setUsage(type, usage) {
        this.contextUsage[type] = usage || 0;
    }

    getUsage(type) {
        return this.contextUsage[type] || 0;
    }

    getAllTopLevelUsage() {
        let childUsages = Object.values(this.hierarchy).flatMap(v => v), topLevelUsages = Object.keys(this.contextUsage).filter(usage => childUsages.indexOf(usage) === -1);
        return topLevelUsages;
    }

    getAllUsage() {
        return this.getAllTopLevelUsage().reduce((acc, usageType) => {
            acc += this.getUsage(usageType);
            return acc;
        }, 0)
    }
    
    getAllUsageAsHierarchy(currentHierarchy = {}, currentType = null, parentUsage = null, parentPercentage = null) {
        if (currentType == null) {
            if (this.getAllUsage() === 0) {
                return {};
            }
            if (this.getAllTopLevelUsage().length === 0) {
                return {};
            }
            this.getAllTopLevelUsage().forEach(usageType => {
                this.getAllUsageAsHierarchy(currentHierarchy, usageType, null, null)
            })
        } else {
            let usage = this.getUsage(currentType);
            currentHierarchy[currentType] = {
                name: currentType, 
                usage: usage, 
                percentage: parentUsage ? (usage / parentUsage) : usage / this.getAllUsage(), 
                percentageOfTotal: parentPercentage ? (usage / parentUsage * parentPercentage) : usage / this.getAllUsage()
            }
            if (this.hierarchy[currentType] !== undefined) {
                currentHierarchy[currentType].children = {}
                this.hierarchy[currentType].forEach(childType => {
                    this.getAllUsageAsHierarchy(currentHierarchy[currentType].children, childType, currentHierarchy[currentType].usage, currentHierarchy[currentType].percentageOfTotal)
                })
                currentHierarchy[currentType].percentageOfTotalExcludingChildren = currentHierarchy[currentType].percentageOfTotal - Object.values(currentHierarchy[currentType].children).reduce((acc, child) => acc + child.percentageOfTotal, 0);
            }
            else {
                currentHierarchy[currentType].percentageOfTotalExcludingChildren = currentHierarchy[currentType].percentageOfTotal;
            }
        }
        return currentHierarchy;
    }

    getFlatPercentagesOfTotal() {
        let hierarchy = this.getAllUsageAsHierarchy();
        let flatPercentages = {};
        let flattenHierarchy = (currentHierarchy) => {
            Object.values(currentHierarchy).forEach(usageType => {
                flatPercentages[usageType.name] = usageType.percentageOfTotalExcludingChildren;
                if (usageType.children) {
                    flattenHierarchy(usageType.children);
                }
            })
        }
        flattenHierarchy(hierarchy);
        return flatPercentages;
    }

    calculateOverspillUsage(mainType, overspillType, maxLength) {
        let mainTypeLength = this.getUsage(mainType), overspillTypeLength = this.getUsage(overspillType);
        if (mainTypeLength > maxLength) {
            let textDBOverspill = overspillTypeLength - Math.abs(mainTypeLength - maxLength);
            this.setUsage(mainType, maxLength);
            this.setUsage(overspillType, textDBOverspill);
        }
        else {
            this.setUsage(mainType, mainTypeLength);
        }

        this.setHierarchy(mainType, overspillType);
    }

    setHierarchy(parentType, childType) {
        if (!this.hierarchy[parentType]) {
            this.hierarchy[parentType] = [];
        }
        this.hierarchy[parentType].push(childType);
        this.hierarchy[childType] = [...new Set(this.hierarchy[childType])];
    }
}

window.contextUsage = new ContextUsage();