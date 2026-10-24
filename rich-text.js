const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{1,24})$/i;

export function safeRichTextUrl(value)
{
    if (typeof value !== "string" || !value.trim()) return "";
    try { const url = new URL(value.trim()); return SAFE_PROTOCOLS.has(url.protocol) ? url.href : ""; }
    catch { return ""; }
}

function cleanColor(value) { return typeof value === "string" && SAFE_COLOR.test(value.trim()) ? value.trim() : ""; }

export function normalizeRichText(value)
{
    if (!value || value.version !== 1 || !Array.isArray(value.paragraphs)) return null;
    const paragraphs = value.paragraphs.slice(0, 500).map(paragraph =>
    {
        const runs = Array.isArray(paragraph?.runs) ? paragraph.runs : [];
        return { runs:runs.slice(0, 5000).flatMap(run =>
        {
            if (!run || typeof run.text !== "string" || !run.text) return [];
            const clean = { text:run.text.slice(0, 100000) };
            for (const mark of ["bold", "italic", "underline", "strike"]) if (run[mark] === true) clean[mark] = true;
            const href = safeRichTextUrl(run.href); if (href) clean.href = href;
            const color = cleanColor(run.color); if (color) clean.color = color;
            const highlight = cleanColor(run.highlight); if (highlight) clean.highlight = highlight;
            return [clean];
        }) };
    });
    return { version:1, paragraphs:paragraphs.length ? paragraphs : [{ runs:[] }] };
}

export function plainTextToRichText(text)
{
    const source = typeof text === "string" ? text : "";
    return { version:1, paragraphs:source.split(/\r?\n/).map(line => ({ runs:line ? [{ text:line }] : [] })) };
}

export function richTextToPlain(value)
{
    const rich = normalizeRichText(value);
    return rich ? rich.paragraphs.map(paragraph => paragraph.runs.map(run => run.text).join("")).join("\n") : "";
}

function appendRun(parent, run, doc)
{
    let node = doc.createTextNode(run.text);
    const wrap = (tag, configure) => { const element = doc.createElement(tag); configure?.(element); element.appendChild(node); node = element; };
    if (run.bold) wrap("strong");
    if (run.italic) wrap("em");
    if (run.underline) wrap("u");
    if (run.strike) wrap("s");
    if (run.color || run.highlight) wrap("span", element => { if (run.color) element.style.color = run.color; if (run.highlight) element.style.backgroundColor = run.highlight; });
    if (run.href) wrap("a", element => { element.href = run.href; element.target = "_blank"; element.rel = "noopener noreferrer"; });
    parent.appendChild(node);
}

export function renderRichText(container, value, doc = container.ownerDocument)
{
    const rich = normalizeRichText(value);
    if (!rich) return false;
    container.replaceChildren();
    for (const paragraph of rich.paragraphs)
    {
        const element = doc.createElement("p");
        for (const run of paragraph.runs) appendRun(element, run, doc);
        if (!paragraph.runs.length) element.appendChild(doc.createElement("br"));
        container.appendChild(element);
    }
    return true;
}

function inheritedMarks(node, marks)
{
    const next = { ...marks }; const tag = node.nodeName.toLowerCase();
    if (["b", "strong"].includes(tag)) next.bold = true;
    if (["i", "em"].includes(tag)) next.italic = true;
    if (tag === "u") next.underline = true;
    if (["s", "strike", "del"].includes(tag)) next.strike = true;
    if (tag === "a") { const href = safeRichTextUrl(node.getAttribute("href")); if (href) next.href = href; }
    const style = node.style;
    if (style)
    {
        if (/bold|[6-9]00/.test(style.fontWeight)) next.bold = true;
        if (style.fontStyle === "italic") next.italic = true;
        if (style.textDecorationLine.includes("underline")) next.underline = true;
        if (style.textDecorationLine.includes("line-through")) next.strike = true;
        const color = cleanColor(style.color || node.getAttribute("color")); if (color) next.color = color;
        const highlight = cleanColor(style.backgroundColor); if (highlight && highlight !== "transparent") next.highlight = highlight;
    }
    return next;
}

function paragraphRuns(node)
{
    const runs = [];
    const visit = (child, marks = {}) =>
    {
        if (child.nodeType === Node.TEXT_NODE) { if (child.data) runs.push({ text:child.data, ...marks }); return; }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (child.nodeName === "BR") { runs.push({ text:"\n", ...marks }); return; }
        const next = inheritedMarks(child, marks);
        for (const nested of child.childNodes) visit(nested, next);
    };
    visit(node); return runs;
}

export function richTextFromElement(root)
{
    const paragraphs = []; let inline = [];
    const flush = () => { paragraphs.push({ runs:inline }); inline = []; };
    for (const child of root.childNodes)
    {
        if (child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes(child.nodeName)) { if (inline.length) flush(); paragraphs.push({ runs:paragraphRuns(child) }); }
        else inline.push(...paragraphRuns(child));
    }
    if (inline.length) flush();
    return normalizeRichText({ version:1, paragraphs:paragraphs.length ? paragraphs : [{ runs:[] }] });
}

export function populateRichTextEditor(editor, value, fallbackText = "")
{
    renderRichText(editor, normalizeRichText(value) || plainTextToRichText(fallbackText), editor.ownerDocument);
}
