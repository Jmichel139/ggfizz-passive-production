// Loads and parses JSON from a given URL
async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
}

// Cleans up blueprint paths for consistent map keys
function normalizePath(bpPath) {
    return bpPath?.replace(/['"]/g, "").trim();
}

// Checks for admin query parameter (admin mode)
function isAdmin() {
    return window.location.search.includes('admin=true');
}

// Utility: triggers a JSON file download in browser
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 500);
}

// Renders an individual example as icons with +/=
function renderExampleSteps(example) {
    let html = '';
    for (let i = 0; i < example.length; i++) {
        const step = example[i];
        if (step.icon) {
            html += `
        <span class="icon-wrap">
          <img src="img/resources/${step.icon}.png" class="item-icon" alt="${step.icon}" />
          ${step.sup ? `<sup>${step.sup}</sup>` : ""}
        </span>
      `;
            // Add "+" if the next step is an icon (not equals), and not after the last icon before equals
            const next = example[i + 1];
            if (next && !next.equals && next.icon) {
                html += `<span class="operator">+</span>`;
            }
        } else if (step.equals) {
            html += `<span class="operator">=</span>`;
        }
    }
    return html;
}

// Renders the examples block using Bootstrap grid
function renderExamples(examples) {
    if (!examples || !examples.length) return '';
    if (examples.length === 1) {
        // Single example, center horizontally
        return `
      <div class="consume-examples single-example d-flex justify-content-center">
        <div class="examples-title">Examples:</div>
        <div class="consume-example-row">${renderExampleSteps(examples[0])}</div>
      </div>
    `;
    } else {
        // Multiple examples, split into two columns (Bootstrap)
        const col1 = [];
        const col2 = [];
        examples.forEach((ex, idx) => (idx % 2 === 0 ? col1 : col2).push(ex));
        return `
      <div class="consume-examples multi-example row">
        <div class="examples-title col-12">Examples:</div>
        <div class="col-md-6 d-flex flex-column align-items-center">
          ${col1.map(ex => `<div class="consume-example-row">${renderExampleSteps(ex)}</div>`).join("")}
        </div>
        <div class="col-md-6 d-flex flex-column align-items-center">
          ${col2.map(ex => `<div class="consume-example-row">${renderExampleSteps(ex)}</div>`).join("")}
        </div>
      </div>
    `;
    }
}




// Auto-generate/merge up-to-date consumesInfo with deduplication and display fallback
async function generateConsumesInfo(creatureDataRaw, resourceNameMap, existingConsumesInfo = []) {
    const existingMap = {};
    existingConsumesInfo.forEach(entry => {
        existingMap[normalizePath(entry.dinoType)] = entry;
    });

    const output = [];
    const seen = new Set();

    (creatureDataRaw.production || []).forEach(entry => {
        const bp = normalizePath(entry.dinoType);
        let found = false;
        let uniqueConsumes = new Map();

        (entry.produces || []).forEach(prod => {
            if (!Array.isArray(prod.items)) return;
            prod.items.forEach(item => {
                if (Array.isArray(item.consumesItems)) {
                    item.consumesItems.forEach(ci => {
                        const ciNorm = normalizePath(ci.bpPath);
                        if (!uniqueConsumes.has(ciNorm)) {
                            uniqueConsumes.set(ciNorm, {
                                bpPath: ci.bpPath,
                                name: resourceNameMap[ciNorm] || ci.bpPath
                            });
                            found = true;
                        }
                    });
                }
            });
        });

        if (!found) return;
        if (seen.has(bp)) return;
        seen.add(bp);

        let existing = existingMap[bp] || {};

        output.push({
            dinoType: entry.dinoType,
            consumesItems: Array.from(uniqueConsumes.values()),
            consumesData: Array.isArray(existing.consumesData) ? existing.consumesData : [],
            display: Array.isArray(existing.display) ? existing.display : [],
            examples: Array.isArray(existing.examples) ? existing.examples : [] // <-- ensure it's merged
        });
    });

    existingConsumesInfo.forEach(entry => {
        const bp = normalizePath(entry.dinoType);
        if (!seen.has(bp)) output.push(entry);
    });

    return output;
}

