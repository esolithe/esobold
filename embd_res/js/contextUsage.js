class ContextUsage {
    contextUsage = {};
    hierarchy = {};
    popupId = "contextUsagePopup";
    popupChartId = "contextUsageChart";
    popupHeaderId = "contextUsageHeader";
    popupStatusId = "contextUsageStatus";
    popupInitialised = false;
    currentRenderToken = 0;

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

    shouldShowPopup() {
        return !!localsettings?.showContextUsageChart;
    }

    createPopupIfNeeded() {
        let existing = document.getElementById(this.popupId);
        if (existing) {
            return existing;
        }

        let popup = document.createElement("div");
        popup.id = this.popupId;
        popup.classList.add("context-usage-popup", "hidden");

        let header = document.createElement("div");
        header.id = this.popupHeaderId;
        header.classList.add("context-usage-popup-header");
        header.innerText = "Context usage";

        let body = document.createElement("div");
        body.classList.add("context-usage-popup-body");

        let status = document.createElement("div");
        status.id = this.popupStatusId;
        status.classList.add("context-usage-popup-status");

        let chart = document.createElement("div");
        chart.id = this.popupChartId;
        chart.classList.add("context-usage-popup-chart");

        body.appendChild(status);
        body.appendChild(chart);
        popup.appendChild(header);
        popup.appendChild(body);
        document.body.appendChild(popup);

        this.enablePopupDrag(popup, header);
        this.popupInitialised = true;
        return popup;
    }

    enablePopupDrag(popup, handle) {
        if (!popup || !handle || popup.dataset.dragEnabled === "true") {
            return;
        }

        popup.dataset.dragEnabled = "true";
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        let onMouseMove = (event) => {
            if (!isDragging) {
                return;
            }

            let deltaX = event.clientX - startX;
            let deltaY = event.clientY - startY;
            popup.style.left = `${startLeft + deltaX}px`;
            popup.style.top = `${startTop + deltaY}px`;
            popup.style.right = "auto";
            popup.style.bottom = "auto";
        };

        let onMouseUp = () => {
            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        handle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;

            let rect = popup.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.top}px`;
            popup.style.right = "auto";
            popup.style.bottom = "auto";
            popup.style.aspectRatio = "auto";

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    setPopupStatus(text = "") {
        let status = document.getElementById(this.popupStatusId);
        if (!status) {
            return;
        }
        status.innerText = text;
        status.classList.toggle("hidden", !text);
    }

    getMermaidPieText() {
        let percentages = this.getFlatPercentagesOfTotal();
        let entries = Object.entries(percentages)
            .map(([name, value]) => [name, Number(value) * 100])
            .filter(([, value]) => Number.isFinite(value) && value > 0.00001)
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            return "";
        }

        let lines = ["pie showData", "title Context usage"]; 
        entries.forEach(([name, value]) => {
            let safeName = `${name || "Unknown"}`.replace(/"/g, "\\\"");
            lines.push(`\"${safeName}\" : ${value.toFixed(2)}`);
        });

        return lines.join("\n");
    }

    async renderMermaidChart(mermaidText) {
        let chartContainer = document.getElementById(this.popupChartId);
        if (!chartContainer) {
            return;
        }

        if (!mermaidText) {
            chartContainer.innerHTML = "";
            this.setPopupStatus("No context usage data yet.");
            return;
        }

        if (!window?.mermaid) {
            chartContainer.innerHTML = "";
            this.setPopupStatus("Mermaid is not available.");
            return;
        }

        this.setPopupStatus("");
        let renderToken = ++this.currentRenderToken;

        try {
            if (typeof mermaid.render === "function") {
                let graphId = `context-usage-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
                let rendered = await mermaid.render(graphId, mermaidText);
                if (renderToken !== this.currentRenderToken) {
                    return;
                }
                chartContainer.innerHTML = rendered.svg;
                if (typeof rendered.bindFunctions === "function") {
                    rendered.bindFunctions(chartContainer);
                }
                return;
            }

            chartContainer.innerHTML = `<pre class=\"mermaid\">${mermaidText}</pre>`;
            await mermaid.run({ querySelector: `#${this.popupChartId} .mermaid` });
        }
        catch (error) {
            console.error("Failed to render context usage chart", error);
            chartContainer.innerHTML = "";
            this.setPopupStatus("Could not render context usage chart.");
        }
    }

    async renderContextUsage() {
        let popup = this.createPopupIfNeeded();
        if (!popup) {
            return;
        }

        if (!this.shouldShowPopup()) {
            popup.classList.add("hidden");
            return;
        }

        popup.classList.remove("hidden");
        let mermaidText = this.getMermaidPieText();
        await this.renderMermaidChart(mermaidText);
    }
}

window.contextUsage = new ContextUsage();