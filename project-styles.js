export const PROJECT_STYLE_ELEMENTS = {
    title:"Project title", author:"Author / collective", metadata:"Year, project types and roles",
    body:"Body text", links:"Links", listText:"Lists and descriptions", imageCaption:"Image captions",
    photoCredit:"Photo credits", videoTitle:"Video titles", videoCaption:"Video captions", materialsHeading:"Materials headings",
    exhibitionsHeading:"Exhibitions headings", exhibitionsEntry:"Exhibitions entries"
};

const type = (fontSize, fontWeight = 400, color = "#252525") => ({ fontFamily:"Arial, Helvetica, sans-serif", fontSize, fontWeight, italic:false, color });
export const DEFAULT_PROJECT_STYLES = {
    version:1,
    typography:{
        title:type(28), author:type(18), metadata:type(13), body:type(15), links:type(15), listText:type(13),
        imageCaption:type(12), photoCredit:type(12), videoTitle:type(15), videoCaption:type(12), materialsHeading:type(15),
        exhibitionsHeading:type(15), exhibitionsEntry:type(15)
    },
    spacing:{ bodyLineHeight:1.6, paragraphGap:15, blockGap:32, headerGap:32, spacerUnit:10 },
    layout:{ textColumnWidth:null, verticalImageAlignment:"top", horizontalImageAlignment:"left", captionAlignment:"left", imageCaptionGap:10 }
};

const FAMILIES = new Set(["Arial, Helvetica, sans-serif", "Georgia, 'Times New Roman', serif", "'Courier New', Courier, monospace", "system-ui, sans-serif"]);
const COLOR = /^#[0-9a-f]{6}$/i;
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

export function normalizeProjectStyles(value)
{
    const result = structuredClone(DEFAULT_PROJECT_STYLES);
    if (!value || typeof value !== "object") return result;
    for (const key of Object.keys(PROJECT_STYLE_ELEMENTS))
    {
        const source = value.typography?.[key]; if (!source || typeof source !== "object") continue;
        const target = result.typography[key];
        if (FAMILIES.has(source.fontFamily)) target.fontFamily = source.fontFamily;
        target.fontSize = clamp(source.fontSize, 8, 96, target.fontSize);
        target.fontWeight = [300,400,500,600,700,800,900].includes(Number(source.fontWeight)) ? Number(source.fontWeight) : target.fontWeight;
        if (typeof source.italic === "boolean") target.italic = source.italic;
        if (typeof source.color === "string" && COLOR.test(source.color)) target.color = source.color.toLowerCase();
    }
    const spacing = value.spacing || {};
    result.spacing.bodyLineHeight = clamp(spacing.bodyLineHeight, 1, 3, result.spacing.bodyLineHeight);
    result.spacing.paragraphGap = clamp(spacing.paragraphGap, 0, 120, result.spacing.paragraphGap);
    result.spacing.blockGap = clamp(spacing.blockGap, 0, 240, result.spacing.blockGap);
    result.spacing.headerGap = clamp(spacing.headerGap, 0, 240, result.spacing.headerGap);
    result.spacing.spacerUnit = clamp(spacing.spacerUnit, 1, 100, result.spacing.spacerUnit);
    const layout = value.layout || {};
    result.layout.textColumnWidth = layout.textColumnWidth === null || layout.textColumnWidth === undefined ? null : clamp(layout.textColumnWidth, 480, 1000, null);
    if (["top","center","bottom"].includes(layout.verticalImageAlignment)) result.layout.verticalImageAlignment = layout.verticalImageAlignment;
    if (["left","center","right"].includes(layout.horizontalImageAlignment)) result.layout.horizontalImageAlignment = layout.horizontalImageAlignment;
    if (["left","center","right"].includes(layout.captionAlignment)) result.layout.captionAlignment = layout.captionAlignment;
    result.layout.imageCaptionGap = clamp(layout.imageCaptionGap, 0, 60, result.layout.imageCaptionGap);
    return result;
}

export async function loadProjectStyles()
{
    try
    {
        const response = await fetch("data/project-styles.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalizeProjectStyles(await response.json());
    }
    catch (error)
    {
        console.warn("Project styles unavailable; using built-in defaults.", error);
        return normalizeProjectStyles(null);
    }
}

export function applyProjectStyles(value, doc = document)
{
    const styles = normalizeProjectStyles(value); const root = doc.documentElement;
    for (const [key, settings] of Object.entries(styles.typography))
    {
        root.style.setProperty(`--project-${key}-family`, settings.fontFamily);
        root.style.setProperty(`--project-${key}-size`, `${settings.fontSize}px`);
        root.style.setProperty(`--project-${key}-weight`, String(settings.fontWeight));
        root.style.setProperty(`--project-${key}-style`, settings.italic ? "italic" : "normal");
        root.style.setProperty(`--project-${key}-color`, settings.color);
    }
    root.style.setProperty("--project-body-line-height", String(styles.spacing.bodyLineHeight));
    root.style.setProperty("--project-paragraph-gap", `${styles.spacing.paragraphGap}px`);
    root.style.setProperty("--project-block-gap", `${styles.spacing.blockGap}px`);
    root.style.setProperty("--project-header-gap", `${styles.spacing.headerGap}px`);
    root.style.setProperty("--project-spacer-unit", `${styles.spacing.spacerUnit}px`);
    root.style.setProperty("--project-text-column-width", styles.layout.textColumnWidth === null ? "70ch" : `${styles.layout.textColumnWidth}px`);
    root.style.setProperty("--project-image-vertical-align", ({top:"start",center:"center",bottom:"end"})[styles.layout.verticalImageAlignment]);
    root.style.setProperty("--project-image-horizontal-align", ({left:"flex-start",center:"center",right:"flex-end"})[styles.layout.horizontalImageAlignment]);
    root.style.setProperty("--project-caption-align", styles.layout.captionAlignment);
    root.style.setProperty("--project-image-caption-gap", `${styles.layout.imageCaptionGap}px`);
    return styles;
}
