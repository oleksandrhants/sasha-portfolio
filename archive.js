import { loadProjects, projectUrl, collectArchiveMedia } from "./project-data.js";
import { calculateArchiveLayout } from "./archive-layout.js";

const ARCHIVE_CONFIG = {
    minItemsPerRow: 2, // Minimum desktop row count; responsive layouts may use one.
    maxItemsPerRow: 3, // Maximum desktop row count; never more than three.
    widthVariation: 0.22, // Width variation around an equal share; higher gives more contrast.
    minGapPixels: 8, // Smallest positive horizontal gap in pixels.
    maxGapPixels: 32, // Largest positive horizontal gap in pixels.
    overlapProbability: 0.5, // Chance that a boundary overlaps instead of leaving a gap.
    maxHorizontalOverlap: 0.35, // Maximum overlap as a fraction of the smaller neighboring width.
    maxVerticalOverlap: 0.20, // Maximum row overlap as a fraction of the smaller row height.
    verticalJitter: 45, // Maximum vertical offset within a desktop row, in pixels.
    minRowSpacing: 12, // Smallest positive separation between rows in pixels.
    maxRowSpacing: 60 // Largest positive separation between rows in pixels.
};
const ARCHIVE_DEFAULTS = Object.freeze({ ...ARCHIVE_CONFIG });
const ARCHIVE_STORAGE_KEY = "sashaPortfolioArchiveConfig_v1";
const ARCHIVE_CONTROLS = [
    ["minItemsPerRow", "Minimum Items / Row", 2, 3, 1],
    ["maxItemsPerRow", "Maximum Items / Row", 2, 3, 1],
    ["widthVariation", "Width Variation", 0, 0.3, 0.01],
    ["minGapPixels", "Minimum Gap", 0, 80, 1],
    ["maxGapPixels", "Maximum Gap", 0, 120, 1],
    ["overlapProbability", "Overlap Probability", 0, 1, 0.05],
    ["maxHorizontalOverlap", "Maximum Horizontal Overlap", 0, 0.35, 0.01],
    ["maxVerticalOverlap", "Maximum Vertical Overlap", 0, 0.3, 0.01],
    ["verticalJitter", "Vertical Jitter", 0, 100, 1],
    ["minRowSpacing", "Minimum Row Spacing", 0, 120, 1],
    ["maxRowSpacing", "Maximum Row Spacing", 0, 200, 1]
];
function normalizeArchiveBounds()
{
    for (const [min, max] of [["minItemsPerRow", "maxItemsPerRow"], ["minGapPixels", "maxGapPixels"], ["minRowSpacing", "maxRowSpacing"]])
        ARCHIVE_CONFIG[max] = Math.max(ARCHIVE_CONFIG[min], ARCHIVE_CONFIG[max]);
}
try
{
    const saved = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY));
    for (const [key, , min, max, step] of ARCHIVE_CONTROLS)
    {
        const value = saved?.[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
            && (step !== 1 || Number.isInteger(value))) ARCHIVE_CONFIG[key] = value;
    }
    normalizeArchiveBounds();
}
catch { /* Keep defaults if storage is unavailable or malformed. */ }

const grid = document.querySelector("#archive-grid");
const status = document.querySelector("#archive-status");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const closeButton = document.querySelector("#lightbox-close");
const projectLink = document.querySelector("#lightbox-project");
const lightboxContent = document.querySelector("#lightbox-content");
const lightboxInfo = document.querySelector("#lightbox-info");
const lightboxProjectMeta = document.querySelector("#lightbox-project-meta");
const lightboxDescription = document.querySelector("#lightbox-description");

// Every entry holds the original media AND its parent project, without copying metadata.
let archiveEntries = [];
let selectedEntry = null;
let lightboxTrigger = null;
let layoutItems = [];
let layoutSeed = Math.floor(Math.random() * 4294967296);
let lastLayoutWidth = 0;
let layoutFrame = 0;

function applyArchiveLayout()
{
    clearMetadataHover();
    const width = grid.clientWidth;
    lastLayoutWidth = width;
    const layout = calculateArchiveLayout(layoutItems, width, ARCHIVE_CONFIG, layoutSeed);
    for (const [index, placement] of layout.placements.entries())
    {
        const figure = placement.item.figure;
        figure.style.left = `${placement.x}px`;
        figure.style.top = `${placement.y}px`;
        figure.style.width = `${placement.width}px`;
        figure.style.setProperty("--item-stack", index + 1);
        // Match keyboard order to the shuffled visual order without rebuilding media.
        grid.appendChild(figure);
    }
    grid.style.height = `${layout.height}px`;
    grid.style.setProperty("--hover-stack", layoutItems.length + 1);
}

