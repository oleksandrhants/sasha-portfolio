import { mediaSource, normalizedProjectAuthor } from "./project-data.js";
import { renderRichText } from "./rich-text.js";

const VALID_LANGUAGES = new Set(["en", "uk"]);
const VALID_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function textValue(value)
{
    return typeof value === "string" ? value.trim() : "";
}

function setLanguage(element, value)
{
    const language = textValue(value).toLowerCase();
    if (VALID_LANGUAGES.has(language)) element.lang = language;
}

function safeExternalUrl(value)
{
    const source = textValue(value);
    if (!source) return "";
    try
    {
        const url = new URL(source);
        return VALID_URL_PROTOCOLS.has(url.protocol) ? url.href : "";
    }
    catch { return ""; }
}

function addCaption(figure, caption, doc)
{
    const value = textValue(caption);
    if (!value) return;
    const element = doc.createElement("figcaption");
    element.textContent = value;
    figure.appendChild(element);
}

function mediaLabel(media, project)
{
    return textValue(media.alt) || textValue(media.title) || textValue(media.caption)
        || textValue(project.title) || "Project image";
}

function renderImage(media, project, context)
{
    const source = mediaSource(media, "large");
    if (!source) return null;
    const { doc, onImageZoom } = context;
    const figure = doc.createElement("figure");
    figure.className = "project-image";
    const image = doc.createElement("img");
    image.src = source;
    image.alt = mediaLabel(media, project);
    image.loading = "lazy";
    image.decoding = "async";
    if (Number.isFinite(media.width) && media.width > 0) image.width = media.width;
    if (Number.isFinite(media.height) && media.height > 0) image.height = media.height;

    const zoomSource = textValue(media.zoom);
    if (zoomSource && typeof onImageZoom === "function")
    {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "project-image-zoom";
        button.setAttribute("aria-label", `Enlarge image: ${image.alt}`);
        button.appendChild(image);
        button.addEventListener("click", () => onImageZoom({
            src: zoomSource,
            alt: image.alt,
            caption: textValue(media.caption),
            credit: textValue(media.credit),
            trigger: button
        }));
        figure.appendChild(button);
    }
    else figure.appendChild(image);

    addCaption(figure, media.caption, doc);
    return figure;
}

function youtubeId(block)
{
    const direct = textValue(block.videoId) || textValue(block.youtubeId);
    if (/^[\w-]{11}$/.test(direct)) return direct;
    const source = textValue(block.url);
    if (!source) return "";
    try
    {
        const url = new URL(source);
        if (url.hostname === "youtu.be") return /^[\w-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : "";
        if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com"))
        {
            const candidate = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/)?.[1];
            return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : "";
        }
    }
    catch { /* Invalid URLs simply produce no video. */ }
    return "";
}

function vimeoId(block)
{
    const direct = textValue(block.videoId) || textValue(block.vimeoId);
    if (/^\d+$/.test(direct)) return direct;
    const source = textValue(block.url);
    if (!source) return "";
    try
    {
        const url = new URL(source);
        if (url.hostname !== "vimeo.com" && !url.hostname.endsWith(".vimeo.com")) return "";
        return url.pathname.match(/(?:\/video)?\/(\d+)/)?.[1] || "";
    }
    catch { return ""; }
}

function videoProvider(block)
{
    const requested = textValue(block.provider).toLowerCase();
    if (["youtube", "vimeo"].includes(requested)) return requested;
    if (block.type === "youtube" || block.youtubeId) return "youtube";
    if (block.type === "vimeo" || block.vimeoId) return "vimeo";
    const url = textValue(block.url).toLowerCase();
    if (url.includes("youtu.be") || url.includes("youtube.com")) return "youtube";
    if (url.includes("vimeo.com")) return "vimeo";
    return "";
}

