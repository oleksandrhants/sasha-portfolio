// Shared, cached content source for navigation, Archive, and project pages.
let projectsRequest;
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
