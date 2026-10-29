import { populateRichTextEditor, richTextFromElement, richTextToPlain, safeRichTextUrl } from '../rich-text.js';
import { DEFAULT_PROJECT_STYLES, PROJECT_STYLE_ELEMENTS, normalizeProjectStyles } from '../project-styles.js';

const $ = selector => document.querySelector(selector);
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();
const labels = { text:'Text · Текст', image:'Image · Изображение', imagePair:'Image pair · Два изображения', 'image-pair':'Image pair · Два изображения', gallery:'Gallery · Галерея', video:'Video · Видео', youtube:'Video · YouTube', vimeo:'Video · Vimeo', links:'Links / Materials', materials:'Links / Materials', exhibitions:'Exhibitions · Выставки', spacer:'Spacer · Отступ' };
const DRAFT_STORAGE_KEY = 'portfolio-editor-draft-v1';
const VOCABULARY_STORAGE_KEY = 'portfolio-editor-vocabulary-v1';
const SPLIT_STORAGE_KEY = 'portfolio-editor-split-v1';
const STYLES_DRAFT_STORAGE_KEY = 'portfolio-editor-styles-draft-v1';
const EDITOR_UI_STORAGE_KEY = 'portfolio-editor-ui-v2';
const IMAGE_LIBRARY_LAYOUT_STORAGE_KEY = 'portfolio-editor-image-library-layout-v1';
let data, revision, token, assets = [], assetLibrary = [], conversionManifest = {found:false,supported:false,paths:[]}, draft = null, baseline = '', saving = false, dragged = null;
let stylesDraft = normalizeProjectStyles(null), stylesBaseline = '', stylesRevision = 'missing', view = 'projects';
let vocabulary = { projectTypes:[], roles:[] };
let editorUi = loadEditorUi();
const projectDirty = () => draft && JSON.stringify(draft) !== baseline;
const stylesDirty = () => JSON.stringify(stylesDraft) !== stylesBaseline;
const dirty = () => view === 'styles' ? stylesDirty() : projectDirty();
const anyDirty = () => projectDirty() || stylesDirty();
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function updateStatus() { $('#save').disabled = (view === 'projects' && !draft) || saving || !dirty(); status(dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены'); }
function preview() { try { if (draft) $('#preview').contentWindow.renderDraft?.(clone(draft), clone(stylesDraft)); } catch (error) { status('Предпросмотр: ' + error.message, true); } }
let previewTimer;
function changed() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 160); updateStatus(); persistDraft(); const selected = $('#projects button.active'); if (selected) selected.textContent = draft.title || 'Без названия'; }
function persistDraft() { try { if (draft) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft, baseline, revision })); } catch { /* Save remains available if browser storage is full. */ } }
function persistStylesDraft() { try { localStorage.setItem(STYLES_DRAFT_STORAGE_KEY, JSON.stringify({ draft:stylesDraft, baseline:stylesBaseline, revision:stylesRevision })); } catch { /* Saving to disk remains available. */ } }
function loadEditorUi() { try { const value = JSON.parse(localStorage.getItem(EDITOR_UI_STORAGE_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
function persistEditorUi() { try { localStorage.setItem(EDITOR_UI_STORAGE_KEY, JSON.stringify(editorUi)); } catch { /* Interface preferences are optional. */ } }
function projectUi() {
    if (!draft?.id) return { collapsedBlocks:[], collapsedGalleryItems:{}, blockFilter:'all' };
    const current = editorUi[draft.id] && typeof editorUi[draft.id] === 'object' ? editorUi[draft.id] : {};
    current.collapsedBlocks = Array.isArray(current.collapsedBlocks) ? current.collapsedBlocks : [];
    current.collapsedGalleryItems = current.collapsedGalleryItems && typeof current.collapsedGalleryItems === 'object' ? current.collapsedGalleryItems : {};
    current.blockFilter = ['all','active','hidden','text','images','other'].includes(current.blockFilter) ? current.blockFilter : 'all';
    editorUi[draft.id] = current;
    return current;
}
function setCollapsedBlock(blockId, collapsed) { const ui=projectUi(); const values=new Set(ui.collapsedBlocks); collapsed ? values.add(blockId) : values.delete(blockId); ui.collapsedBlocks=[...values]; persistEditorUi(); }
function galleryItemKey(block, item, index) { return typeof item?.id === 'string' && item.id ? item.id : mediaPath(item) ? `media:${mediaPath(item)}` : `index:${index}`; }
function setCollapsedGalleryItem(block, key, collapsed) { const ui=projectUi(); const values=new Set(ui.collapsedGalleryItems[block.id] || []); collapsed ? values.add(key) : values.delete(key); ui.collapsedGalleryItems[block.id]=[...values]; persistEditorUi(); }
async function api(url, body) {
    const response = await fetch(url, body ? { method:'POST', headers:{'Content-Type':'application/json','X-Editor-Token':token}, body:JSON.stringify(body) } : {});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Ошибка сервера'); return result;
}
async function refreshAssets() { const media=await api('/api/assets'); assets=media.files; assetLibrary=media.assets || assets.map(path => ({path,name:path.split('/').pop(),preview:path,large:path,zoom:path})); conversionManifest=media.conversionManifest || {found:false,supported:false,paths:[]}; return media; }
async function importImageFiles(fileList, dialog) {
    const selected=[...fileList];
    const files=selected.filter(file => /\.(?:jpe?g|png|webp|avif)$/i.test(file.name) || file.name.toLocaleLowerCase() === 'conversion-manifest.json');
    if(!files.length) throw new Error('В выбранной папке нет поддерживаемых изображений или conversion-manifest.json.');
    for(const [index,file] of files.entries()) {
        status(`Импорт ${index+1}/${files.length}: ${file.name}…`);
        const response=await fetch('/api/assets/import',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Editor-Token':token,'X-File-Name':encodeURIComponent(file.name),'X-Relative-Path':encodeURIComponent(file.webkitRelativePath || file.name)},body:file});
        const result=await response.json(); if(!response.ok) throw new Error(result.error || `Не удалось импортировать ${file.name}`);
    }
    await refreshAssets(); updateManifestMessage(dialog); dialog.querySelector('[data-search]').dispatchEvent(new Event('input',{bubbles:true})); renderBlocks();
    const imageCount=files.filter(file=>file.name.toLocaleLowerCase() !== 'conversion-manifest.json').length;
    const manifestCount=files.length-imageCount;
    const skipped=selected.length-files.length;
    status(`Импортировано изображений: ${imageCount}${manifestCount ? `; manifest: ${manifestCount}` : ''}${skipped ? `; пропущено неподдерживаемых файлов: ${skipped}` : ''}`);
}
function button(text, action, parent) { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.onclick = action; parent.append(element); return element; }
function field(parent, object, key, label, options = {}) {
    const wrap = document.createElement('label'); wrap.textContent = label;
    const input = document.createElement(options.multiline ? 'textarea' : options.choices ? 'select' : 'input');
    if (options.choices) for (const [value, title] of options.choices) { const option = document.createElement('option'); option.value = value; option.textContent = title; input.append(option); }
    input.value = Array.isArray(object[key]) ? object[key].join(', ') : object[key] ?? '';
    if (options.number && !options.choices) { input.type = 'number'; if (options.min !== undefined) input.min = options.min; if (options.max !== undefined) input.max = options.max; if (options.step !== undefined) input.step = options.step; }
    if (options.check) { input.type = 'checkbox'; input.checked = object[key] === true; wrap.className = 'check'; }
    input.addEventListener('input', () => { object[key] = options.check ? input.checked : options.number ? Number(input.value) : input.value; changed(); });
    wrap.append(input); parent.append(wrap); return input;
}

function help(parent, text) { const note = document.createElement('p'); note.className = 'field-help'; note.textContent = text; parent.append(note); }
function normalizedValue(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
function uniqueValues(values) {
    const result = []; const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) { const clean = normalizedValue(value); const key = clean.toLocaleLowerCase(); if (clean && !seen.has(key)) { seen.add(key); result.push(clean); } }
    return result;
}
function loadVocabulary() {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(VOCABULARY_STORAGE_KEY) || '{}'); } catch { /* Ignore corrupt optional preferences. */ }
    for (const key of ['projectTypes','roles']) vocabulary[key] = uniqueValues([...(saved[key] || []), ...data.projects.flatMap(project => project[key] || [])]);
}
function persistVocabulary() { try { localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(vocabulary)); } catch { /* Project editing remains available. */ } }
function multiValueField(parent, object, key, label) {
    const root = document.createElement('div'); root.className = 'multi-value-field'; root.dataset.field = key;
    const title = document.createElement('span'); title.className = 'multi-value-label'; title.textContent = label;
    const control = document.createElement('div'); control.className = 'multi-value-control';
    const chips = document.createElement('div'); chips.className = 'multi-value-chips';
    const input = document.createElement('input'); input.className = 'multi-value-search'; input.type = 'search'; input.placeholder = 'Найти или добавить…'; input.setAttribute('aria-label', `${label}: поиск или новое значение`); input.autocomplete = 'off';
    const options = document.createElement('div'); options.className = 'multi-value-options'; options.hidden = true;
    control.append(chips, input); root.append(title, control, options); parent.append(root);
    const selected = () => uniqueValues(object[key]);
    const known = value => vocabulary[key].find(item => item.toLocaleLowerCase() === value.toLocaleLowerCase());
    const add = raw => {
        const clean = normalizedValue(raw); if (!clean) return;
        const canonical = known(clean) || clean; const values = selected();
        if (!values.some(value => value.toLocaleLowerCase() === canonical.toLocaleLowerCase())) values.push(canonical);
        object[key] = values;
        if (!known(canonical)) { vocabulary[key].push(canonical); vocabulary[key] = uniqueValues(vocabulary[key]); persistVocabulary(); }
        input.value = ''; render(); changed(); input.focus();
    };
    const remove = value => { object[key] = selected().filter(item => item.toLocaleLowerCase() !== value.toLocaleLowerCase()); render(); changed(); };
    const render = () => {
        chips.replaceChildren();
        for (const value of selected()) { const chip = button(value, () => remove(value), chips); chip.className = 'multi-value-chip'; chip.setAttribute('aria-label', `Удалить ${value}`); }
        const query = normalizedValue(input.value).toLocaleLowerCase(); const selectedKeys = new Set(selected().map(value => value.toLocaleLowerCase()));
        const matches = vocabulary[key].filter(value => !selectedKeys.has(value.toLocaleLowerCase()) && (!query || value.toLocaleLowerCase().includes(query)));
        options.replaceChildren();
        for (const value of matches) { const option = button(value, () => add(value), options); option.className = 'multi-value-option'; option.addEventListener('mousedown', event => event.preventDefault()); }
        const raw = normalizedValue(input.value);
        if (raw && !known(raw) && !selectedKeys.has(raw.toLocaleLowerCase())) { const create = button(`Добавить «${raw}»`, () => add(raw), options); create.className = 'multi-value-option'; create.addEventListener('mousedown', event => event.preventDefault()); }
        options.hidden = document.activeElement !== input || !options.children.length;
    };
    input.addEventListener('focus', render); input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(() => { options.hidden = true; }, 0));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add(input.value || options.firstElementChild?.textContent); } if (event.key === 'Escape') { options.hidden = true; input.blur(); } });
    render();
}
function mediaPath(media) { return ['preview','src','large','zoom'].map(key => media?.[key]).find(value => typeof value === 'string' && value) || ''; }
function applyLibraryAsset(media, asset) {
    for (const key of ['src','preview','large','zoom']) delete media[key];
    if(asset.source) media.src=asset.source;
    for (const key of ['preview','large','zoom']) if(asset[key]) media[key]=asset[key];
    if(!media.src && !media.preview && !media.large && !media.zoom) media.preview=asset.path;
}
function updateManifestMessage(dialog) {
    const message=dialog.querySelector('[data-manifest]'); if(!message) return;
    if(conversionManifest.found) {
        const count=conversionManifest.paths?.length || 1;
        message.textContent=`Найдено conversion-manifest.json: ${count}. Файлы сохранены вместе с импортированными наборами. Формат manifest пока не документирован, поэтому безопасное сопоставление Preview / Large / Zoom выполняется по явным суффиксам имён.`;
    } else message.textContent='conversion-manifest.json не найден внутри assets. Import images выбирает только изображения; чтобы включить manifest, импортируйте всю исходную папку через Import folder. Обычные изображения продолжат работать через fallback.';
}
function mediaItemsForBlock(block) {
    if (['gallery','imagePair','image-pair'].includes(block?.type)) return Array.isArray(block.items) ? block.items : [];
    return block?.type === 'image' ? [block] : [];
}
function buildAssetUsage() {
    const usage=new Map(assetLibrary.map(asset=>[asset.path,[]])); const assetsByPath=new Map();
    for(const asset of assetLibrary) for(const value of [asset.path,asset.source,asset.preview,asset.large,asset.zoom]) if(value) { const matches=assetsByPath.get(value) || new Set(); matches.add(asset.path); assetsByPath.set(value,matches); }
    const scan=(project,isDraft=false) => {
        for(const [blockIndex,block] of (project.content || []).entries()) for(const media of mediaItemsForBlock(block)) {
            const matched=new Set(); for(const value of [media?.src,media?.preview,media?.large,media?.zoom]) for(const assetPath of assetsByPath.get(value) || []) matched.add(assetPath);
            for(const assetPath of matched) usage.get(assetPath)?.push({projectId:project.id,projectTitle:project.title || 'Без названия',blockId:block.id,blockIndex,type:block.type,hidden:block.enabled === false,draft:isDraft,archive:block.enabled !== false && media?.showInArchive === true,threeD:block.enabled !== false && media?.showIn3D === true});
        }
    };
    const currentIsDraft=Boolean(draft && projectDirty());
    for(const project of data.projects) if(!(currentIsDraft && project.id === draft.id)) scan(project,false);
    if(currentIsDraft) scan(draft,true);
    return usage;
}
function usageStatus(references) {
    if(!references.length) return {key:'unused',label:'Unused'};
    const active=references.filter(reference=>!reference.hidden);
    if(!active.length) return {key:'hidden',label:'Used in hidden blocks'};
    if(active.every(reference=>reference.draft)) return {key:'draft',label:'In draft'};
    return {key:'used',label:'Used'};
}
function usageProjectIds(references) { return new Set(references.map(reference=>reference.projectId)); }
function assetOrientation(asset) { if(!asset.width || !asset.height) return 'unknown'; const ratio=asset.width/asset.height; return ratio>1.05 ? 'landscape' : ratio<.95 ? 'portrait' : 'square'; }
async function hydrateAssetDimensions(items) {
    await Promise.all(items.filter(asset=>!asset.width || !asset.height).map(asset=>new Promise(resolve=>{ const image=new Image(); image.onload=()=>{asset.width=image.naturalWidth;asset.height=image.naturalHeight;resolve();}; image.onerror=resolve; image.src='/'+(asset.preview || asset.source || asset.path); })));
}
const libraryLayoutControllers=new WeakMap();
function initializeImageLibraryLayout(dialog) {
    let stored={}; try { stored=JSON.parse(localStorage.getItem(IMAGE_LIBRARY_LAYOUT_STORAGE_KEY) || '{}'); } catch { /* Use defaults. */ }
    const state={width:Number(stored.width)||1100,height:Number(stored.height)||760,split:Number(stored.split)||.68,maximized:stored.maximized===true}; let applying=false; let suppressResizeUntil=0;
    const body=dialog.querySelector('.image-library-body'); const divider=dialog.querySelector('[data-library-divider]'); const maximize=dialog.querySelector('[data-maximize]');
    const persist=()=>{try{localStorage.setItem(IMAGE_LIBRARY_LAYOUT_STORAGE_KEY,JSON.stringify(state));}catch{/* Optional interface state. */}};
    const applySplit=()=>{if(innerWidth<=760)return;const available=body.clientWidth-divider.offsetWidth;const minimumGrid=Math.min(240,available/2);const minimumPreview=Math.min(220,available/2);const width=Math.min(available-minimumPreview,Math.max(minimumGrid,available*state.split));body.style.setProperty('--image-library-grid-width',`${width}px`);divider.setAttribute('aria-valuenow',String(Math.round(width/available*100)));};
    const apply=()=>{if(!dialog.open)return;applying=true;suppressResizeUntil=performance.now()+150;const maxWidth=Math.max(280,innerWidth-24),maxHeight=Math.max(360,innerHeight-24);dialog.classList.toggle('maximized',state.maximized);dialog.style.width=`${state.maximized?maxWidth:Math.min(maxWidth,Math.max(Math.min(620,maxWidth),state.width))}px`;dialog.style.height=`${state.maximized?maxHeight:Math.min(maxHeight,Math.max(Math.min(480,maxHeight),state.height))}px`;maximize.textContent=state.maximized?'Restore':'Maximize';maximize.setAttribute('aria-pressed',String(state.maximized));requestAnimationFrame(()=>{applySplit();applying=false;});setTimeout(()=>{if(!dialog.open||state.maximized)return;const box=dialog.getBoundingClientRect();state.width=Math.round(box.width);state.height=Math.round(box.height);persist();},160);};
    maximize.onclick=()=>{state.maximized=!state.maximized;persist();apply();};
    const setSplit=event=>{const box=body.getBoundingClientRect();const available=body.clientWidth-divider.offsetWidth;state.split=Math.min(.8,Math.max(.35,(event.clientX-box.left)/available));applySplit();};
    divider.addEventListener('pointerdown',event=>{divider.setPointerCapture(event.pointerId);divider.classList.add('is-dragging');setSplit(event);});
    divider.addEventListener('pointermove',event=>{if(divider.hasPointerCapture(event.pointerId))setSplit(event);});
    divider.addEventListener('pointerup',event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);divider.classList.remove('is-dragging');persist();});
    divider.addEventListener('pointercancel',()=>divider.classList.remove('is-dragging'));
    divider.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();state.split=event.key==='Home'?.68:Math.min(.8,Math.max(.35,state.split+(event.key==='ArrowRight'?.025:-.025)));applySplit();persist();});
    const observer=new ResizeObserver(()=>{if(!dialog.open)return;if(!applying&&!state.maximized&&performance.now()>=suppressResizeUntil){const box=dialog.getBoundingClientRect();state.width=Math.round(box.width);state.height=Math.round(box.height);persist();}applySplit();}); observer.observe(dialog);
    window.addEventListener('resize',apply); libraryLayoutControllers.set(dialog,{apply});
}
function focusUsageReference(reference, dialog) {
    if(reference.projectId !== draft?.id) {
        if(anyDirty()) { status('Сохраните текущие изменения перед переходом к другому проекту.',true); return; }
        const project=data.projects.find(item=>item.id===reference.projectId); if(!project) return; if(!selectProject(project)) return;
    }
    const ui=projectUi(); ui.blockFilter='all'; ui.collapsedBlocks=ui.collapsedBlocks.filter(id=>id!==reference.blockId); persistEditorUi(); renderBlocks(); dialog.close();
    requestAnimationFrame(()=>document.querySelector(`.block[data-id="${CSS.escape(reference.blockId)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}));
}
function ensureImageLibrary() {
    let dialog = $('#image-library'); if (dialog) return dialog;
    dialog = document.createElement('dialog'); dialog.id = 'image-library'; dialog.className = 'image-library'; dialog.innerHTML = `<div class="image-library-heading"><h2>Choose image · Выбрать изображение</h2><div class="image-library-window-actions"><button type="button" data-maximize aria-pressed="false">Maximize</button><button type="button" data-close>Закрыть</button></div></div><div class="image-library-tools"><label>Поиск по имени<input type="search" data-search placeholder="Имя файла…"></label><label>Использование<select data-usage-filter><option value="all">All images</option><option value="used">Used</option><option value="unused">Unused</option><option value="current">Used in current project</option><option value="selected">Used in selected project</option></select></label><label data-project-filter-label hidden>Проект<select data-project-filter></select></label><label>Ориентация<select data-orientation><option value="all">All</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square</option></select></label><label>Сортировка<select data-sort><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option></select></label><button type="button" data-import-files>Import images · Импортировать изображения</button><button type="button" data-import-folder>Import folder · Импортировать папку</button></div><p class="image-library-message" data-manifest></p><div class="image-library-body"><div class="image-library-grid" data-grid></div><div class="image-library-divider" data-library-divider role="separator" aria-label="Изменить ширину сетки и предпросмотра" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="80" tabindex="0"></div><aside class="image-library-preview"><img data-preview alt=""><strong data-name>Выберите изображение</strong><span data-resolution></span><span data-date></span><div class="image-library-variants" data-variants></div><div class="image-library-usage" data-usage></div></aside></div><div class="image-library-actions"><span data-count></span><button type="button" class="primary" data-confirm disabled>Выбрать</button></div>`;
    const files=document.createElement('input'); files.type='file'; files.accept='.jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif'; files.multiple=true; files.hidden=true;
    const folder=files.cloneNode(); folder.removeAttribute('accept'); folder.setAttribute('webkitdirectory',''); folder.setAttribute('directory','');
    dialog.append(files,folder); dialog.querySelector('[data-import-files]').onclick=()=>files.click(); dialog.querySelector('[data-import-folder]').onclick=()=>folder.click();
    for(const input of [files,folder]) input.addEventListener('change',async()=>{ try{await importImageFiles(input.files,dialog);}catch(error){status(error.message,true);}finally{input.value='';} });
    dialog.querySelector('[data-close]').onclick = () => dialog.close(); dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); }); document.body.append(dialog); initializeImageLibraryLayout(dialog); return dialog;
}
function openImageLibrary({multiple=false,onConfirm}) {
    const dialog = ensureImageLibrary(); const grid = dialog.querySelector('[data-grid]'); const search = dialog.querySelector('[data-search]'); const confirm = dialog.querySelector('[data-confirm]'); const count = dialog.querySelector('[data-count]'); const previewImage = dialog.querySelector('[data-preview]'); const name = dialog.querySelector('[data-name]'); const resolution = dialog.querySelector('[data-resolution]'); const date = dialog.querySelector('[data-date]'); const variants = dialog.querySelector('[data-variants]'); const usageDetails=dialog.querySelector('[data-usage]'); const usageFilter=dialog.querySelector('[data-usage-filter]'); const projectFilter=dialog.querySelector('[data-project-filter]'); const projectFilterLabel=dialog.querySelector('[data-project-filter-label]'); const orientation=dialog.querySelector('[data-orientation]'); const sort=dialog.querySelector('[data-sort]');
    updateManifestMessage(dialog);
    const selected = new Set(); let focused = null; let usage=buildAssetUsage();
    const projects=[...data.projects]; if(draft && !projects.some(project=>project.id===draft.id)) projects.push(draft); projectFilter.replaceChildren(...projects.map(project=>new Option(project.title || 'Без названия',project.id))); projectFilter.value=draft?.id || projects[0]?.id || '';
    const showPreview = asset => {
        focused = asset; const fallback=asset.source || asset.path; const references=usage.get(asset.path) || []; previewImage.src = '/' + (asset.preview || fallback); previewImage.alt = asset.name; name.textContent = asset.name; variants.replaceChildren();
        for(const [key,label] of [['preview','Preview'],['large','Large'],['zoom','Zoom']]) { const line=document.createElement('span'); const actual=asset[key]; line.textContent=actual ? `${label}: найден · ${actual.split('/').pop()}` : `${label}: fallback · ${fallback.split('/').pop()}`; line.dataset.variantStatus=actual ? 'found' : 'fallback'; variants.append(line); }
        resolution.textContent = ''; previewImage.onload = () => { asset.width=previewImage.naturalWidth; asset.height=previewImage.naturalHeight; resolution.textContent = `${previewImage.naturalWidth} × ${previewImage.naturalHeight} px · ${assetOrientation(asset)}`; };
        date.textContent=asset.importedAt ? `${asset.dateSource === 'imported' ? 'Imported' : 'Approximate file date'}: ${new Date(asset.importedAt).toLocaleString()}` : 'Import date unknown';
        usageDetails.replaceChildren(); const usageHeading=document.createElement('strong'); const statusValue=usageStatus(references); usageHeading.textContent=`${statusValue.label}${references.length ? ` · ${usageProjectIds(references).size} project(s)` : ''}`; usageDetails.append(usageHeading);
        for(const reference of references) { const row=document.createElement('div'); row.className='image-usage-reference'; const open=button(reference.projectTitle,()=>focusUsageReference(reference,dialog),row); open.className='image-usage-project'; const detail=document.createElement('span'); detail.textContent=`${labels[reference.type] || reference.type} · Block ${reference.blockIndex+1}${reference.hidden ? ' · Hidden' : ''}${reference.draft ? ' · Draft' : ''}${reference.archive ? ' · Archive' : ''}${reference.threeD ? ' · 3D' : ''}`; row.append(detail); usageDetails.append(row); }
    };
    const update = visibleCount => { count.textContent = `${visibleCount} image(s)${selected.size ? ` · Выбрано: ${selected.size}` : ''}`; confirm.disabled = !selected.size; grid.querySelectorAll('.image-library-item').forEach(tile => { const active = selected.has(tile.dataset.path); tile.classList.toggle('selected',active); tile.setAttribute('aria-pressed',String(active)); }); };
    const render = () => {
        usage=buildAssetUsage(); const query = normalizedValue(search.value).toLocaleLowerCase(); projectFilterLabel.hidden=usageFilter.value!=='selected';
        const matchesUsage=references=>usageFilter.value==='all' || usageFilter.value==='used'&&references.length>0 || usageFilter.value==='unused'&&references.length===0 || usageFilter.value==='current'&&references.some(reference=>reference.projectId===draft?.id) || usageFilter.value==='selected'&&references.some(reference=>reference.projectId===projectFilter.value);
        const items=assetLibrary.filter(asset=>{ const references=usage.get(asset.path) || []; return (!query || asset.name.toLocaleLowerCase().includes(query) || asset.path.toLocaleLowerCase().includes(query)) && matchesUsage(references) && (orientation.value==='all' || assetOrientation(asset)===orientation.value); });
        items.sort((a,b)=>sort.value==='name-asc' ? a.name.localeCompare(b.name) : sort.value==='name-desc' ? b.name.localeCompare(a.name) : sort.value==='oldest' ? String(a.importedAt || '9999').localeCompare(String(b.importedAt || '9999')) : String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
        grid.replaceChildren(); for (const asset of items) { const references=usage.get(asset.path) || []; const state=usageStatus(references); const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'image-library-item'; tile.dataset.path = asset.path; tile.dataset.usageStatus=state.key; tile.dataset.orientation=assetOrientation(asset); tile.setAttribute('aria-pressed','false'); const img = document.createElement('img'); img.src = '/' + (asset.preview || asset.path); img.alt = ''; img.loading = 'lazy'; img.onload=()=>{asset.width=img.naturalWidth;asset.height=img.naturalHeight;tile.dataset.orientation=assetOrientation(asset);}; const caption = document.createElement('span'); caption.className='image-library-name'; caption.textContent = asset.name; const badge=document.createElement('small'); badge.className='image-usage-badge'; badge.textContent=state.label; tile.append(img,caption,badge); tile.onclick = () => { if (!multiple) selected.clear(); if (multiple && selected.has(asset.path)) selected.delete(asset.path); else selected.add(asset.path); showPreview(asset); update(items.length); }; tile.ondblclick = () => showPreview(asset); grid.append(tile); } update(items.length); if(focused && items.includes(focused)) showPreview(focused);
    };
    search.value = ''; usageFilter.value='all'; orientation.value='all'; sort.value='newest'; search.oninput=render; usageFilter.onchange=render; projectFilter.onchange=render; sort.onchange=render; orientation.onchange=async()=>{render();if(orientation.value!=='all'){await hydrateAssetDimensions(assetLibrary);if(dialog.open)render();}}; confirm.onclick = () => { const chosen = assetLibrary.filter(asset => selected.has(asset.path)); if (chosen.length) onConfirm(multiple ? chosen : chosen[0]); dialog.close(); };
    render(); dialog.showModal(); libraryLayoutControllers.get(dialog)?.apply(); search.focus();
}
function imageFields(parent, image) {
    const picker = document.createElement('div'); picker.className = 'image-picker-summary'; const current = mediaPath(image);
    const thumbnail = document.createElement('img'); thumbnail.alt = ''; if (current) thumbnail.src = '/' + current; else thumbnail.hidden = true;
    const choose = button('Choose image · Выбрать изображение',() => openImageLibrary({onConfirm:asset => { applyLibraryAsset(image,asset); renderBlocks(); changed(); }}),picker); choose.className = 'choose-image'; picker.prepend(thumbnail); parent.append(picker);
    const advanced = document.createElement('details'); advanced.className = 'image-advanced'; const summary = document.createElement('summary'); summary.textContent = 'Advanced · Preview / Large / Zoom'; advanced.append(summary); parent.append(advanced);
    for (const [key, label] of [['preview','Миниатюра · preview'],['large','На странице · large'],['zoom','Увеличение · zoom'], ...(image.src ? [['src','Исходное изображение (старый формат)']] : [])]) {
        const selected = field(advanced, image, key, label, { choices:[['','Не выбрано'], ...assets.map(file => [file, file.replace(/^assets\//,'')])] });
        if (image[key] && !assets.includes(image[key])) { const option = new Option(image[key] + ' (файл не найден)', image[key]); selected.add(option); selected.value = image[key]; }
    }
    field(parent, image, 'caption', 'Caption · Подпись изображения');
    help(parent, 'Видимая подпись под изображением на странице проекта.');
    field(parent, image, 'alt', 'Alt text · Описание для доступности');
    help(parent, 'Описывает содержание изображения для скринридеров; обычно визуально не отображается.');
    field(parent, image, 'description', 'Archive description · Описание в архиве', { multiline:true });
    help(parent, 'Дополнительный текст в полноэкранном просмотре Archive.');
    field(parent, image, 'credit', 'Photo credit · Автор фотографии');
    help(parent, 'Показывается в lightbox проекта и Archive только при заполненном значении.');
    field(parent, image, 'showInArchive', 'Показывать в архиве', { check:true });
    field(parent, image, 'showIn3D', 'Show in 3D objects · Показывать в 3D-объектах', { check:true });
    const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Подготовьте версии в Portfolio Image Converter и поместите их в assets. Кнопка обновления списка находится в данных проекта.'; parent.append(note);
}
function richTextField(parent, block) {
    const wrap = document.createElement('div'); wrap.className = 'rich-text-field';
    const label = document.createElement('span'); label.className = 'rich-text-label'; label.textContent = 'Текст';
    const toolbar = document.createElement('div'); toolbar.className = 'rich-text-toolbar'; toolbar.setAttribute('role','toolbar'); toolbar.setAttribute('aria-label','Форматирование текста');
    const editor = document.createElement('div'); editor.className = 'rich-text-editor'; editor.contentEditable = 'true'; editor.spellcheck = true; editor.setAttribute('role','textbox'); editor.setAttribute('aria-multiline','true');
    populateRichTextEditor(editor, block.richText, block.text);
    let savedRange = null;
    const remember = () => { const selection = getSelection(); if (selection?.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange(); };
    const restore = () => { if (!savedRange) return; const selection = getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); editor.focus(); };
    const sync = () => { block.richText = richTextFromElement(editor); block.text = richTextToPlain(block.richText); remember(); changed(); };
    const command = (name, value) => { restore(); document.execCommand(name, false, value); sync(); };
    const tool = (title, labelText, name) => { const control = button(labelText, () => command(name), toolbar); control.title = title; control.setAttribute('aria-label',title); control.addEventListener('mousedown', event => { event.preventDefault(); remember(); }); return control; };
    tool('Bold · Жирный','B','bold').classList.add('rich-bold');
    tool('Italic · Курсив','I','italic').classList.add('rich-italic');
    tool('Underline · Подчёркивание','U','underline').classList.add('rich-underline');
    tool('Strikethrough · Зачёркивание','S','strikeThrough').classList.add('rich-strike');
    const link = button('Link', () => { restore(); const selection = getSelection(); const anchor = selection?.anchorNode?.parentElement?.closest?.('a'); const value = prompt('Ссылка (оставьте пустой, чтобы удалить):', anchor?.href || 'https://'); if (value === null) return; const safe = safeRichTextUrl(value); if (!value.trim()) command('unlink'); else if (safe) command('createLink',safe); else alert('Разрешены только http, https и mailto ссылки.'); }, toolbar);
    link.addEventListener('mousedown', event => { event.preventDefault(); remember(); });
    const colorTool = (title, commandName, initial) => { const control = document.createElement('input'); control.type = 'color'; control.value = initial; control.title = title; control.setAttribute('aria-label',title); control.addEventListener('pointerdown',remember); control.addEventListener('input',() => command(commandName,control.value)); toolbar.append(control); };
    colorTool('Text color · Цвет текста','foreColor','#252525');
    colorTool('Highlight · Цвет фона','hiliteColor','#fff59d');
    const clear = button('Clear', () => { command('removeFormat'); command('unlink'); }, toolbar); clear.title = 'Clear formatting · Очистить форматирование'; clear.addEventListener('mousedown', event => { event.preventDefault(); remember(); });
    editor.addEventListener('input',sync);
    editor.addEventListener('keyup',remember); editor.addEventListener('mouseup',remember); editor.addEventListener('focus',remember);
    editor.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText',false,event.clipboardData.getData('text/plain')); });
    wrap.append(label,toolbar,editor); parent.append(wrap);
}
function itemsForm(parent, block, kind) {
    block.items ??= [];
    const collapsible = kind === 'image' && block.type === 'gallery';
    if (collapsible) {
        const controls=document.createElement('div'); controls.className='gallery-item-controls';
        button('Collapse all images',() => { projectUi().collapsedGalleryItems[block.id]=block.items.map((item,index)=>galleryItemKey(block,item,index)); persistEditorUi(); renderBlocks(); },controls);
        button('Expand all images',() => { projectUi().collapsedGalleryItems[block.id]=[]; persistEditorUi(); renderBlocks(); },controls);
        parent.append(controls);
    }
    const list = document.createElement('div'); parent.append(list);
    block.items.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'item'; list.append(row);
        const key=galleryItemKey(block,item,index); const collapsed=collapsible && (projectUi().collapsedGalleryItems[block.id] || []).includes(key); row.classList.toggle('collapsed',collapsed); row.dataset.itemKey=key;
        const heading = document.createElement('div'); heading.className = 'item-heading';
        const summary=document.createElement('div'); summary.className='item-summary';
        if (collapsible) { const thumb=document.createElement('img'); thumb.className='item-thumbnail'; thumb.alt=''; const source=mediaPath(item); if(source) thumb.src='/'+source; else thumb.hidden=true; summary.append(thumb); }
        const summaryText=document.createElement('span'); const file=mediaPath(item).split('/').pop(); summaryText.textContent=`${kind === 'image' ? 'Изображение' : 'Запись'} ${index + 1}${file ? ` · ${file}` : ''}`; summary.append(summaryText);
        if (collapsible && (item.showInArchive || item.showIn3D)) { const state=document.createElement('small'); state.textContent=[item.showInArchive&&'Archive',item.showIn3D&&'3D'].filter(Boolean).join(' · '); summary.append(state); }
        heading.append(summary); row.append(heading);
        const actions = document.createElement('div'); actions.className = 'actions'; heading.append(actions);
        const up = button('↑', () => { [block.items[index-1],block.items[index]] = [block.items[index],block.items[index-1]]; renderBlocks(); changed(); }, actions); up.disabled = index === 0;
        const down = button('↓', () => { [block.items[index+1],block.items[index]] = [block.items[index],block.items[index+1]]; renderBlocks(); changed(); }, actions); down.disabled = index === block.items.length-1;
        if (!['imagePair','image-pair'].includes(block.type)) button('Удалить', () => { if (confirm('Удалить запись? Файл изображения останется на диске.')) { block.items.splice(index,1); renderBlocks(); changed(); } }, actions);
        if (collapsible) { const toggle=button(collapsed ? 'Раскрыть' : 'Свернуть',() => { setCollapsedGalleryItem(block,key,!collapsed); renderBlocks(); },actions); toggle.className='item-collapse-toggle'; toggle.setAttribute('aria-expanded',String(!collapsed)); }
        const body=document.createElement('div'); body.className='item-body'; body.hidden=collapsed; row.append(body);
        if (kind === 'image') imageFields(body, item);
        else { for (const [fieldKey, label] of kind === 'links' ? [['title','Название'],['url','Ссылка'],['description','Описание']] : [['date','Дата или период'],['year','Год'],['title','Название выставки'],['venue','Площадка'],['city','Город'],['country','Страна'],['url','Ссылка'],['description','Описание']]) field(body, item, fieldKey, label); }
    });
    if (!['imagePair','image-pair'].includes(block.type)) {
        if (kind === 'image' && block.type === 'gallery') button('＋ Из библиотеки',() => openImageLibrary({multiple:true,onConfirm:selected => { for(const asset of selected){ const item={id:uid()}; applyLibraryAsset(item,asset); block.items.push(item); } renderBlocks(); changed(); }}),parent);
        button(kind === 'image' ? '＋ Изображение (пустое)' : '＋ Запись', () => { block.items.push({id:uid()}); renderBlocks(); changed(); }, parent);
    }
}
function move(index, delta) { const target = index + delta; if (target < 0 || target >= draft.content.length) return; [draft.content[index],draft.content[target]] = [draft.content[target],draft.content[index]]; renderBlocks(); changed(); }
function renewIds(object) { if (!object || typeof object !== 'object') return; if ('id' in object) object.id = uid(); if (Array.isArray(object.items)) object.items.forEach(renewIds); }
function blockSummary(block) {
    if (block.type === 'text') return ({en:'English',uk:'Ukrainian'})[block.language || block.lang] || richTextToPlain(block.richText) || block.text || 'Text';
    if (block.type === 'image') return mediaPath(block).split('/').pop() || 'No image';
    if (['gallery','imagePair','image-pair'].includes(block.type)) return `${block.items?.length || 0} image${block.items?.length === 1 ? '' : 's'}`;
    if (['video','youtube','vimeo'].includes(block.type)) return block.provider === 'vimeo' || block.type === 'vimeo' ? 'Vimeo' : 'YouTube';
    if (['links','materials','exhibitions'].includes(block.type)) return `${block.items?.length || 0} entr${block.items?.length === 1 ? 'y' : 'ies'}`;
    if (block.type === 'spacer') return Number.isFinite(block.units) ? `${block.units} units` : block.size || 'Spacer';
    return '';
}
function blockMatchesFilter(block, filter) {
    if (filter === 'all') return true;
    if (filter === 'active') return block.enabled !== false;
    if (filter === 'hidden') return block.enabled === false;
    if (filter === 'text') return block.type === 'text';
    if (filter === 'images') return ['image','imagePair','image-pair','gallery'].includes(block.type);
    return !['text','image','imagePair','image-pair','gallery'].includes(block.type);
}
function globalTextWidthLabel() { return stylesDraft.layout.fullContentWidth ? 'Full content width' : stylesDraft.layout.textColumnWidth === null ? 'Legacy 70ch' : `${stylesDraft.layout.textColumnWidth} px`; }
function blockWidthControls(parent, block) {
    if(!['text','links','materials','exhibitions'].includes(block.type)) return;
    const root=document.createElement('div'); root.className='block-width-control'; const title=document.createElement('strong'); title.textContent='Block width'; root.append(title);
    const modeValue=['global','custom','full'].includes(block.blockWidth?.mode) ? block.blockWidth.mode : 'global';
    const modeObject={mode:modeValue}; const mode=field(root,modeObject,'mode','Режим ширины',{choices:[['global','Use global settings'],['custom','Custom width'],['full','Full content width']]});
    const widthObject={value:Number.isFinite(block.blockWidth?.value)?block.blockWidth.value:720}; const width=field(root,widthObject,'value','Custom width, px',{number:true,min:240,max:1600,step:1});
    const effective=document.createElement('p'); effective.className='field-help block-width-effective'; root.append(effective);
    const updateState=()=>{width.disabled=mode.value!=='custom';effective.textContent=mode.value==='global'?`Применяется глобально: ${globalTextWidthLabel()}`:mode.value==='full'?'Применяется вся ширина контейнера.':`Применяется ${Math.min(1600,Math.max(240,Number(width.value)||720))} px.`;};
    mode.addEventListener('input',()=>{block.blockWidth={mode:mode.value,value:Math.min(1600,Math.max(240,Number(width.value)||720))};updateState();changed();});
    width.addEventListener('input',()=>{block.blockWidth={mode:'custom',value:Math.min(1600,Math.max(240,Number(width.value)||720))};effective.textContent=`Применяется ${block.blockWidth.value} px.`;changed();});
    updateState(); parent.append(root);
}
function gallerySpacingControls(parent, block) {
    const root=document.createElement('div'); root.className='gallery-spacing-control'; const title=document.createElement('strong'); title.textContent='Gallery spacing'; root.append(title);
    const legacy=!block.gallerySpacing && Number.isFinite(block.gap); const source=block.gallerySpacing?.mode==='custom' ? block.gallerySpacing : legacy ? {mode:'custom',horizontal:block.gap,vertical:block.gap,linked:true} : {mode:'global',...stylesDraft.layout.gallerySpacing};
    const label=(text,control)=>{const wrap=document.createElement('label');wrap.textContent=text;wrap.append(control);root.append(wrap);return wrap;};
    const mode=document.createElement('select');mode.append(new Option('Use global Gallery spacing','global'),new Option('Custom Gallery spacing','custom'));mode.value=source.mode;label('Режим',mode);
    const horizontal=document.createElement('input');horizontal.type='number';horizontal.min='0';horizontal.max='120';horizontal.step='1';horizontal.value=String(source.horizontal);label('Horizontal gap, px',horizontal);
    const vertical=document.createElement('input');vertical.type='number';vertical.min='0';vertical.max='120';vertical.step='1';vertical.value=String(source.vertical);label('Vertical gap, px',vertical);
    const same=document.createElement('input');same.type='checkbox';same.checked=source.linked===true;const sameLabel=label('Same horizontal and vertical gap',same);sameLabel.className='check gallery-gap-linked';
    const note=document.createElement('p');note.className='field-help';note.textContent=legacy?'Legacy gap сохранён как одинаковый горизонтальный и вертикальный отступ, пока вы не измените режим.':'Глобальные значения изменяются в Project Styles.';root.append(note);
    const value=input=>Math.min(120,Math.max(0,Number(input.value)||0));
    const updateState=()=>{const custom=mode.value==='custom';horizontal.disabled=vertical.disabled=same.disabled=!custom;vertical.disabled=!custom||same.checked;};
    const commit=()=>{if(mode.value==='global'){block.gallerySpacing={mode:'global',horizontal:value(horizontal),vertical:value(vertical),linked:same.checked};delete block.gap;}else{if(same.checked)vertical.value=horizontal.value;block.gallerySpacing={mode:'custom',horizontal:value(horizontal),vertical:value(vertical),linked:same.checked};delete block.gap;}updateState();changed();};
    mode.addEventListener('input',commit);horizontal.addEventListener('input',commit);vertical.addEventListener('input',commit);same.addEventListener('input',commit);updateState();parent.append(root);
}
function renderBlocks() {
    $('#blocks').replaceChildren();
    const ui=projectUi(); const filter=ui.blockFilter; $('#block-filter').value=filter; $('#block-filter-note').textContent=filter === 'all' ? '' : 'Перетаскивание и изменение порядка доступны только в режиме All blocks.';
    draft.content.forEach((block, index) => {
        if (!blockMatchesFilter(block,filter)) return;
        const collapsed=ui.collapsedBlocks.includes(block.id);
        const card = document.createElement('section'); card.className = 'block'; card.dataset.id = block.id;
        card.classList.toggle('collapsed',collapsed); card.classList.toggle('inactive',block.enabled === false);
        const header = document.createElement('header'); const titleWrap=document.createElement('div'); titleWrap.className='block-summary'; const title = document.createElement('strong'); title.textContent = `${index + 1}. ${labels[block.type] || block.type}`; const description=document.createElement('span'); description.textContent=blockSummary(block); description.title=description.textContent; titleWrap.append(title,description); if(block.enabled === false){ const badge=document.createElement('small'); badge.className='hidden-badge'; badge.textContent='Hidden'; titleWrap.append(badge); } header.append(titleWrap); card.append(header);
        const actions = document.createElement('div'); actions.className = 'actions'; header.append(actions);
        const handle = button('⋮⋮', () => {}, actions); handle.className = 'drag-handle'; handle.draggable = true; handle.title = 'Перетащить блок';
        handle.disabled=filter !== 'all'; handle.addEventListener('dragstart', event => { if(filter !== 'all'){event.preventDefault();return;} dragged = block.id; event.dataTransfer.setData('text/plain', block.id); event.dataTransfer.effectAllowed = 'move'; });
        handle.addEventListener('dragend', () => { dragged = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
        card.addEventListener('dragover', event => { if (dragged) { event.preventDefault(); card.classList.add('drag-over'); } });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', event => { event.preventDefault(); const from = draft.content.findIndex(b => b.id === dragged); if (from >= 0 && from !== index) { const [item] = draft.content.splice(from,1); draft.content.splice(index,0,item); renderBlocks(); changed(); } dragged = null; card.classList.remove('drag-over'); });
        button('↑', () => move(index,-1), actions).disabled = filter !== 'all' || index === 0;
        button('↓', () => move(index,1), actions).disabled = filter !== 'all' || index === draft.content.length-1;
        button('Копия', () => { const copy = clone(block); renewIds(copy); copy.id = uid(); draft.content.splice(index+1,0,copy); renderBlocks(); changed(); }, actions);
        button('Удалить', () => { if (confirm('Удалить блок? Изображения на диске будут сохранены.')) { draft.content.splice(index,1); renderBlocks(); changed(); } }, actions);
        const visible=block.enabled !== false; const visibility=button(visible ? '◉ Visible' : '◌ Hidden',() => { if(visible) block.enabled=false; else delete block.enabled; renderBlocks(); changed(); },actions); visibility.className='block-visibility'; visibility.title=visible ? 'Скрыть блок на странице' : 'Показать блок на странице'; visibility.setAttribute('aria-pressed',String(!visible));
        const collapse=button(collapsed ? 'Раскрыть' : 'Свернуть',() => { setCollapsedBlock(block.id,!collapsed); renderBlocks(); },actions); collapse.className='block-collapse-toggle'; collapse.setAttribute('aria-expanded',String(!collapsed));
        const body=document.createElement('div'); body.className='block-body'; body.hidden=collapsed; card.append(body);
        blockWidthControls(body,block);
        if (block.type === 'text') { const language = field(body, block, 'language','Язык', { choices:[['','Не указан'],['en','English'],['uk','Ukrainian']] }); language.value = block.language || block.lang || ''; language.addEventListener('input', () => { delete block.lang; changed(); }); richTextField(body,block); }
        else if (block.type === 'image') imageFields(body,block);
        else if (['gallery','imagePair','image-pair'].includes(block.type)) {
            if (block.type === 'gallery') {
                const columns = field(body,block,'columns','Колонки на компьютере',{ choices:[['1','1'],['2','2'],['3','3']], number:true }); columns.value = String(Number.isInteger(block.columns) ? block.columns : 2);
                gallerySpacingControls(body,block);
                help(body, 'На экранах до 600 px галерея автоматически становится одноколоночной. Изображения сохраняют исходные пропорции.');
            }
            itemsForm(body,block,'image');
        }
        else if (['links','materials','exhibitions'].includes(block.type)) { field(body,block,'title','Заголовок списка'); itemsForm(body,block,block.type === 'exhibitions' ? 'exhibitions' : 'links'); }
        else if (['video','youtube','vimeo'].includes(block.type)) {
            const provider = field(body,block,'provider','Платформа',{ choices:[['youtube','YouTube'],['vimeo','Vimeo']] });
            provider.value = block.provider || (block.type === 'vimeo' || block.vimeoId ? 'vimeo' : 'youtube');
            field(body,block,'url','Ссылка на видео'); field(body,block,block.youtubeId ? 'youtubeId' : block.vimeoId ? 'vimeoId' : 'videoId','ID видео (если не указана ссылка)');
            field(body,block,'title','Название видео');
            help(body, 'Название всегда используется как доступное имя видеоплеера. На странице оно видно только при включённой настройке ниже.');
            field(body,block,'showTitle','Показывать название видео на странице',{ check:true });
            field(body,block,'caption','Подпись под видео');
        } else if (block.type === 'spacer') {
            if (Number.isFinite(block.units)) {
                const input = field(body,block,'units','Множитель базового отступа',{number:true,min:0,max:20,step:.1});
                const calculated = document.createElement('p'); calculated.className = 'field-help spacer-calculation';
                const update = () => { calculated.textContent = `Рассчитанная высота: ${(Math.min(20,Math.max(0,Number(input.value) || 0)) * stylesDraft.spacing.spacerUnit).toFixed(1).replace(/\.0$/,'')} px`; };
                input.addEventListener('input',update); update(); body.append(calculated);
            } else {
                field(body,block,'size','Старый размер отступа',{ choices:[['small','Небольшой · 16 px'],['medium','Средний · 40 px'],['large','Большой · 80 px']] });
                help(body,'Legacy Spacer сохраняет прежний фиксированный размер и не зависит от глобальной единицы.');
                button('Преобразовать в числовой Spacer',() => { const pixels={small:16,medium:40,large:80}[block.size] || 40; block.units=Number((pixels/stylesDraft.spacing.spacerUnit).toFixed(2)); delete block.size; renderBlocks(); changed(); },body);
            }
        }
        else { const warning = document.createElement('p'); warning.textContent = 'Этот блок пока не редактируется. Данные сохранятся.'; body.append(warning); }
        $('#blocks').append(card);
    });
}
function projectList() {
    $('#projects').replaceChildren();
    for (const project of data.projects) { const item = button(project.title || 'Без названия', () => selectProject(project), $('#projects')); item.classList.toggle('active', project.id === draft?.id); }
    if (draft && !data.projects.some(p => p.id === draft.id)) { const item = button(draft.title || 'Новый проект', () => {}, $('#projects')); item.className = 'active'; }
}
function renderForm() {
    $('#empty').hidden = true; $('#form').hidden = false; $('#metadata').replaceChildren();
    field($('#metadata'),draft,'title','Название'); field($('#metadata'),draft,'year','Год или период');
    const author = document.createElement('div'); $('#metadata').append(author);
    const choice = field(author,{author:draft.author?.type || ''},'author','Автор',{ choices:[['','Не указан'],['solo','Solo · Oleksandr Hants'],['collective','fantastic little splash']] });
    choice.addEventListener('input', () => { if (choice.value) draft.author = {type:choice.value,name:choice.value === 'solo' ? 'Oleksandr Hants' : 'fantastic little splash'}; else delete draft.author; changed(); });
    multiValueField($('#metadata'),draft,'projectTypes','Project Types · Типы проекта');
    multiValueField($('#metadata'),draft,'roles','Roles · Роли');
    button('Обновить список изображений', async () => { try { await refreshAssets(); renderBlocks(); status('Список изображений обновлён'); } catch(e) { status(e.message,true); } }, $('#metadata'));
    renderBlocks(); projectList(); updateStatus(); preview();
}
let selectedStyleKey = 'title';
const FONT_CHOICES = [
    ['Arial, Helvetica, sans-serif','Arial / Helvetica'],
    ["Georgia, 'Times New Roman', serif",'Georgia / Times'],
    ["'Courier New', Courier, monospace",'Courier New'],
    ['system-ui, sans-serif','System UI'],
    ['Inter, Arial, Helvetica, sans-serif','Inter']
];
function styleChanged() { clearTimeout(previewTimer); previewTimer = setTimeout(preview,80); persistStylesDraft(); updateStatus(); }
function styleInput(parent, object, key, label, options = {}) {
    const row = document.createElement('div'); row.className = 'style-control-row';
    const wrap = document.createElement('label'); wrap.textContent = label;
    const input = document.createElement(options.choices ? 'select' : 'input');
    if (options.choices) for (const [value,title] of options.choices) input.append(new Option(title,value));
    else if (options.check) input.type = 'checkbox'; else if (options.color) input.type = 'color'; else input.type = 'number';
    if (options.check) input.checked = object[key] === true; else input.value = object[key];
    if (options.min !== undefined) input.min = options.min; if (options.max !== undefined) input.max = options.max; if (options.step !== undefined) input.step = options.step;
    input.addEventListener('input',() => { object[key] = options.check ? input.checked : options.color ? input.value : options.choices ? (options.number ? Number(input.value) : input.value) : Number(input.value); styleChanged(); });
    wrap.append(input); row.append(wrap);
    const reset = button('Reset',() => { object[key] = clone(options.defaultValue); renderStyleControls(); styleChanged(); },row); reset.className = 'style-reset';
    parent.append(row);
}
function renderStyleControls() {
    const root = $('#style-controls'); root.replaceChildren();
    const group = document.createElement('section'); group.className = 'style-group';
    const selectorLabel = document.createElement('label'); selectorLabel.textContent = 'Элемент';
    const selector = document.createElement('select'); selector.id = 'style-element';
    for (const [key,title] of Object.entries(PROJECT_STYLE_ELEMENTS)) selector.append(new Option(title,key));
    selector.value = selectedStyleKey; selector.addEventListener('change',() => { selectedStyleKey = selector.value; renderStyleControls(); }); selectorLabel.append(selector); group.append(selectorLabel);
    const heading = document.createElement('h2'); heading.textContent = PROJECT_STYLE_ELEMENTS[selectedStyleKey]; group.append(heading);
    const current = stylesDraft.typography[selectedStyleKey]; const defaults = DEFAULT_PROJECT_STYLES.typography[selectedStyleKey];
    styleInput(group,current,'fontFamily','Font family',{choices:FONT_CHOICES,defaultValue:defaults.fontFamily});
    styleInput(group,current,'fontSize','Font size, px',{min:8,max:96,step:1,defaultValue:defaults.fontSize});
    styleInput(group,current,'fontWeight','Font weight',{choices:[[300,'300'],[400,'400'],[500,'500'],[600,'600'],[700,'700'],[800,'800'],[900,'900']],number:true,defaultValue:defaults.fontWeight});
    styleInput(group,current,'italic','Italic',{check:true,defaultValue:defaults.italic});
    styleInput(group,current,'color','Color',{color:true,defaultValue:defaults.color});
    root.append(group);
    const spacing = document.createElement('section'); spacing.className = 'style-group'; const spacingTitle = document.createElement('h2'); spacingTitle.textContent = 'Spacing'; spacing.append(spacingTitle);
    for (const [key,label,min,max,step] of [
        ['bodyLineHeight','Body line height',1,3,.05],['paragraphGap','Paragraph spacing, px',0,120,1],['blockGap','Main block gap, px',0,240,1],['headerGap','Gap after project header, px',0,240,1],['spacerUnit','Base Spacer unit, px',1,100,1]
    ]) styleInput(spacing,stylesDraft.spacing,key,label,{min,max,step,defaultValue:DEFAULT_PROJECT_STYLES.spacing[key]});
    root.append(spacing);
    const layout = document.createElement('section'); layout.className = 'style-group'; const layoutTitle = document.createElement('h2'); layoutTitle.textContent = 'Text-based blocks width & Image Layout'; layout.append(layoutTitle);
    const widthRow = document.createElement('div'); widthRow.className = 'text-width-control';
    const modeLabel=document.createElement('label'); modeLabel.textContent='Text-based blocks width'; const mode=document.createElement('select'); mode.className='text-width-mode'; mode.append(new Option('Custom width','custom'),new Option('Full content width','full'),new Option('Legacy 70ch','legacy')); mode.value=stylesDraft.layout.fullContentWidth?'full':stylesDraft.layout.textColumnWidth===null?'legacy':'custom'; modeLabel.append(mode);
    const numberLabel = document.createElement('label'); numberLabel.textContent = 'Custom width, px'; const number = document.createElement('input'); number.type = 'number'; number.min = '480'; number.max = '1000'; number.step = '1'; number.value = stylesDraft.layout.textColumnWidth ?? 720; numberLabel.append(number);
    const range = document.createElement('input'); range.type = 'range'; range.min = '480'; range.max = '1000'; range.step = '1'; range.value = number.value; range.setAttribute('aria-label','Text column width slider');
    const widthReset = button('Reset to legacy 70ch',() => { stylesDraft.layout.textColumnWidth = null; stylesDraft.layout.fullContentWidth=false; renderStyleControls(); styleChanged(); },widthRow);
    const setWidthState = () => { number.disabled = range.disabled = mode.value!=='custom'; };
    const updateWidth = value => { const next = Math.min(1000,Math.max(480,Number(value) || 720)); stylesDraft.layout.textColumnWidth = next; stylesDraft.layout.fullContentWidth=false; mode.value='custom'; number.value = range.value = String(next); setWidthState(); styleChanged(); };
    mode.addEventListener('input',()=>{stylesDraft.layout.fullContentWidth=mode.value==='full';if(mode.value==='legacy')stylesDraft.layout.textColumnWidth=null;else if(mode.value==='custom'&&stylesDraft.layout.textColumnWidth===null)stylesDraft.layout.textColumnWidth=Number(number.value)||720;setWidthState();styleChanged();});
    number.addEventListener('input',() => updateWidth(number.value)); range.addEventListener('input',() => updateWidth(range.value));
    widthRow.append(modeLabel,numberLabel,range,widthReset); layout.append(widthRow); setWidthState();
    styleInput(layout,stylesDraft.layout,'verticalImageAlignment','Vertical image alignment',{choices:[['top','Top'],['center','Center'],['bottom','Bottom']],defaultValue:DEFAULT_PROJECT_STYLES.layout.verticalImageAlignment});
    styleInput(layout,stylesDraft.layout,'horizontalImageAlignment','Horizontal image alignment',{choices:[['left','Left'],['center','Center'],['right','Right']],defaultValue:DEFAULT_PROJECT_STYLES.layout.horizontalImageAlignment});
    styleInput(layout,stylesDraft.layout,'captionAlignment','Image caption alignment',{choices:[['left','Left'],['center','Center'],['right','Right']],defaultValue:DEFAULT_PROJECT_STYLES.layout.captionAlignment});
    styleInput(layout,stylesDraft.layout,'imageCaptionGap','Image caption gap, px',{min:0,max:60,step:1,defaultValue:DEFAULT_PROJECT_STYLES.layout.imageCaptionGap});
    root.append(layout);
    const gallery=document.createElement('section');gallery.className='style-group gallery-spacing-styles';const galleryTitle=document.createElement('h2');galleryTitle.textContent='Gallery spacing';gallery.append(galleryTitle);
    const galleryGrid=document.createElement('div');galleryGrid.className='gallery-spacing-grid';const gallerySettings=stylesDraft.layout.gallerySpacing;
    const globalGapInput=(key,labelText)=>{const wrap=document.createElement('label');wrap.textContent=labelText;const input=document.createElement('input');input.type='number';input.min='0';input.max='120';input.step='1';input.value=String(gallerySettings[key]);wrap.append(input);galleryGrid.append(wrap);return input;};
    const horizontalGap=globalGapInput('horizontal','Horizontal gap, px');const verticalGap=globalGapInput('vertical','Vertical gap, px');const linkedLabel=document.createElement('label');linkedLabel.className='check gallery-gap-linked';linkedLabel.textContent='Same horizontal and vertical gap';const linked=document.createElement('input');linked.type='checkbox';linked.checked=gallerySettings.linked;linkedLabel.prepend(linked);galleryGrid.append(linkedLabel);
    const updateGalleryState=()=>{verticalGap.disabled=linked.checked;};const clampGap=input=>Math.min(120,Math.max(0,Number(input.value)||0));
    horizontalGap.addEventListener('input',()=>{gallerySettings.horizontal=clampGap(horizontalGap);if(linked.checked){gallerySettings.vertical=gallerySettings.horizontal;verticalGap.value=horizontalGap.value;}styleChanged();});
    verticalGap.addEventListener('input',()=>{gallerySettings.vertical=clampGap(verticalGap);styleChanged();});
    linked.addEventListener('input',()=>{gallerySettings.linked=linked.checked;if(linked.checked){gallerySettings.vertical=gallerySettings.horizontal;verticalGap.value=horizontalGap.value;}updateGalleryState();styleChanged();});
    const resetGallery=button('Reset Gallery spacing',()=>{stylesDraft.layout.gallerySpacing=clone(DEFAULT_PROJECT_STYLES.layout.gallerySpacing);renderStyleControls();styleChanged();},galleryGrid);resetGallery.className='gallery-spacing-reset';gallery.append(galleryGrid);root.append(gallery);updateGalleryState();
}
function showView(next) {
    view = next;
    $('#project-view').hidden = view !== 'projects'; $('#styles-view').hidden = view !== 'styles'; $('#project-sidebar').hidden = view !== 'projects';
    $('#show-projects').classList.toggle('active',view === 'projects'); $('#show-styles').classList.toggle('active',view === 'styles');
    if (view === 'styles') { if (!draft && data.projects[0]) { draft = clone(data.projects[0]); baseline = JSON.stringify(draft); } renderStyleControls(); }
    else if (draft) renderBlocks();
    updateStatus(); preview();
}
function mayLeave() { if (saving) { status('Дождитесь завершения сохранения.'); return false; } return !dirty() || confirm('Есть несохранённые изменения. Перейти без сохранения? Черновик текущего проекта будет заменён.'); }
function selectProject(project) { if (!mayLeave()) return false; draft = clone(project); baseline = JSON.stringify(draft); for (const block of draft.content || []) { block.id ||= uid(); } draft.content ??= []; renderForm(); persistDraft(); return true; }
$('#new').onclick = () => { if (!mayLeave()) return; draft = {id:uid(),title:'Новый проект',year:'',author:{type:'solo',name:'Oleksandr Hants'},projectTypes:[],roles:[],content:[]}; baseline = ''; renderForm(); persistDraft(); };
$('#duplicate-project').onclick = () => { if (saving) return; const copy = clone(draft); renewIds(copy); copy.id = uid(); copy.title += ' — копия'; draft = copy; baseline = ''; renderForm(); persistDraft(); };
$('#add-block').onclick = () => { const type = $('#block-type').value; const block = {id:uid(),type}; if (type === 'text') block.text = ''; if (['gallery','links','exhibitions'].includes(type)) block.items = []; if (type === 'imagePair') block.items = [{id:uid()},{id:uid()}]; if (type === 'video') block.provider = 'youtube'; if (type === 'spacer') block.units = 4; draft.content.push(block); projectUi().blockFilter='all'; persistEditorUi(); renderBlocks(); changed(); };
$('#block-filter').addEventListener('change',() => { projectUi().blockFilter=$('#block-filter').value; persistEditorUi(); renderBlocks(); });
$('#collapse-all-blocks').onclick=() => { projectUi().collapsedBlocks=draft.content.map(block=>block.id); persistEditorUi(); renderBlocks(); };
$('#expand-all-blocks').onclick=() => { projectUi().collapsedBlocks=[]; persistEditorUi(); renderBlocks(); };
$('#show-projects').onclick = () => showView('projects');
$('#show-styles').onclick = () => showView('styles');
$('#reset-all-styles').onclick = () => { if (!confirm('Вернуть все Project Styles к исходным значениям?')) return; stylesDraft = normalizeProjectStyles(null); renderStyleControls(); styleChanged(); };
$('#save').onclick = async () => {
    if ((view === 'projects' && !draft) || saving) return;
    saving = true; $('#save').disabled = true; status('Сохранение…');
    const snapshot = clone(view === 'styles' ? stylesDraft : draft);
    try {
        if (view === 'styles') { const result = await api('/api/styles/save',{styles:snapshot,revision:stylesRevision}); stylesDraft = normalizeProjectStyles(result.styles); stylesRevision = result.revision; stylesBaseline = JSON.stringify(stylesDraft); persistStylesDraft(); renderStyleControls(); }
        else { const result = await api('/api/save',{project:snapshot,revision}); data = result.data; revision = result.revision; baseline = JSON.stringify(snapshot); projectList(); persistDraft(); }
        updateStatus(); status(dirty() ? 'Сохранено. Есть новые несохранённые изменения.' : 'Сохранено. Резервная копия создана.');
    }
    catch (e) { status(e.message,true); }
    finally { saving = false; $('#save').disabled = !dirty(); }
};
$('#desktop').onclick = () => setSize(false); $('#mobile').onclick = () => setSize(true);
function setSize(mobile) { $('#preview').classList.toggle('mobile',mobile); $('#mobile').setAttribute('aria-pressed',String(mobile)); $('#desktop').setAttribute('aria-pressed',String(!mobile)); }
let splitRatio = 0.5;
function applySplit() {
    const workspace = $('.workspace'); const sidebar = $('.sidebar'); const splitter = $('#panel-splitter');
    if (getComputedStyle(splitter).display === 'none') return;
    const available = workspace.clientWidth - sidebar.getBoundingClientRect().width - splitter.getBoundingClientRect().width;
    if (available <= 0) return;
    const minimumEditing = Math.min(320, available / 2); const minimumPreview = Math.min(300, available / 2);
    const editingWidth = Math.min(available - minimumPreview, Math.max(minimumEditing, available * splitRatio));
    workspace.style.setProperty('--editing-width', `${editingWidth}px`);
    splitter.setAttribute('aria-valuenow', String(Math.round(editingWidth / available * 100)));
}
function saveSplit() { try { localStorage.setItem(SPLIT_STORAGE_KEY, String(splitRatio)); } catch { /* Layout preference is optional. */ } }
function initializePreviewLayout() {
    const workspace = $('.workspace'); const sidebar = $('.sidebar'); const splitter = $('#panel-splitter'); const fullscreen = $('#preview-fullscreen');
    let stored = NaN; try { stored = Number(localStorage.getItem(SPLIT_STORAGE_KEY)); } catch { /* Use the default split. */ }
    if (Number.isFinite(stored) && stored >= 0.25 && stored <= 0.75) splitRatio = stored;
    const setFromPointer = event => {
        const available = workspace.clientWidth - sidebar.getBoundingClientRect().width - splitter.getBoundingClientRect().width;
        splitRatio = Math.min(0.75, Math.max(0.25, (event.clientX - sidebar.getBoundingClientRect().right) / available));
        applySplit(); saveSplit();
    };
    splitter.addEventListener('pointerdown', event => { splitter.setPointerCapture(event.pointerId); splitter.classList.add('is-dragging'); setFromPointer(event); });
    splitter.addEventListener('pointermove', event => { if (splitter.hasPointerCapture(event.pointerId)) setFromPointer(event); });
    splitter.addEventListener('pointerup', event => { if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId); splitter.classList.remove('is-dragging'); });
    splitter.addEventListener('pointercancel', () => splitter.classList.remove('is-dragging'));
    splitter.addEventListener('dblclick', () => { splitRatio = 0.5; applySplit(); saveSplit(); });
    splitter.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return; event.preventDefault(); splitRatio = event.key === 'Home' ? 0.5 : Math.min(0.75, Math.max(0.25, splitRatio + (event.key === 'ArrowRight' ? 0.025 : -0.025))); applySplit(); saveSplit(); });
    const setFullscreen = enabled => {
        workspace.classList.toggle('preview-fullscreen', enabled); fullscreen.setAttribute('aria-pressed', String(enabled)); fullscreen.textContent = enabled ? 'Вернуться к редактору' : 'На весь экран';
        if (!enabled) { applySplit(); fullscreen.focus(); }
    };
    fullscreen.addEventListener('click', () => setFullscreen(!workspace.classList.contains('preview-fullscreen')));
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && workspace.classList.contains('preview-fullscreen')) { event.preventDefault(); setFullscreen(false); } });
    window.addEventListener('resize', applySplit);
    new ResizeObserver(applySplit).observe(workspace);
    applySplit();
}
$('#recover').onclick = async () => { try { const {names} = await api('/api/backups'); $('#backup-list').replaceChildren(...names.map(name => new Option(name.replace(/\.json$/,''),name))); $('#restore').disabled = !names.length; $('#backups').showModal(); } catch (e) { status(e.message,true); } };
$('#close-backups').onclick = () => $('#backups').close();
$('#restore').onclick = async () => { if (!confirm('Восстановить весь список проектов? Несохранённый черновик будет закрыт.')) return; try { const result = await api('/api/restore',{name:$('#backup-list').value,revision}); data = result.data; revision = result.revision; draft = null; baseline = ''; localStorage.removeItem(DRAFT_STORAGE_KEY); $('#form').hidden = true; $('#empty').hidden = false; $('#backups').close(); projectList(); updateStatus(); status('Копия восстановлена.'); } catch(e) { status(e.message,true); } };
window.addEventListener('preview-ready',preview);
window.addEventListener('beforeunload',event => { if (anyDirty()) { event.preventDefault(); event.returnValue = ''; } });
initializePreviewLayout();
try {
    const [state, media] = await Promise.all([api('/api/state'),api('/api/assets')]); data = state.data; revision = state.revision; token = state.token; assets = media.files; assetLibrary = media.assets || assets.map(path => ({path,name:path.split('/').pop(),preview:path,large:path,zoom:path})); conversionManifest=media.conversionManifest || conversionManifest; stylesDraft = normalizeProjectStyles(state.styles); stylesRevision = state.stylesRevision; stylesBaseline = JSON.stringify(stylesDraft); loadVocabulary(); projectList(); status('Выберите проект');
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (saved?.draft && JSON.stringify(saved.draft) !== saved.baseline && confirm('Восстановить несохранённый черновик из этого браузера?')) { draft = saved.draft; baseline = saved.baseline; if (saved.revision !== revision) { revision = saved.revision; } renderForm(); }
    const savedStyles = JSON.parse(localStorage.getItem(STYLES_DRAFT_STORAGE_KEY) || 'null');
    if (savedStyles?.draft && JSON.stringify(savedStyles.draft) !== savedStyles.baseline && confirm('Восстановить несохранённые Project Styles из этого браузера?')) { stylesDraft = normalizeProjectStyles(savedStyles.draft); stylesBaseline = savedStyles.baseline; stylesRevision = savedStyles.revision; preview(); }
} catch (e) { status('Не удалось открыть редактор: ' + e.message,true); }