function renderVideo(block, project, context)
{
    const provider = videoProvider(block);
    const id = provider === "youtube" ? youtubeId(block) : provider === "vimeo" ? vimeoId(block) : "";
    if (!id) return null;
    const { doc } = context;
    const figure = doc.createElement("figure");
    figure.className = "project-video";
    const title = textValue(block.title);
    if (block.showTitle === true && title)
    {
        const heading = doc.createElement("h3");
        heading.className = "project-video-title";
        heading.textContent = title;
        figure.appendChild(heading);
    }
    const iframe = doc.createElement("iframe");
    iframe.src = provider === "youtube"
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
        : `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    iframe.title = title || `${textValue(project.title) || "Project"} — video`;
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    figure.appendChild(iframe);
    addCaption(figure, block.caption, doc);
    return figure;
}

function renderMediaGroup(block, project, context, className, maximum)
{
    const group = context.doc.createElement("div");
    group.className = className;
    if (className === "project-gallery")
    {
        const columns = Number.isInteger(block.columns) && block.columns >= 1 && block.columns <= 3 ? block.columns : 2;
        const gap = Number.isFinite(block.gap) ? Math.min(120, Math.max(0, block.gap)) : 16;
        group.style.setProperty("--gallery-columns", String(columns));
        group.style.setProperty("--gallery-gap", `${gap}px`);
    }
    const items = Array.isArray(block.items) ? block.items.slice(0, maximum) : [];
    for (const item of items)
    {
        const figure = item && renderImage(item, project, context);
        if (figure) group.appendChild(figure);
    }
    return group.children.length ? group : null;
}

function renderLinks(block, project, context)
{
    const items = Array.isArray(block.items) ? block.items : [];
    const section = context.doc.createElement("section");
    section.className = "project-list-block project-links-block";
    const heading = context.doc.createElement("h3");
    heading.textContent = textValue(block.title) || "Materials";
    const list = context.doc.createElement("ul");
    for (const item of items)
    {
        if (!item || typeof item !== "object") continue;
        const title = textValue(item.title) || textValue(item.label);
        const url = safeExternalUrl(item.url);
        if (!title && !url) continue;
        const row = context.doc.createElement("li");
        const label = url ? context.doc.createElement("a") : context.doc.createElement("span");
        label.textContent = title || url;
        if (url)
        {
            label.href = url;
            label.target = "_blank";
            label.rel = "noopener noreferrer";
        }
        row.appendChild(label);
        const description = textValue(item.description);
        if (description)
        {
            const detail = context.doc.createElement("p");
            detail.textContent = description;
            row.appendChild(detail);
        }
        list.appendChild(row);
    }
    if (!list.children.length) return null;
    section.append(heading, list);
    return section;
}

function renderExhibitions(block, project, context)
{
    const items = Array.isArray(block.items) ? block.items : [];
    const section = context.doc.createElement("section");
    section.className = "project-list-block project-exhibitions";
    const heading = context.doc.createElement("h3");
    heading.textContent = textValue(block.title) || "Exhibitions and presentations";
    const list = context.doc.createElement("ul");
    for (const item of items)
    {
        if (!item || typeof item !== "object") continue;
        const parts = [item.title, item.venue, item.city, item.country].map(textValue).filter(Boolean);
        const date = textValue(item.date) || textValue(item.year);
        const description = textValue(item.description);
        if (!date && !parts.length && !description) continue;
        const row = context.doc.createElement("li");
        if (date)
        {
            const time = context.doc.createElement("time");
            time.textContent = date;
            row.appendChild(time);
        }
        const details = context.doc.createElement("div");
        const url = safeExternalUrl(item.url);
        const main = url ? context.doc.createElement("a") : context.doc.createElement("span");
        main.textContent = parts.join(" · ") || description;
        if (url)
        {
            main.href = url;
            main.target = "_blank";
            main.rel = "noopener noreferrer";
        }
        details.appendChild(main);
        if (description && parts.length)
        {
            const note = context.doc.createElement("p");
            note.textContent = description;
            details.appendChild(note);
        }
        row.appendChild(details);
        list.appendChild(row);
    }
    if (!list.children.length) return null;
    section.append(heading, list);
    return section;
}

const blockRenderers = {
    text(block, project, context)
    {
        const container = context.doc.createElement("div");
        container.className = "project-text";
        if (!renderRichText(container, block.richText, context.doc))
        {
            const paragraph = context.doc.createElement("p");
            paragraph.textContent = typeof block.text === "string" ? block.text : "";
            container.appendChild(paragraph);
        }
        return container;
    },
    image: renderImage,
    imagePair(block, project, context)
    {
        return renderMediaGroup(block, project, context, "project-image-pair", 2);
    },
    "image-pair"(block, project, context)
    {
        return renderMediaGroup(block, project, context, "project-image-pair", 2);
    },
    gallery(block, project, context)
    {
        return renderMediaGroup(block, project, context, "project-gallery", Infinity);
    },
    video: renderVideo,
    youtube: renderVideo,
    vimeo: renderVideo,
    links: renderLinks,
    materials: renderLinks,
    exhibitions: renderExhibitions,
    spacer(block, project, context)
    {
        const spacer = context.doc.createElement("div");
        const size = ["small", "medium", "large"].includes(block.size) ? block.size : "medium";
        spacer.className = `project-spacer project-spacer-${size}`;
        spacer.setAttribute("aria-hidden", "true");
        return spacer;
    }
};

function renderMetadata(project, metadata, doc)
{
    metadata.replaceChildren();
    const author = normalizedProjectAuthor(project);
    if (author)
    {
        const authorHeading = doc.createElement("h1");
        authorHeading.className = "project-author";
        authorHeading.textContent = author.name;
        const titleHeading = doc.createElement("h2");
        titleHeading.className = "project-title";
        titleHeading.textContent = project.title || "Untitled project";
        metadata.append(authorHeading, titleHeading);
    }
    else
    {
        const titleHeading = doc.createElement("h1");
        titleHeading.className = "project-title";
        titleHeading.textContent = project.title || "Untitled project";
        metadata.appendChild(titleHeading);
    }
    for (const [label, value] of [
        ["Year", project.year],
        ["Project types", Array.isArray(project.projectTypes) ? project.projectTypes.join(" / ") : ""],
        ["Roles", Array.isArray(project.roles) ? project.roles.join(" / ") : ""]
    ])
    {
        if (!value) continue;
        const line = doc.createElement("p");
        line.className = `project-metadata-line project-metadata-${label.toLowerCase().replace(/\s+/g, "-")}`;
        line.textContent = `${label}: ${value}`;
        metadata.appendChild(line);
    }
}

// Render a supplied project object. Loading and persistence deliberately live
// outside this module so the same function can render saved data or a draft.
export function renderProject(project, options)
{
    if (!project || typeof project !== "object") throw new TypeError("Expected a project object.");
    const metadata = options?.metadataElement;
    const content = options?.contentElement;
    if (!metadata || !content) throw new TypeError("metadataElement and contentElement are required.");
    const doc = options.document || content.ownerDocument;
    const context = { doc, onImageZoom: options.onImageZoom };
    if (options.updateDocumentTitle !== false)
        doc.title = `${project.title || "Untitled project"} — Oleksandr Hants`;
    renderMetadata(project, metadata, doc);
    content.replaceChildren();
    for (const block of Array.isArray(project.content) ? project.content : [])
    {
        if (!block || typeof block !== "object" || !Object.hasOwn(blockRenderers, block.type)) continue;
        const element = blockRenderers[block.type](block, project, context);
        if (!element) continue;
        element.classList.add("project-block", `project-block-${block.type}`);
        if (typeof block.id === "string" && block.id.trim()) element.dataset.blockId = block.id.trim();
        setLanguage(element, block.language || block.lang);
        content.appendChild(element);
    }
}

// The zoom image is assigned only when opened, so `zoom` files are never
// downloaded during the initial project render.
export function createProjectImageZoom(doc = document)
{
    const dialog = doc.createElement("dialog");
    dialog.className = "project-lightbox";
    dialog.setAttribute("aria-label", "Image viewer");
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "project-lightbox-close";
    close.textContent = "Close ×";
    close.setAttribute("aria-label", "Close image viewer");
    const image = doc.createElement("img");
    image.className = "project-lightbox-image";
    const caption = doc.createElement("p");
    caption.className = "project-lightbox-caption";
    const credit = doc.createElement("p");
    credit.className = "project-lightbox-credit";
    dialog.append(close, image, caption, credit);
    doc.body.appendChild(dialog);
    let trigger = null;
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () =>
    {
        image.removeAttribute("src");
        image.alt = "";
        caption.textContent = "";
        credit.textContent = "";
        trigger?.focus();
        trigger = null;
    });
    return ({ src, alt, caption: captionText, credit: creditText, trigger: source }) =>
    {
        trigger = source || null;
        image.src = src;
        image.alt = alt || "Project image";
        caption.textContent = captionText || "";
        caption.hidden = !captionText;
        credit.textContent = creditText ? `Photo: ${creditText}` : "";
        credit.hidden = !creditText;
        dialog.showModal();
    };
}
