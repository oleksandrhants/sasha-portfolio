import { loadProjects, projectUrl } from "./project-data.js";

const host = document.querySelector("[data-site-nav]");
if (host)
{
    const isArchive = document.body.classList.contains("archive-page");
    const isHome = document.body.classList.contains("home-page");
    const rightNav = document.createElement("nav");
    rightNav.className = isHome ? "home-utility-nav" : "archive-utility-nav";
    rightNav.setAttribute("aria-label", isHome ? "Archive, CV and contact" : "CV and contact");
    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Main navigation");
    const name = document.createElement("a");
    name.className = "site-name";
    name.href = "index.html";
    name.textContent = "Oleksandr Hants";
    const projects = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Projects";
    const list = document.createElement("ul");
    list.className = "project-links";
    const loading = document.createElement("li");
    loading.textContent = "Loading…";
    list.appendChild(loading);
    projects.append(summary, list);
    nav.append(name, projects);
    for (const label of ["CV", "Contact"])
    {
        const link = document.createElement("a");
        link.textContent = label;
        link.setAttribute("role", "link");
        link.setAttribute("aria-disabled", "true");
        link.title = "Coming later";
        (isArchive || isHome ? rightNav : nav).appendChild(link);
    }
    const archive = document.createElement("a");
    archive.className = "site-archive-link";
    archive.href = "archive.html";
    archive.textContent = "Archive";
    if (isHome) rightNav.prepend(archive);
    host.append(nav, isArchive || isHome ? rightNav : archive);
    loadProjects().then(items =>
    {
        list.replaceChildren();
        for (const project of items)
        {
            const li = document.createElement("li");
            const link = document.createElement("a");
            link.href = projectUrl(project.id);
            link.textContent = project.title || project.id;
            li.appendChild(link);
            list.appendChild(li);
        }
        if (!items.length) list.textContent = "No projects yet.";
    }).catch(() => { list.textContent = "Projects could not load."; });
}
