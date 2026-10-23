// Shared, cached content source for navigation, Archive, and project pages.
let projectsRequest;
export const COLLECTIVE_NAME = "fantastic little splash";
export const SOLO_AUTHOR_NAME = "Oleksandr Hants";

// Media files may provide purpose-specific variants. The legacy `src` field
// remains a valid fallback so older project data keeps rendering unchanged.
export function mediaSource(media, purpose = "large")
{
    if (!media || typeof media !== "object") return "";
    const priorities = {
        preview: ["preview", "src", "large", "zoom"],
        large: ["large", "src", "preview", "zoom"],
        zoom: ["zoom", "large", "src", "preview"]
    };
    for (const key of priorities[purpose] || priorities.large)
    {
        const value = media[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

export function normalizedProjectAuthor(project)
{
    const author = project?.author;
    if (!author || typeof author.type !== "string" || typeof author.name !== "string") return null;
    const type = author.type.trim().toLowerCase();
    const name = author.name.trim();
    if (type === "solo")
        return { type: "solo", name: SOLO_AUTHOR_NAME };
    if (type === "collective" && name.toLowerCase() === COLLECTIVE_NAME)
        return { type: "collective", name: COLLECTIVE_NAME };
    return null;
}

export function projectAuthorGroup(project)
{
    const type = typeof project?.author?.type === "string" ? project.author.type.trim().toLowerCase() : "";
    if (type === "solo") return "solo";
    const author = normalizedProjectAuthor(project);
    if (author?.type === "collective" && author.name === COLLECTIVE_NAME) return "collective";
    return "unclassified";
}

function reliableYear(value)
{
    const match = typeof value === "string" && value.trim().match(/^\d{4}$/);
    return match ? Number(match[0]) : null;
}

export function sortProjectsForNavigation(projects)
{
    return [...projects].sort((left, right) =>
    {
        const leftOrder = Number.isFinite(left?.navigationOrder) ? left.navigationOrder : null;
        const rightOrder = Number.isFinite(right?.navigationOrder) ? right.navigationOrder : null;
        if (leftOrder !== null || rightOrder !== null)
        {
            if (leftOrder === null) return 1;
            if (rightOrder === null) return -1;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        }
        const leftYear = reliableYear(left?.year);
        const rightYear = reliableYear(right?.year);
        if (leftYear !== null && rightYear !== null && leftYear !== rightYear) return rightYear - leftYear;
        if (leftYear !== null && rightYear === null) return -1;
        if (leftYear === null && rightYear !== null) return 1;
        return String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""));
    });
}

export function loadProjects()
{
    if (!projectsRequest) projectsRequest = fetch("data/projects.json").then(async response =>
    {
        if (!response.ok) throw new Error(`Project data returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.projects)) throw new Error("Expected a projects array.");
        const projects = data.projects.filter(project => project && typeof project.id === "string");
        const idIssues = projectBlockIdIssues(projects);
        if (idIssues.length) console.warn("Project block ID issues:", idIssues);
        return projects;
    });
    return projectsRequest;
}

// New data should give every content block a unique, persistent ID. Missing
// IDs are reported instead of rejected so pre-block-system JSON remains valid.
export function projectBlockIdIssues(projects)
{
    const issues = [];
    for (const project of Array.isArray(projects) ? projects : [])
    {
        const seen = new Set();
        for (const [index, block] of (Array.isArray(project.content) ? project.content : []).entries())
        {
            const id = typeof block?.id === "string" ? block.id.trim() : "";
            if (!id) issues.push(`${project.id}: content[${index}] has no block ID`);
            else if (seen.has(id)) issues.push(`${project.id}: duplicate block ID "${id}"`);
            else seen.add(id);
        }
    }
    return issues;
}

export function projectUrl(id)
{
    return `project.html?id=${encodeURIComponent(id)}`;
}

export function collectArchiveMedia(projects)
{
    const entries = [];
    for (const project of projects)
    {
        for (const block of Array.isArray(project.content) ? project.content : [])
        {
            if (!block) continue;
            if (["gallery", "imagePair", "image-pair"].includes(block.type))
            {
                for (const media of Array.isArray(block.items) ? block.items : [])
                    if (media?.showInArchive === true) entries.push({ project, type: "image", media });
            }
            else if (block.type === "image" && block.showInArchive === true)
                entries.push({ project, type: "image", media: block });
            else if (["video", "youtube", "vimeo"].includes(block.type) && block.showInArchive === true)
                entries.push({ project, type: "video", media: block });
        }
    }
    return entries;
}