function regenerateArchiveLayout()
{
    layoutSeed = Math.floor(Math.random() * 4294967296);
    applyArchiveLayout();
}

window.addEventListener("resize", () =>
{
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() =>
    {
        if (!lightbox.open && grid.clientWidth !== lastLayoutWidth) applyArchiveLayout();
    });
});

function clearMetadataHover()
{
    grid.querySelectorAll(".is-hovered").forEach(item => item.classList.remove("is-hovered"));
}

// Only real pointer movement can reveal metadata; restored keyboard focus cannot.
grid.addEventListener("pointermove", event =>
{
    clearMetadataHover();
    if (lightbox.open || event.pointerType === "touch") return;
    event.target.closest(".archive-item")?.classList.add("is-hovered");
});
grid.addEventListener("pointerleave", clearMetadataHover);
window.addEventListener("blur", clearMetadataHover);
window.addEventListener("scroll", clearMetadataHover, true);

function mediaLabel({ project, media })
{
    return media.title || media.caption || project.title || "Untitled project";
}

function createMetadata({ project, media })
{
    const caption = document.createElement("figcaption");
    caption.className = "media-metadata";
    const types = Array.isArray(project.projectTypes) ? project.projectTypes.join(" / ") : "";
    for (const value of [project.title, media.year ?? project.year, types])
    {
        const line = document.createElement("span");
        line.textContent = value ?? "";
        caption.appendChild(line);
    }
    return caption;
}

function createImageMedia(entry)
{
    if (typeof entry.media.src !== "string" || !entry.media.src) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-button";
    button.setAttribute("aria-label", `Open image: ${mediaLabel(entry)}`);
    const image = document.createElement("img");
    image.src = entry.media.src;
    image.alt = mediaLabel(entry);
    // Resolve intrinsic sizes before positioning this composition.
    image.loading = "eager";
    image.decoding = "async";
    button.appendChild(image);
    button.addEventListener("click", () => openLightbox(entry, button));
    return button;
}

function createYouTubeMedia(entry)
{
    // Future embed/thumbnail implementation belongs here. No iframe is loaded yet.
    if (typeof entry.media.youtubeId !== "string" || !entry.media.youtubeId) return null;
    const placeholder = document.createElement("div");
    placeholder.className = "youtube-placeholder";
    placeholder.tabIndex = 0;
    placeholder.textContent = `${mediaLabel(entry)} — Video preview coming later`;
    return placeholder;
}

const mediaRenderers = { image: createImageMedia, youtube: createYouTubeMedia };

async function renderArchive(entries)
{
    const fragment = document.createDocumentFragment();
    let count = 0;
    layoutItems = [];
    const ready = [];
    for (const entry of entries)
    {
        const render = Object.hasOwn(mediaRenderers, entry.type) ? mediaRenderers[entry.type] : null;
        const content = render?.(entry);
        if (!content) continue;
        const figure = document.createElement("figure");
        figure.className = "archive-item";
        figure.dataset.projectId = entry.project.id;
        figure.append(content, createMetadata(entry));
        const item = { figure, ratio: 16 / 9 };
        layoutItems.push(item);
        const image = content.querySelector("img");
        if (image) ready.push(image.decode().catch(() => {}).then(() =>
        {
            if (image.naturalWidth && image.naturalHeight) item.ratio = image.naturalWidth / image.naturalHeight;
            else
            {
                // A failed image keeps a readable footprint instead of collapsing the layout.
                image.style.aspectRatio = "16 / 9";
            }
        }));
        fragment.appendChild(figure);
        count++;
    }
    await Promise.all(ready);
    grid.replaceChildren(fragment);
    applyArchiveLayout();
    return count;
}

// Shared by all media types: descriptions always belong to the selected media,
// including gallery items, never to the project's text content blocks.
function renderLightboxInfo({ project, media })
{
    lightboxProjectMeta.textContent = [project.title, project.year]
        .filter(value => value !== undefined && value !== null && value !== "").join(" · ");
    const description = typeof media.description === "string" ? media.description.trim() : "";
    lightboxDescription.textContent = description;
    lightboxDescription.hidden = !description;
    projectLink.href = projectUrl(project.id);
    // media.credit is optional data reserved for future use, not project metadata.
}

