import {
    COLLECTIVE_NAME,
    loadProjects,
    projectAuthorGroup,
    projectUrl,
    sortProjectsForNavigation
} from "./project-data.js";

const NAVIGATION_STORAGE_KEY = "sashaPortfolioNavigationState_v1";

function readNavigationState()
{
    try
    {
        const value = JSON.parse(localStorage.getItem(NAVIGATION_STORAGE_KEY));
        return {
            projectsOpen: value?.projectsOpen === true,
            group: ["solo", "collective", "unclassified"].includes(value?.group) ? value.group : null
        };
    }
    catch { return { projectsOpen: false, group: null }; }
}

function writeNavigationState(state)
{
    try { localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Navigation still works when storage is unavailable. */ }
}

function setExpanded(button, panel, expanded)
{
    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
}

function createProjectGroup(key, label, projects, activeProjectId, onToggle)
{
    const section = document.createElement("section");
    section.className = "project-group";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-toggle nav-subcategory";
    button.textContent = label;
    const panel = document.createElement("div");
    panel.id = `project-group-${key}`;
    panel.className = "project-group-panel";
    button.setAttribute("aria-controls", panel.id);
    const list = document.createElement("ul");
    list.className = "project-links";
    for (const project of projects)
    {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = projectUrl(project.id);
        link.textContent = project.title || project.id;
        if (project.id === activeProjectId)
        {
            link.classList.add("is-current");
            link.setAttribute("aria-current", "page");
        }
        item.appendChild(link);
        list.appendChild(item);
    }
    if (!projects.length)
    {
        const empty = document.createElement("li");
        empty.className = "project-list-empty";
        empty.textContent = "No projects yet";
        list.appendChild(empty);
    }
    panel.appendChild(list);
    section.append(button, panel);
    button.addEventListener("click", () => onToggle(key));
    return { section, button, panel };
}

const host = document.querySelector("[data-site-nav]");
if (host)
{
    const isArchive = document.body.classList.contains("archive-page");
    const activeProjectId = document.body.classList.contains("project-detail-page")
        ? new URLSearchParams(window.location.search).get("id") : null;
    const rightNav = document.createElement("nav");
    rightNav.className = "utility-nav";
    rightNav.setAttribute("aria-label", "Archive, CV and contact");
    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Main navigation");
    const name = document.createElement("a");
    name.className = "site-name";
    name.href = "index.html";
    name.textContent = "Oleksandr Hants";

    const projects = document.createElement("div");
    projects.className = "projects-menu";
    const projectsButton = document.createElement("button");
    projectsButton.type = "button";
    projectsButton.className = "nav-toggle nav-primary";
    projectsButton.textContent = "Projects";
    projectsButton.setAttribute("aria-controls", "projects-panel");
    const projectsPanel = document.createElement("div");
    projectsPanel.id = "projects-panel";
    projectsPanel.className = "projects-panel";
    projects.append(projectsButton, projectsPanel);
    nav.append(name, projects);

    for (const [label, href] of [["Drawings", "drawings.html"], ["Photography", "photography.html"], ["Music", "music.html"]])
    {
        const link = document.createElement("a");
        link.className = "nav-primary-link";
        link.textContent = label;
        link.href = href;
        if (window.location.pathname.endsWith(href)) link.setAttribute("aria-current", "page");
        nav.appendChild(link);
    }

    const archive = document.createElement("a");
    archive.className = "site-archive-link";
    archive.href = "archive.html";
    archive.textContent = "Archive";
    if (isArchive) archive.setAttribute("aria-current", "page");
    rightNav.appendChild(archive);
    for (const label of ["CV", "Contact"])
    {
        const link = document.createElement("a");
        link.textContent = label;
        link.setAttribute("role", "link");
        link.setAttribute("aria-disabled", "true");
        link.title = "Coming later";
        rightNav.appendChild(link);
    }
    host.append(nav, rightNav);

    const state = readNavigationState();
    setExpanded(projectsButton, projectsPanel, state.projectsOpen);
    projectsButton.addEventListener("click", () =>
    {
        state.projectsOpen = projectsButton.getAttribute("aria-expanded") !== "true";
        setExpanded(projectsButton, projectsPanel, state.projectsOpen);
        writeNavigationState(state);
    });

    loadProjects().then(items =>
    {
        const sorted = sortProjectsForNavigation(items);
        const grouped = {
            solo: sorted.filter(project => projectAuthorGroup(project) === "solo"),
            collective: sorted.filter(project => projectAuthorGroup(project) === "collective"),
            unclassified: sorted.filter(project => projectAuthorGroup(project) === "unclassified")
        };
        const activeProject = items.find(project => project.id === activeProjectId);
        if (activeProject)
        {
            state.projectsOpen = true;
            state.group = projectAuthorGroup(activeProject);
        }
        const groups = [];
        const toggleGroup = key =>
        {
            state.group = state.group === key ? null : key;
            for (const group of groups) setExpanded(group.button, group.panel, state.group === group.key);
            writeNavigationState(state);
        };
        for (const [key, label] of [["solo", "Solo"], ["collective", COLLECTIVE_NAME], ["unclassified", "Needs classification"]])
        {
            if (key === "unclassified" && !grouped[key].length) continue;
            const group = createProjectGroup(key, label, grouped[key], activeProjectId, toggleGroup);
            groups.push({ key, ...group });
            projectsPanel.appendChild(group.section);
        }
        for (const group of groups) setExpanded(group.button, group.panel, state.group === group.key);
        setExpanded(projectsButton, projectsPanel, state.projectsOpen);
        writeNavigationState(state);
    }).catch(() =>
    {
        const message = document.createElement("p");
        message.className = "nav-load-error";
        message.textContent = "Projects could not load.";
        projectsPanel.replaceChildren(message);
    });
}
