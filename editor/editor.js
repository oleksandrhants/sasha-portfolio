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
let data, revision, token, assets = [], assetLibrary = [], draft = null, baseline = '', saving = false, dragged = null;
let stylesDraft = normalizeProjectStyles(null), stylesBaseline = '', stylesRevision = 'missing', view = 'projects';
let vocabulary = { projectTypes:[], roles:[] };
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
async function api(url, body) {
    const response = await fetch(url, body ? { method:'POST', headers:{'Content-Type':'application/json','X-Editor-Token':token}, body:JSON.stringify(body) } : {});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Ошибка сервера'); return result;
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
    for (const key of ['preview','large','zoom']) { const value = asset[key] || asset.path; if (value) media[key] = value; }
}
function ensureImageLibrary() {
    let dialog = $('#image-library'); if (dialog) return dialog;
    dialog = document.createElement('dialog'); dialog.id = 'image-library'; dialog.className = 'image-library'; dialog.innerHTML = `<div class="image-library-heading"><h2>Choose image · Выбрать изображение</h2><button type="button" data-close>Закрыть</button></div><label>Поиск по имени<input type="search" data-search placeholder="Имя файла…"></label><div class="image-library-body"><div class="image-library-grid" data-grid></div><aside class="image-library-preview"><img data-preview alt=""><strong data-name>Выберите изображение</strong><span data-resolution></span><span data-variants></span></aside></div><div class="image-library-actions"><span data-count></span><button type="button" class="primary" data-confirm disabled>Выбрать</button></div>`;
    dialog.querySelector('[data-close]').onclick = () => dialog.close(); dialog.addEventListener('click',event => { if (event.target === dialog) dialog.close(); }); document.body.append(dialog); return dialog;
}
function openImageLibrary({multiple=false,onConfirm}) {
    const dialog = ensureImageLibrary(); const grid = dialog.querySelector('[data-grid]'); const search = dialog.querySelector('[data-search]'); const confirm = dialog.querySelector('[data-confirm]'); const count = dialog.querySelector('[data-count]'); const previewImage = dialog.querySelector('[data-preview]'); const name = dialog.querySelector('[data-name]'); const resolution = dialog.querySelector('[data-resolution]'); const variants = dialog.querySelector('[data-variants]');
    const selected = new Set(); let focused = null;
    const showPreview = asset => { focused = asset; previewImage.src = '/' + (asset.preview || asset.path); previewImage.alt = asset.name; name.textContent = asset.name; variants.textContent = `Preview: ${asset.preview ? 'yes' : 'fallback'} · Large: ${asset.large ? 'yes' : 'fallback'} · Zoom: ${asset.zoom ? 'yes' : 'fallback'}`; resolution.textContent = ''; previewImage.onload = () => { resolution.textContent = `${previewImage.naturalWidth} × ${previewImage.naturalHeight} px`; }; };
    const update = () => { count.textContent = selected.size ? `Выбрано: ${selected.size}` : 'Ничего не выбрано'; confirm.disabled = !selected.size; grid.querySelectorAll('.image-library-item').forEach(tile => { const active = selected.has(tile.dataset.path); tile.classList.toggle('selected',active); tile.setAttribute('aria-pressed',String(active)); }); };
    const render = () => { const query = normalizedValue(search.value).toLocaleLowerCase(); grid.replaceChildren(); for (const asset of assetLibrary.filter(item => !query || item.name.toLocaleLowerCase().includes(query) || item.path.toLocaleLowerCase().includes(query))) { const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'image-library-item'; tile.dataset.path = asset.path; tile.setAttribute('aria-pressed','false'); const img = document.createElement('img'); img.src = '/' + (asset.preview || asset.path); img.alt = ''; img.loading = 'lazy'; const caption = document.createElement('span'); caption.textContent = asset.name; tile.append(img,caption); tile.onclick = () => { if (!multiple) selected.clear(); if (multiple && selected.has(asset.path)) selected.delete(asset.path); else selected.add(asset.path); showPreview(asset); update(); }; tile.ondblclick = () => showPreview(asset); grid.append(tile); } update(); };
    search.value = ''; search.oninput = render; confirm.onclick = () => { const chosen = assetLibrary.filter(asset => selected.has(asset.path)); if (chosen.length) onConfirm(multiple ? chosen : chosen[0]); dialog.close(); };
    render(); dialog.showModal(); search.focus();
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
    const list = document.createElement('div'); parent.append(list);
    block.items.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'item'; list.append(row);
        const heading = document.createElement('div'); heading.className = 'item-heading'; heading.textContent = `${kind === 'image' ? 'Изображение' : 'Запись'} ${index + 1}`; row.append(heading);
        const actions = document.createElement('div'); actions.className = 'actions'; heading.append(actions);
        const up = button('↑', () => { [block.items[index-1],block.items[index]] = [block.items[index],block.items[index-1]]; renderBlocks(); changed(); }, actions); up.disabled = index === 0;
        const down = button('↓', () => { [block.items[index+1],block.items[index]] = [block.items[index],block.items[index+1]]; renderBlocks(); changed(); }, actions); down.disabled = index === block.items.length-1;
        if (!['imagePair','image-pair'].includes(block.type)) button('Удалить', () => { if (confirm('Удалить запись? Файл изображения останется на диске.')) { block.items.splice(index,1); renderBlocks(); changed(); } }, actions);
        if (kind === 'image') imageFields(row, item);
        else { for (const [key, label] of kind === 'links' ? [['title','Название'],['url','Ссылка'],['description','Описание']] : [['date','Дата или период'],['year','Год'],['title','Название выставки'],['venue','Площадка'],['city','Город'],['country','Страна'],['url','Ссылка'],['description','Описание']]) field(row, item, key, label); }
    });
    if (!['imagePair','image-pair'].includes(block.type)) {
        if (kind === 'image' && block.type === 'gallery') button('＋ Из библиотеки',() => openImageLibrary({multiple:true,onConfirm:selected => { for(const asset of selected){ const item={id:uid()}; applyLibraryAsset(item,asset); block.items.push(item); } renderBlocks(); changed(); }}),parent);
        button(kind === 'image' ? '＋ Изображение (пустое)' : '＋ Запись', () => { block.items.push({id:uid()}); renderBlocks(); changed(); }, parent);
    }
}
function move(index, delta) { const target = index + delta; if (target < 0 || target >= draft.content.length) return; [draft.content[index],draft.content[target]] = [draft.content[target],draft.content[index]]; renderBlocks(); changed(); }
function renewIds(object) { if (!object || typeof object !== 'object') return; if ('id' in object) object.id = uid(); if (Array.isArray(object.items)) object.items.forEach(renewIds); }
function renderBlocks() {
    $('#blocks').replaceChildren();
    draft.content.forEach((block, index) => {
        const card = document.createElement('section'); card.className = 'block'; card.dataset.id = block.id;
        const header = document.createElement('header'); const title = document.createElement('strong'); title.textContent = `${index + 1}. ${labels[block.type] || block.type}`; header.append(title); card.append(header);
        const actions = document.createElement('div'); actions.className = 'actions'; header.append(actions);
        const handle = button('⋮⋮', () => {}, actions); handle.className = 'drag-handle'; handle.draggable = true; handle.title = 'Перетащить блок';
        handle.addEventListener('dragstart', event => { dragged = block.id; event.dataTransfer.setData('text/plain', block.id); event.dataTransfer.effectAllowed = 'move'; });
        handle.addEventListener('dragend', () => { dragged = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
        card.addEventListener('dragover', event => { if (dragged) { event.preventDefault(); card.classList.add('drag-over'); } });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', event => { event.preventDefault(); const from = draft.content.findIndex(b => b.id === dragged); if (from >= 0 && from !== index) { const [item] = draft.content.splice(from,1); draft.content.splice(index,0,item); renderBlocks(); changed(); } dragged = null; card.classList.remove('drag-over'); });
        button('↑', () => move(index,-1), actions).disabled = index === 0;
        button('↓', () => move(index,1), actions).disabled = index === draft.content.length-1;
        button('Копия', () => { const copy = clone(block); renewIds(copy); copy.id = uid(); draft.content.splice(index+1,0,copy); renderBlocks(); changed(); }, actions);
        button('Удалить', () => { if (confirm('Удалить блок? Изображения на диске будут сохранены.')) { draft.content.splice(index,1); renderBlocks(); changed(); } }, actions);
        if (block.type === 'text') { const language = field(card, block, 'language','Язык', { choices:[['','Не указан'],['en','English'],['uk','Ukrainian']] }); language.value = block.language || block.lang || ''; language.addEventListener('input', () => { delete block.lang; changed(); }); richTextField(card,block); }
        else if (block.type === 'image') imageFields(card,block);
        else if (['gallery','imagePair','image-pair'].includes(block.type)) {
            if (block.type === 'gallery') {
                const columns = field(card,block,'columns','Колонки на компьютере',{ choices:[['1','1'],['2','2'],['3','3']], number:true }); columns.value = String(Number.isInteger(block.columns) ? block.columns : 2);
                const gap = field(card,block,'gap','Расстояние между изображениями, px',{ number:true, min:0, max:120, step:1 }); gap.value = String(Number.isFinite(block.gap) ? block.gap : 16);
                help(card, 'На экранах до 600 px галерея автоматически становится одноколоночной. Изображения сохраняют исходные пропорции.');
            }
            itemsForm(card,block,'image');
        }
        else if (['links','materials','exhibitions'].includes(block.type)) { field(card,block,'title','Заголовок списка'); itemsForm(card,block,block.type === 'exhibitions' ? 'exhibitions' : 'links'); }
        else if (['video','youtube','vimeo'].includes(block.type)) {
            const provider = field(card,block,'provider','Платформа',{ choices:[['youtube','YouTube'],['vimeo','Vimeo']] });
            provider.value = block.provider || (block.type === 'vimeo' || block.vimeoId ? 'vimeo' : 'youtube');
            field(card,block,'url','Ссылка на видео'); field(card,block,block.youtubeId ? 'youtubeId' : block.vimeoId ? 'vimeoId' : 'videoId','ID видео (если не указана ссылка)');
            field(card,block,'title','Название видео');
            help(card, 'Название всегда используется как доступное имя видеоплеера. На странице оно видно только при включённой настройке ниже.');
            field(card,block,'showTitle','Показывать название видео на странице',{ check:true });
            field(card,block,'caption','Подпись под видео');
        } else if (block.type === 'spacer') {
            if (Number.isFinite(block.units)) {
                const input = field(card,block,'units','Множитель базового отступа',{number:true,min:0,max:20,step:.1});
                const calculated = document.createElement('p'); calculated.className = 'field-help spacer-calculation';
                const update = () => { calculated.textContent = `Рассчитанная высота: ${(Math.min(20,Math.max(0,Number(input.value) || 0)) * stylesDraft.spacing.spacerUnit).toFixed(1).replace(/\.0$/,'')} px`; };
                input.addEventListener('input',update); update(); card.append(calculated);
            } else {
                field(card,block,'size','Старый размер отступа',{ choices:[['small','Небольшой · 16 px'],['medium','Средний · 40 px'],['large','Большой · 80 px']] });
                help(card,'Legacy Spacer сохраняет прежний фиксированный размер и не зависит от глобальной единицы.');
                button('Преобразовать в числовой Spacer',() => { const pixels={small:16,medium:40,large:80}[block.size] || 40; block.units=Number((pixels/stylesDraft.spacing.spacerUnit).toFixed(2)); delete block.size; renderBlocks(); changed(); },card);
            }
        }
        else { const warning = document.createElement('p'); warning.textContent = 'Этот блок пока не редактируется. Данные сохранятся.'; card.append(warning); }
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
    button('Обновить список изображений', async () => { try { const media=await api('/api/assets'); assets=media.files; assetLibrary=media.assets || assets.map(path => ({path,name:path.split('/').pop(),preview:path,large:path,zoom:path})); renderBlocks(); status('Список изображений обновлён'); } catch(e) { status(e.message,true); } }, $('#metadata'));
    renderBlocks(); projectList(); updateStatus(); preview();
}
let selectedStyleKey = 'title';
const FONT_CHOICES = [
    ['Arial, Helvetica, sans-serif','Arial / Helvetica'],
    ["Georgia, 'Times New Roman', serif",'Georgia / Times'],
    ["'Courier New', Courier, monospace",'Courier New'],
    ['system-ui, sans-serif','System UI']
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
    const layout = document.createElement('section'); layout.className = 'style-group'; const layoutTitle = document.createElement('h2'); layoutTitle.textContent = 'Text width & Image Layout'; layout.append(layoutTitle);
    const widthRow = document.createElement('div'); widthRow.className = 'text-width-control';
    const enabledLabel = document.createElement('label'); enabledLabel.className = 'check'; enabledLabel.textContent = 'Use pixel Text column width';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = stylesDraft.layout.textColumnWidth !== null; enabledLabel.prepend(enabled);
    const numberLabel = document.createElement('label'); numberLabel.textContent = 'Text column width, px'; const number = document.createElement('input'); number.type = 'number'; number.min = '480'; number.max = '1000'; number.step = '1'; number.value = stylesDraft.layout.textColumnWidth ?? 720; numberLabel.append(number);
    const range = document.createElement('input'); range.type = 'range'; range.min = '480'; range.max = '1000'; range.step = '1'; range.value = number.value; range.setAttribute('aria-label','Text column width slider');
    const widthReset = button('Reset to legacy 70ch',() => { stylesDraft.layout.textColumnWidth = null; renderStyleControls(); styleChanged(); },widthRow);
    const setWidthState = () => { number.disabled = range.disabled = !enabled.checked; };
    const updateWidth = value => { const next = Math.min(1000,Math.max(480,Number(value) || 720)); stylesDraft.layout.textColumnWidth = next; number.value = range.value = String(next); enabled.checked = true; setWidthState(); styleChanged(); };
    enabled.addEventListener('input',() => { stylesDraft.layout.textColumnWidth = enabled.checked ? Number(number.value) : null; setWidthState(); styleChanged(); });
    number.addEventListener('input',() => updateWidth(number.value)); range.addEventListener('input',() => updateWidth(range.value));
    widthRow.append(enabledLabel,numberLabel,range,widthReset); layout.append(widthRow); setWidthState();
    styleInput(layout,stylesDraft.layout,'verticalImageAlignment','Vertical image alignment',{choices:[['top','Top'],['center','Center'],['bottom','Bottom']],defaultValue:DEFAULT_PROJECT_STYLES.layout.verticalImageAlignment});
    styleInput(layout,stylesDraft.layout,'horizontalImageAlignment','Horizontal image alignment',{choices:[['left','Left'],['center','Center'],['right','Right']],defaultValue:DEFAULT_PROJECT_STYLES.layout.horizontalImageAlignment});
    styleInput(layout,stylesDraft.layout,'captionAlignment','Image caption alignment',{choices:[['left','Left'],['center','Center'],['right','Right']],defaultValue:DEFAULT_PROJECT_STYLES.layout.captionAlignment});
    root.append(layout);
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
function selectProject(project) { if (!mayLeave()) return; draft = clone(project); baseline = JSON.stringify(draft); for (const block of draft.content || []) { block.id ||= uid(); } draft.content ??= []; renderForm(); persistDraft(); }
$('#new').onclick = () => { if (!mayLeave()) return; draft = {id:uid(),title:'Новый проект',year:'',author:{type:'solo',name:'Oleksandr Hants'},projectTypes:[],roles:[],content:[]}; baseline = ''; renderForm(); persistDraft(); };
$('#duplicate-project').onclick = () => { if (saving) return; const copy = clone(draft); renewIds(copy); copy.id = uid(); copy.title += ' — копия'; draft = copy; baseline = ''; renderForm(); persistDraft(); };
$('#add-block').onclick = () => { const type = $('#block-type').value; const block = {id:uid(),type}; if (type === 'text') block.text = ''; if (['gallery','links','exhibitions'].includes(type)) block.items = []; if (type === 'imagePair') block.items = [{id:uid()},{id:uid()}]; if (type === 'video') block.provider = 'youtube'; if (type === 'spacer') block.units = 4; draft.content.push(block); renderBlocks(); changed(); };
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
    const [state, media] = await Promise.all([api('/api/state'),api('/api/assets')]); data = state.data; revision = state.revision; token = state.token; assets = media.files; assetLibrary = media.assets || assets.map(path => ({path,name:path.split('/').pop(),preview:path,large:path,zoom:path})); stylesDraft = normalizeProjectStyles(state.styles); stylesRevision = state.stylesRevision; stylesBaseline = JSON.stringify(stylesDraft); loadVocabulary(); projectList(); status('Выберите проект');
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (saved?.draft && JSON.stringify(saved.draft) !== saved.baseline && confirm('Восстановить несохранённый черновик из этого браузера?')) { draft = saved.draft; baseline = saved.baseline; if (saved.revision !== revision) { revision = saved.revision; } renderForm(); }
    const savedStyles = JSON.parse(localStorage.getItem(STYLES_DRAFT_STORAGE_KEY) || 'null');
    if (savedStyles?.draft && JSON.stringify(savedStyles.draft) !== savedStyles.baseline && confirm('Восстановить несохранённые Project Styles из этого браузера?')) { stylesDraft = normalizeProjectStyles(savedStyles.draft); stylesBaseline = savedStyles.baseline; stylesRevision = savedStyles.revision; preview(); }
} catch (e) { status('Не удалось открыть редактор: ' + e.message,true); }