function fitLightboxImage()
{
    if (!lightbox.open || !lightboxImage.naturalWidth) return;
    // Scale both large and small sources to the largest contained rectangle.
    const style = getComputedStyle(lightbox);
    const width = lightbox.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = lightbox.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // Keep the existing contain sizing, reserving only the measured information area.
    // A bounded info height allows unusually long descriptions to scroll on small screens.
    lightboxInfo.style.maxHeight = `${Math.max(1, height * 0.3)}px`;
    const gap = parseFloat(getComputedStyle(lightboxInfo).marginTop) || 0;
    let scale = Math.min(width / lightboxImage.naturalWidth, height / lightboxImage.naturalHeight);
    for (let pass = 0; pass < 8; pass++)
    {
        lightboxContent.style.width = `${lightboxImage.naturalWidth * scale}px`;
        const available = Math.max(1, height - lightboxInfo.offsetHeight - gap);
        const nextScale = Math.min(scale, available / lightboxImage.naturalHeight);
        if (Math.abs(nextScale - scale) < 0.00001) break;
        scale = nextScale;
    }
    lightboxContent.style.width = `${lightboxImage.naturalWidth * scale}px`;
    lightboxImage.style.width = `${lightboxImage.naturalWidth * scale}px`;
    lightboxImage.style.height = `${lightboxImage.naturalHeight * scale}px`;
}

function openLightbox(entry, trigger)
{
    selectedEntry = entry;
    clearMetadataHover();
    renderLightboxInfo(entry);
    lightboxTrigger = trigger;
    lightboxImage.style.width = "";
    lightboxImage.style.height = "";
    lightboxContent.style.width = "";
    lightboxImage.alt = mediaLabel(entry);
    lightboxImage.src = entry.media.src;
    lightbox.showModal();
    document.body.classList.add("lightbox-open");
    if (lightboxImage.complete) fitLightboxImage();
}

lightboxImage.addEventListener("load", fitLightboxImage);
window.addEventListener("resize", fitLightboxImage);
closeButton.addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", event =>
{
    if (!lightboxContent.contains(event.target) && event.target !== closeButton) lightbox.close();
});
// Native dialog supplies Escape handling, focus trapping, and background inertness.
lightbox.addEventListener("close", () =>
{
    document.body.classList.remove("lightbox-open");
    clearMetadataHover();
    lightboxImage.removeAttribute("src");
    selectedEntry = null;
    lightboxTrigger?.focus();
    lightboxTrigger = null;
    if (grid.clientWidth !== lastLayoutWidth) applyArchiveLayout();
});

async function loadArchive()
{
    try
    {
        archiveEntries = collectArchiveMedia(await loadProjects());
        const count = await renderArchive(archiveEntries);
        status.hidden = count > 0;
        status.textContent = count ? "" : "No archive media yet.";
    }
    catch (error)
    {
        status.hidden = false;
        status.textContent = "The archive could not load. Please refresh to try again.";
        console.error("Could not load archive:", error);
    }
}

function createArchivePanel()
{
    const panel = document.createElement("aside");
    panel.className = "archive-debug";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Archive development controls");
    const heading = document.createElement("strong");
    heading.textContent = "Archive tuning · A to hide";
    panel.appendChild(heading);
    const feedback = document.createElement("p");
    feedback.setAttribute("role", "status");
    const inputs = new Map();
    const refresh = () => inputs.forEach((input, key) => { input.value = ARCHIVE_CONFIG[key]; });
    for (const [key, label, min, max, step] of ARCHIVE_CONTROLS)
    {
        const row = document.createElement("label");
        row.textContent = label;
        const input = document.createElement("input");
        Object.assign(input, { type: "number", min, max, step, value: ARCHIVE_CONFIG[key] });
        input.addEventListener("input", () =>
        {
            const value = input.valueAsNumber;
            if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) return;
            ARCHIVE_CONFIG[key] = value;
            normalizeArchiveBounds();
            refresh();
            regenerateArchiveLayout();
            try
            {
                localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(ARCHIVE_CONFIG));
                feedback.textContent = "Saved";
            }
            catch { feedback.textContent = "Live changes applied; storage unavailable."; }
        });
        input.addEventListener("change", refresh);
        inputs.set(key, input);
        row.appendChild(input);
        panel.appendChild(row);
    }
    for (const [label, action] of [
        ["Regenerate Layout", regenerateArchiveLayout],
        ["Reset to Defaults", () =>
        {
            Object.assign(ARCHIVE_CONFIG, ARCHIVE_DEFAULTS);
            refresh();
            regenerateArchiveLayout();
            try { localStorage.removeItem(ARCHIVE_STORAGE_KEY); feedback.textContent = "Defaults restored"; }
            catch { feedback.textContent = "Defaults restored; storage unavailable."; }
        }]
    ])
    {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", action);
        panel.appendChild(button);
    }
    panel.appendChild(feedback);
    document.body.appendChild(panel);
    window.addEventListener("keydown", event =>
    {
        if (event.key.toLowerCase() !== "a" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || lightbox.open) return;
        if (event.target.isContentEditable || event.target.closest("input, textarea, select")) return;
        panel.hidden = !panel.hidden;
    });
}
createArchivePanel();
loadArchive();
