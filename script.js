async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
}

async function initialize() {
    try {
        const [creatureDataRaw, creatureNames, rssNames] = await Promise.all([
            loadJSON("data/creature-data.json"),
            loadJSON("data/creatureNames.json"),
            loadJSON("data/rssNames.json")
        ]);

        const creatureNameMap = {};
        const resourceNameMap = {};

        function normalizePath(bpPath) {
            return bpPath?.replace(/['"]/g, '').trim();
        }

        creatureNames.forEach(entry => {
            creatureNameMap[normalizePath(entry.bpPath)] = entry.name;
        });

        rssNames.forEach(entry => {
            resourceNameMap[normalizePath(entry.bpPath)] = entry.name;
        });

        const productionData = creatureDataRaw.production;
        const creatureToResources = new Map();
        const resourceToCreatures = new Map();

        productionData.forEach(entry => {
            const creatureName = creatureNameMap[normalizePath(entry.dinoType)] || normalizePath(entry.dinoType);
            const resources = new Set();

            entry.produces.forEach(prod => {
                prod.items.forEach(item => {
                    if (item.bpPath) resources.add(resourceNameMap[normalizePath(item.bpPath)] || normalizePath(item.bpPath));
                    if (Array.isArray(item.alternateItems)) {
                        item.alternateItems.forEach(alt => {
                            if (alt.bpPath) resources.add(resourceNameMap[normalizePath(alt.bpPath)] || normalizePath(alt.bpPath));
                        });
                    }
                });
            });

            creatureToResources.set(creatureName, Array.from(resources));
            resources.forEach(resource => {
                if (!resourceToCreatures.has(resource)) {
                    resourceToCreatures.set(resource, new Set());
                }
                resourceToCreatures.get(resource).add(creatureName);
            });
        });

        // 🎯 Populate dropdowns
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

        // 🔁 Handle selection
        creatureSelect.addEventListener("change", () => {
            resourceSelect.value = "";
            const creature = creatureSelect.value;

            if (creature && creatureToResources.has(creature)) {
                const resources = creatureToResources.get(creature);
                resultsBox.innerHTML = `
          <h2>${creature}</h2>
          <p><strong>Produces:</strong></p>
          <ul>${resources.map(r => `<li>${r}</li>`).join('')}</ul>
        `;
            } else {
                resultsBox.innerHTML = "";
            }
        });

        resourceSelect.addEventListener("change", () => {
            creatureSelect.value = "";
            const resource = resourceSelect.value;

            if (resource && resourceToCreatures.has(resource)) {
                const creatures = Array.from(resourceToCreatures.get(resource)).sort();
                resultsBox.innerHTML = `
          <h2>${resource}</h2>
          <p><strong>Produced by:</strong></p>
          <ul>${creatures.map(c => `<li>${c}</li>`).join('')}</ul>
        `;
            } else {
                resultsBox.innerHTML = "";
            }
        });

    } catch (err) {
        console.error("❌ Failed to load or parse one of the JSON files:", err);
    }
}

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



initialize();
initPageTransition();