async function initialize() {
    try {
        // Load all data in parallel
        const [creatureDataRaw, creatureNames, rssNames] = await Promise.all([
            loadJSON("data/creature-data.json"),
            loadJSON("data/creatureNames.json"),
            loadJSON("data/rssNames.json")
        ]);

        // Build quick-lookup maps for names
        const creatureNameMap = {};
        const resourceNameMap = {};

        creatureNames.forEach(entry => {
            creatureNameMap[normalizePath(entry.bpPath)] = entry.name;
        });

        rssNames.forEach(entry => {
            resourceNameMap[normalizePath(entry.bpPath)] = entry.name;
        });

        // Load and auto-generate consumesInfo
        let consumesInfo = [];
        try {
            consumesInfo = await loadJSON("data/consumes-info.json");
            if (!Array.isArray(consumesInfo)) consumesInfo = [];
        } catch {
            // File may not exist yet—just ignore.
        }
        const newConsumesInfo = await generateConsumesInfo(creatureDataRaw, resourceNameMap, consumesInfo);

        // Admin download button for updating consumes-info.json
        if (isAdmin()) {
            const adminBtn = document.createElement('button');
            adminBtn.textContent = "Download Updated Consumes Info";
            adminBtn.style = "position:fixed;top:20px;right:20px;z-index:10000;padding:0.5em 1em;";
            adminBtn.onclick = () => downloadJSON(newConsumesInfo, "consumes-info.json");
            document.body.appendChild(adminBtn);
        }

        consumesInfo = newConsumesInfo;

        // Build quick-lookup structures for dropdowns
        const productionData = creatureDataRaw.production;
        const creatureToResources = new Map();
        const resourceToCreatures = new Map();

        (creatureDataRaw.production || []).forEach(entry => {
            const bp = normalizePath(entry.dinoType);
            const creatureName = creatureNameMap[bp] || bp;
            const resources = new Set();

            if (!Array.isArray(entry.produces)) return;
            entry.produces.forEach(prod => {
                if (!Array.isArray(prod.items)) return;
                prod.items.forEach(item => {
                    if (item.bpPath) {
                        const resourceName = resourceNameMap[normalizePath(item.bpPath)] || item.bpPath;
                        // Exclude placeholder resource
                        if (resourceName !== "Consumable Logic Placeholder") {
                            resources.add(resourceName);
                        }
                    }
                    if (Array.isArray(item.alternateItems)) {
                        item.alternateItems.forEach(alt => {
                            const altName = resourceNameMap[normalizePath(alt.bpPath)] || alt.bpPath;
                            // Exclude placeholder resource
                            if (altName !== "Consumable Logic Placeholder") {
                                resources.add(altName);
                            }
                        });
                    }
                });
            });

            // Set resources for this creature
            creatureToResources.set(creatureName, Array.from(resources));

            // ---- Reverse mapping: resourceName -> set of creatures ----
            resources.forEach(resource => {
                if (!resourceToCreatures.has(resource)) {
                    resourceToCreatures.set(resource, new Set());
                }
                resourceToCreatures.get(resource).add(creatureName);
            });
        });


        // --- Dropdowns ---
        const creatureSelect = document.getElementById("creatureSelect");
        const resourceSelect = document.getElementById("resourceSelect");
        const resultsBox = document.getElementById("results");

        function populateDropdown(selectEl, options) {
            options.sort().forEach(value => {
                const opt = document.createElement("option");
                opt.value = value;
                opt.textContent = value;
                selectEl.appendChild(opt);
            });
        }

        populateDropdown(creatureSelect, Array.from(creatureToResources.keys()));
        populateDropdown(resourceSelect, Array.from(resourceToCreatures.keys()));

        // --- Creature Dropdown Change Handler ---
        creatureSelect.addEventListener("change", () => {
            resourceSelect.value = "";
            const creature = creatureSelect.value;

            if (creature && creatureToResources.has(creature)) {
                const resources = creatureToResources.get(creature);

                // Find consumes entry
                let consumesHtml = '';
                let hasConsumes = false;
                let displayConsumes = [];
                let examplesHtml = '';

                if (consumesInfo.length > 0) {
                    // Find by BP path
                    const bpPath = Object.keys(creatureNameMap).find(key => creatureNameMap[key] === creature) || '';
                    const entry = consumesInfo.find(e =>
                        bpPath && normalizePath(e.dinoType) === bpPath
                    );
                    if (entry) {
                        // Prefer display array if present and not empty
                        if (Array.isArray(entry.display) && entry.display.length > 0) {
                            displayConsumes = entry.display;
                        } else if (Array.isArray(entry.consumesItems)) {
                            displayConsumes = entry.consumesItems;
                        }
                        // Deduplicate display
                        const seenDisplay = new Set();
                        displayConsumes = displayConsumes.filter(ci => {
                            const key = normalizePath(ci.bpPath);
                            if (seenDisplay.has(key)) return false;
                            seenDisplay.add(key);
                            return true;
                        });
                        if (displayConsumes.length > 0) hasConsumes = true;

                        if (hasConsumes) {
                            consumesHtml += `<div class="col consumes-block"><span class="col-title">Consumes:</span><ul class="item-list">`;
                            consumesHtml += displayConsumes.map(ci =>
                                `<li>${ci.icon ? `<img src="${ci.icon}" class="item-icon" alt="">` : ""}${ci.name || ci.bpPath}</li>`
                            ).join('');
                            consumesHtml += `</ul>`;
                            // Consumes info (manual notes)
                            if (entry.consumesData && Array.isArray(entry.consumesData)) {
                                consumesHtml += entry.consumesData.map(cd =>
                                    `<hr><div class="consumes-info">${cd.info}</div>`
                                ).join('');
                            }
                            // --- Render EXAMPLES here ---
                            if (entry.examples && Array.isArray(entry.examples) && entry.examples.length > 0) {
                                consumesHtml += renderExamples(entry.examples);
                            }
                            consumesHtml += `</div>`;
                        }
                    }
                }

                // Produces column
                const producesHtml = `
                  <div class="col produces-block"><span class="col-title">Produces:</span>
                    <ul class="item-list">
                    ${resources.map(r => {
                    // Try to find icon in rssNames
                    const iconEntry = Object.values(resourceNameMap).find(val => val === r);
                    // But resourceNameMap just maps bpPath->name, so let's search rssNames array itself for icon!
                    const rssIconEntry = rssNames.find(e => e.name === r);
                    const icon = rssIconEntry && rssIconEntry.icon ? rssIconEntry.icon : "";
                    return `<li>${icon ? `<img src="${icon}" class="item-icon" alt="">` : ""}${r}</li>`;
                }).join('')}
                    </ul>
                  </div>
                `;

                // Results grid: If Consumes exists, use 2 columns, else center Produces
                resultsBox.innerHTML = `
                  <div class="result-name"><h2>${creature}</h2></div>
                  <div class="result-grid${hasConsumes ? "" : " center-alone"}">
                    ${producesHtml}
                    ${consumesHtml}
                  </div>
                `;
            } else {
                resultsBox.innerHTML = "";
            }
        });

        // --- Resource Dropdown Change Handler ---
        resourceSelect.addEventListener("change", () => {
            creatureSelect.value = "";
            const resource = resourceSelect.value;

            if (resource && resourceToCreatures.has(resource)) {
                const creatures = Array.from(resourceToCreatures.get(resource)).sort();

                resultsBox.innerHTML = `
                  <div class="result-name"><h2>${resource}</h2></div>
                  <div class="result-grid center-alone">
                    <div class="col produces-block">
                      <span class="col-title">Produced by:</span>
                      <ul class="item-list">
                        ${creatures.map(c => `<li>${c}</li>`).join('')}
                      </ul>
                    </div>
                  </div>
                `;
            } else {
                resultsBox.innerHTML = "";
            }
        });

    } catch (err) {
        console.error("❌ Failed to load or parse one of the JSON files:", err);
    }
}

// Fade-in/fade-out intro to JSON panel
function initPageTransition() {
    const welcomeSection = document.querySelector(".welcome-section");
    const jsonSection = document.querySelector(".json-section");
    const titleOverlay = document.querySelector(".title-overlay");

    welcomeSection.classList.add("active");

    document.body.addEventListener("click", function handleClickOnce() {
        document.body.removeEventListener("click", handleClickOnce);

        welcomeSection.classList.remove("active");

        setTimeout(() => {
            jsonSection.classList.add("active");
            titleOverlay.classList.add("active");
        }, 300);
    });
}

// Kick off site setup
initialize();
initPageTransition();
