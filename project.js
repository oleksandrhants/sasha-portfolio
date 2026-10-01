import { loadProjects } from "./project-data.js";

const status = document.querySelector("#project-status");
const metadata = document.querySelector("#project-metadata");
const content = document.querySelector("#project-content");

function addCaption(figure, caption)
{
    if (!caption) return;
    const text = document.createElement("figcaption");
    text.textContent = caption;
    figure.appendChild(text);
}

function renderImage(block, project)
{
    if (typeof block.src !== "string" || !block.src) return null;
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = block.src;
    image.alt = block.title || block.caption || project.title || "Project image";
    image.loading = "lazy";
    image.decoding = "async";
    figure.appendChild(image);
    addCaption(figure, block.caption);
    return figure;
}

const blockRenderers = {
    text(block)
    {
        const paragraph = document.createElement("p");
        paragraph.className = "project-text";
        paragraph.textContent = block.text || "";
        return paragraph;
    },
    image: renderImage,
    youtube(block, project)
    {
        if (typeof block.youtubeId !== "string" || !/^[\w-]{11}$/.test(block.youtubeId)) return null;
        const figure = document.createElement("figure");
        figure.className = "project-video";
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.youtubeId)}`;
        iframe.title = block.title || `${project.title} — video`;
        iframe.loading = "lazy";
        iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        figure.appendChild(iframe);
        addCaption(figure, block.caption);
        return figure;
    },
    gallery(block, project)
    {
        const gallery = document.createElement("div");
        gallery.className = "project-gallery";
        for (const item of Array.isArray(block.items) ? block.items : [])
        {
            const image = item && renderImage(item, project);
            if (image) gallery.appendChild(image);
        }
        return gallery;
    }
};

function renderProject(project)
{
    document.title = `${project.title} — Oleksandr Hants`;
    const heading = document.createElement("h1");
    heading.textContent = project.title;
    metadata.replaceChildren(heading);
    for (const [label, value] of [
        ["Year", project.year],
        ["Project types", Array.isArray(project.projectTypes) ? project.projectTypes.join(" / ") : ""],
        ["Roles", Array.isArray(project.roles) ? project.roles.join(" / ") : ""]
    ])
    {
        if (!value) continue;
        const line = document.createElement("p");
        line.textContent = `${label}: ${value}`;
        metadata.appendChild(line);
    }
    content.replaceChildren();
    for (const block of Array.isArray(project.content) ? project.content : [])
    {
        if (!block || !Object.hasOwn(blockRenderers, block.type)) continue;
        const element = blockRenderers[block.type](block, project);
        if (element) content.appendChild(element);
    }
}

async function loadProject()
{
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { status.textContent = "Choose a project from Projects above."; return; }
    try
    {
        const projects = await loadProjects();
        const project = projects.find(project => project.id === id);
        if (!project) { status.textContent = "Project not found. Choose a project from Projects above."; return; }
        renderProject(project);
        status.hidden = true;
    }
    catch (error)
    {
        status.textContent = "The project could not load. Please refresh to try again.";
        console.error("Could not load project:", error);
    }
}
loadProject();
