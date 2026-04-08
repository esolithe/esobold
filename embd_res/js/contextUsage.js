class ContextUsage {
    contextUsage = {};
    hierarchy = {};
    inlineContainerId = "contextUsageInline";
    inlineBarId = "contextUsageInlineBar";
    popupId = "contextUsagePopup";
    popupChartId = "contextUsageChart";
    popupHeaderId = "contextUsageHeader";
    popupStatusId = "contextUsageStatus";
    popupControlsId = "contextUsageControls";
    popupCloseId = "contextUsageClose";
    includeFreeCheckboxId = "contextUsageIncludeFree";
    popupInitialised = false;
    isPopupOpen = false;

    sectionColors = {
        context: "#4E79A7",
        tempMemory: "#F28E2B",
        memory: "#E15759",
        authorsNote: "#76B7B2",
        worldInfo: "#59A14F",
        textDB: "#EDC949",
        systemPrompt: "#AF7AA1",
        Free: "#9CA3AF",
        default: "#8A8F9A"
    };

    sectionDescriptions = {
        context: "Recent chat context kept for generation",
        tempMemory: "Temporary memory blocks",
        memory: "Story memory / long-running memory",
        authorsNote: "Author's note context",
        worldInfo: "World info entries",
        textDB: "Text database / lore retrieval",
        systemPrompt: "System instructions and prompt framing",
        Free: "Unused context capacity"
    };

    reset() {
        this.contextUsage = {};
        this.hierarchy = {};
        this.lastTokenUsage = undefined;
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

    lastTokenUsage = undefined
    async getActualLastTokensUsed() {
        if (this.lastTokenUsage !== undefined) {
            return this.lastTokenUsage;
        }
        if (!custom_kobold_endpoint || !koboldcpp_perf_endpoint) {
            return Math.ceil(this.getAllUsage() / 3);
        }
        try {
            this.lastTokenUsage = (await fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_perf_endpoint)).then(res => res.json().catch(() => undefined)))?.last_input_count;
            return this.lastTokenUsage;
        }
        catch (e) {
            console.log("Error fetching actual token usage, falling back to estimated usage", e);
            return Math.ceil(this.getAllUsage() / 3);
        }
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

    async getFlatStatsOfTotal(scalingPercentage = 100, scalingTokensTotal = undefined) {
        if (scalingTokensTotal === undefined) {
            scalingTokensTotal = await this.getActualLastTokensUsed();
        }
        let usageStats = this.getFlatPercentagesOfTotal();
        Object.keys(usageStats).forEach(key => {
            if (usageStats[key] < 0.00001) {
                delete usageStats[key];
            }
            else {
                usageStats[key] = {
                    percentage: usageStats[key] * scalingPercentage,
                    tokens: usageStats[key] * scalingTokensTotal
                }
            }
        })
        return usageStats;
    }

    async getFlatStatsOfTotalIncludingFree() {
        let maxTokens = localsettings.max_context_length, maxLength = localsettings?.max_length || 0, availableTokens = maxTokens - maxLength;
        let usedTokens = await this.getActualLastTokensUsed(), usedPercentage = usedTokens / availableTokens;
        let usageStats = await this.getFlatStatsOfTotal(usedPercentage * 100, usedTokens);
        let freeTokens = Math.max(0, availableTokens - usedTokens);
        usageStats["Free"] = {
            percentage: freeTokens / maxTokens * 100,
            tokens: freeTokens
        };
        usageStats["Output capacity"] = {
            percentage: maxLength / maxTokens * 100,
            tokens: maxLength
        };
        return usageStats;
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

    getDisplayName(type) {
        if (!type) {
            return "Unknown";
        }
        return `${type}`
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    getSectionColor(type) {
        return this.sectionColors[type] || this.sectionColors.default;
    }

    getSectionDescription(type) {
        return this.sectionDescriptions[type] || `Usage section: ${this.getDisplayName(type)}`;
    }

    async getSortedDisplayEntries() {
        let usageStats = this.shouldIncludeFreeContext() ? await this.getFlatStatsOfTotalIncludingFree() : await this.getFlatStatsOfTotal();
        return Object.entries(usageStats)
            .map(([name, stats]) => ({
                name,
                percentage: Number(stats?.percentage || 0),
                tokens: Number(stats?.tokens || 0)
            }))
            .filter((entry) => Number.isFinite(entry.percentage) && entry.percentage > 0.00001)
            .sort((a, b) => b.percentage - a.percentage);
    }

    getUsageSummaryText(entries) {
        let usedTokens = Math.ceil(this.getAllUsage() / 3);
        let maxTokens = Number(localsettings?.max_context_length || 0);
        if (!maxTokens || maxTokens <= 0) {
            return `Using ~${usedTokens.toLocaleString()} tokens`;
        }

        let usedPercentage = Math.min(100, (usedTokens / maxTokens) * 100);
        return `Using ~${usedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${usedPercentage.toFixed(2)}%) across ${entries.length} section${entries.length === 1 ? "" : "s"}.`;
    }

    createInlineBarIfNeeded() {
        let existing = document.getElementById(this.inlineContainerId);
        if (existing) {
            return existing;
        }

        let connectStatusDiv = document.getElementById("connectstatusdiv");
        if (!connectStatusDiv?.parentElement) {
            return null;
        }

        let inlineContainer = document.createElement("div");
        inlineContainer.id = this.inlineContainerId;
        inlineContainer.classList.add("context-usage-inline", "hidden");

        let inlineBar = document.createElement("div");
        inlineBar.id = this.inlineBarId;
        inlineBar.classList.add("context-usage-inline-bar");

        inlineContainer.appendChild(inlineBar);
        connectStatusDiv.insertAdjacentElement("beforebegin", inlineContainer)

        inlineContainer.addEventListener("click", () => {
            this.openPopup();
        });

        return inlineContainer;
    }

    shouldIncludeFreeContext() {
        let checkbox = document.getElementById(this.includeFreeCheckboxId);
        return !!checkbox?.checked;
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

        let title = document.createElement("span");
        title.classList.add("context-usage-popup-title");
        title.innerText = "Context usage details";

        let closeButton = document.createElement("button");
        closeButton.id = this.popupCloseId;
        closeButton.classList.add("context-usage-popup-close");
        closeButton.type = "button";
        closeButton.innerText = "X";
        closeButton.title = "Close context usage details";

        header.appendChild(title);
        header.appendChild(closeButton);

        let body = document.createElement("div");
        body.classList.add("context-usage-popup-body");

        let status = document.createElement("div");
        status.id = this.popupStatusId;
        status.classList.add("context-usage-popup-status");

        let controls = document.createElement("label");
        controls.id = this.popupControlsId;
        controls.classList.add("context-usage-popup-controls");

        let includeFreeCheckbox = document.createElement("input");
        includeFreeCheckbox.id = this.includeFreeCheckboxId;
        includeFreeCheckbox.type = "checkbox";
        includeFreeCheckbox.checked = false;

        let includeFreeLabel = document.createElement("span");
        includeFreeLabel.innerText = "Include free context";

        controls.appendChild(includeFreeCheckbox);
        controls.appendChild(includeFreeLabel);

        let chart = document.createElement("div");
        chart.id = this.popupChartId;
        chart.classList.add("context-usage-popup-chart");

        body.appendChild(status);
        body.appendChild(controls);
        body.appendChild(chart);
        popup.appendChild(header);
        popup.appendChild(body);
        document.body.appendChild(popup);

        includeFreeCheckbox.addEventListener("change", () => {
            this.renderContextUsage();
        });

        closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.closePopup();
        });

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

    formatTooltip(entry) {
        return `${this.getDisplayName(entry.name)}\n${this.getSectionDescription(entry.name)}\n${entry.percentage.toFixed(2)}% (~${Math.round(entry.tokens).toLocaleString()} tokens)`;
    }

    renderStackedBar(targetElem, entries, includeLabels = false) {
        if (!targetElem) {
            return;
        }

        targetElem.innerHTML = "";
        if (!entries.length) {
            return;
        }

        entries.forEach((entry) => {
            let section = document.createElement("div");
            section.classList.add("context-usage-section");
            if (includeLabels) {
                section.classList.add("with-label");
            }

            section.style.width = `${Math.max(0.25, entry.percentage)}%`;
            section.style.backgroundColor = this.getSectionColor(entry.name);
            section.title = this.formatTooltip(entry);
            section.setAttribute("aria-label", this.formatTooltip(entry));

            if (includeLabels) {
                let label = document.createElement("span");
                label.classList.add("context-usage-section-label");
                label.innerText = `${this.getDisplayName(entry.name)} ${entry.percentage.toFixed(1)}%`;
                section.appendChild(label);
            }

            targetElem.appendChild(section);
        });
    }

    renderDetailedView(entries) {
        let chartContainer = document.getElementById(this.popupChartId);
        if (!chartContainer) {
            return;
        }

        chartContainer.innerHTML = "";

        if (!entries.length) {
            this.setPopupStatus("No context usage data yet.");
            return;
        }

        this.setPopupStatus(this.getUsageSummaryText(entries));

        let detailedBar = document.createElement("div");
        detailedBar.classList.add("context-usage-detailed-bar");
        this.renderStackedBar(detailedBar, entries, false);

        let legend = document.createElement("div");
        legend.classList.add("context-usage-legend");
        entries.forEach((entry) => {
            let item = document.createElement("div");
            item.classList.add("context-usage-legend-item");
            item.title = this.formatTooltip(entry);

            let swatch = document.createElement("span");
            swatch.classList.add("context-usage-legend-swatch");
            swatch.style.backgroundColor = this.getSectionColor(entry.name);

            let text = document.createElement("span");
            text.classList.add("context-usage-legend-text");
            text.innerText = `${this.getDisplayName(entry.name)} - ${entry.percentage.toFixed(2)}% (~${Math.round(entry.tokens).toLocaleString()} tokens)`;

            item.appendChild(swatch);
            item.appendChild(text);
            legend.appendChild(item);
        });

        chartContainer.appendChild(detailedBar);
        chartContainer.appendChild(legend);
    }

    renderInlineView(entries) {
        let inlineContainer = this.createInlineBarIfNeeded();
        if (!inlineContainer) {
            return;
        }

        let inlineBar = document.getElementById(this.inlineBarId);
        if (!inlineBar) {
            return;
        }

        inlineContainer.classList.remove("hidden");

        if (!entries.length) {
            inlineBar.innerHTML = "";
            inlineBar.classList.add("context-usage-inline-bar-waiting");
            inlineContainer.title = "Waiting for first request";
            return;
        }

        inlineBar.classList.remove("context-usage-inline-bar-waiting");
        inlineContainer.title = `Context usage\n${this.getUsageSummaryText(entries)}\nClick for details`;
        this.renderStackedBar(inlineBar, entries, false);
    }

    async openPopup() {
        let popup = this.createPopupIfNeeded();
        if (!popup) {
            return;
        }

        this.isPopupOpen = true;
        popup.classList.remove("hidden");
        this.renderDetailedView(await this.getSortedDisplayEntries());
    }

    closePopup() {
        let popup = document.getElementById(this.popupId);
        if (!popup) {
            return;
        }

        this.isPopupOpen = false;
        popup.classList.add("hidden");
    }

    async renderContextUsage() {
        let showChart = this.shouldShowPopup();
        let entries = showChart ? await this.getSortedDisplayEntries() : [];

        if (!showChart) {
            let inlineContainer = document.getElementById(this.inlineContainerId);
            if (inlineContainer) {
                inlineContainer.classList.add("hidden");
            }
            this.closePopup();
            return;
        }

        this.renderInlineView(entries);

        if (this.isPopupOpen) {
            this.openPopup();
        }
    }
}

window.contextUsage = new ContextUsage();

window.addEventListener("load", () => {
    contextUsage.renderContextUsage();
});