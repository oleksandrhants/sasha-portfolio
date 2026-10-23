// Shared, cached content source for navigation, Archive, and project pages.
let projectsRequest;
export const COLLECTIVE_NAME = "fantastic little splash";
export const SOLO_AUTHOR_NAME = "Oleksandr Hants";

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
        return data.projects.filter(project => project && typeof project.id === "string");
    });
    return projectsRequest;
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
            if (block.type === "gallery")
            {
                for (const media of Array.isArray(block.items) ? block.items : [])
                    if (media?.showInArchive === true) entries.push({ project, type: "image", media });
            }
            else if (["image", "youtube"].includes(block.type) && block.showInArchive === true)
                entries.push({ project, type: block.type, media: block });
        }
    }
    return entries;
}
