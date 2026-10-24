import { loadProjects } from "./project-data.js";
import { createProjectImageZoom, renderProject } from "./project-renderer.js";
import { applyProjectStyles, loadProjectStyles } from "./project-styles.js";

const status = document.querySelector("#project-status");
const metadata = document.querySelector("#project-metadata");
const content = document.querySelector("#project-content");
const showImageZoom = createProjectImageZoom(document);

async function loadProject()
{
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { status.textContent = "Choose a project from Projects above."; return; }
    try
    {
        const [projects, styles] = await Promise.all([loadProjects(), loadProjectStyles()]);
        applyProjectStyles(styles);
        const project = projects.find(item => item.id === id);
        if (!project) { status.textContent = "Project not found. Choose a project from Projects above."; return; }
        renderProject(project, {
            metadataElement: metadata,
            contentElement: content,
            onImageZoom: showImageZoom
        });
        status.hidden = true;
    }
    catch (error)
    {
        status.textContent = "The project could not load. Please refresh to try again.";
        console.error("Could not load project:", error);
    }
}

loadProject();
