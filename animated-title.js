// Shared defaults and exact SVG implementation used by home and Archive.
export const TITLE_DEFAULTS = Object.freeze({
    // TITLE
    titleEnabled: true, // Show the fixed SVG nameplate.
    titleText: "Oleksandr Hants", // Editable text, rendered literally (not HTML).
    titleFontSize: 26, // CSS pixels; higher makes the name larger.
    titleTop: 24, // Pixels from the top to the unwarped lettering.
    titleLeft: 24, // Pixels from the left to the unwarped lettering.
    titleOpacity: 0.9, // 0 hides the title; 1 is fully opaque.
    titleColor: "#252525", // Text fill; dark by default for light backgrounds.
    titleWarpEnabled: true, // Disable for completely undistorted text.
    titleWarpSpeed: 0.5, // Evolution rate; 0 freezes, 0.5 is half the nominal speed.
    titleWarpStrength: 4, // Displacement scale in pixels; higher bends the lettering more.
    titleWarpComplexity: 1.5, // Higher makes smaller, busier waves; lower creates broad bends.
    titleWarpSmoothing: 0.8, // 0–1; higher smooths the noise field and calms its evolution.
});
export function createAnimatedTitle(CONFIG, { href = null } = {})
{
// A small, independently filtered SVG keeps the name editable and sharp.
function titleSvgElement(tag, attributes = {})
{
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
}

const titleOverlay = titleSvgElement("svg", { class: "title-overlay", role: "img" });
const titleDefs = titleSvgElement("defs");
const titleFilter = titleSvgElement("filter", {
    id: "nameplate-warp", filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB"
});
// Never animate the seed: a stable field evolves continuously without random jumps.
const titleNoise = titleSvgElement("feTurbulence", {
    type: "fractalNoise", seed: 7, numOctaves: 2, result: "noise"
});
const titleSmoothNoise = titleSvgElement("feGaussianBlur", { in: "noise", result: "softNoise" });
const titleDisplacement = titleSvgElement("feDisplacementMap", {
    in: "SourceGraphic", in2: "softNoise", xChannelSelector: "R", yChannelSelector: "G"
});
titleFilter.append(titleNoise, titleSmoothNoise, titleDisplacement);
titleDefs.appendChild(titleFilter);
const titleTextNode = titleSvgElement("text", { x: 0, y: 0 });
titleOverlay.append(titleDefs, titleTextNode);
if (href)
{
    const link = titleSvgElement("a", { href, "aria-label": "Return to home" });
    link.classList.add("title-home-link");
    link.appendChild(titleTextNode);
    titleOverlay.appendChild(link);
}
document.body.appendChild(titleOverlay);
let titleWarpPhase = 0;
let titleLastFrequency = "";

function updateTitleWarp(delta)
{
    if (!CONFIG.titleEnabled || !CONFIG.titleWarpEnabled || !CONFIG.titleText || CONFIG.titleWarpStrength === 0) return;
    // Integrating speed avoids phase jumps when a live slider changes speed.
    titleWarpPhase += delta * CONFIG.titleWarpSpeed * 0.3 / (1 + CONFIG.titleWarpSmoothing);
    const broadness = CONFIG.titleWarpComplexity / (1 + CONFIG.titleWarpSmoothing);
    const x = 0.006 * broadness * (1 + 0.18 * Math.sin(titleWarpPhase));
    const y = 0.012 * broadness * (1 + 0.14 * Math.sin(titleWarpPhase * 0.73 + 1.1));
    const frequency = `${x.toFixed(6)} ${y.toFixed(6)}`;
    if (frequency !== titleLastFrequency)
    {
        titleNoise.setAttribute("baseFrequency", frequency);
        titleLastFrequency = frequency;
    }
}

function updateTitle()
{
    // Show temporarily for measurement when re-enabling a previously hidden title.
    titleOverlay.style.display = "block";
    titleOverlay.setAttribute("aria-label", CONFIG.titleText);
    titleTextNode.textContent = CONFIG.titleText;
    titleTextNode.setAttribute("font-size", CONFIG.titleFontSize);
    titleTextNode.setAttribute("fill", CONFIG.titleColor);
    titleOverlay.style.opacity = CONFIG.titleOpacity;
    titleTextNode.setAttribute("filter", CONFIG.titleWarpEnabled ? "url(#nameplate-warp)" : "none");
    titleDisplacement.setAttribute("scale", CONFIG.titleWarpStrength);
    // Only the displacement field is blurred; the text itself stays sharp.
    titleSmoothNoise.setAttribute("stdDeviation", CONFIG.titleWarpSmoothing * 5);
    const box = titleTextNode.getBBox();
    const padding = CONFIG.titleWarpStrength + 12;
    const width = Math.max(1, box.width) + padding * 2;
    const height = Math.max(1, box.height) + padding * 2;
    titleOverlay.setAttribute("viewBox", `${box.x - padding} ${box.y - padding} ${width} ${height}`);
    titleOverlay.setAttribute("width", width);
    titleOverlay.setAttribute("height", height);
    for (const [key, value] of Object.entries({ x: box.x - padding, y: box.y - padding, width, height }))
        titleFilter.setAttribute(key, value);
    titleOverlay.style.top = `${CONFIG.titleTop - padding}px`;
    titleOverlay.style.left = `${CONFIG.titleLeft - padding}px`;
    document.body.style.setProperty("--title-nav-left", `${CONFIG.titleLeft}px`);
    document.body.style.setProperty("--title-nav-top", `${CONFIG.titleTop + CONFIG.titleFontSize + 18}px`);
    titleOverlay.style.display = CONFIG.titleEnabled && CONFIG.titleText ? "block" : "none";
    updateTitleWarp(0);
}
updateTitle();
// Re-measure if the browser finishes resolving its system-font metrics later.
document.fonts?.ready.then(updateTitle);


    return { update: updateTitle, tick: updateTitleWarp };
}
