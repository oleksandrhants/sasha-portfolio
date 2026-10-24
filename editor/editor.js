const $ = selector => document.querySelector(selector);
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();
const labels = { text:'Text · Текст', image:'Image · Изображение', imagePair:'Image pair · Два изображения', 'image-pair':'Image pair · Два изображения', gallery:'Gallery · Галерея', video:'Video · Видео', youtube:'Video · YouTube', vimeo:'Video · Vimeo', links:'Links / Materials', materials:'Links / Materials', exhibitions:'Exhibitions · Выставки', spacer:'Spacer · Отступ' };
const DRAFT_STORAGE_KEY = 'portfolio-editor-draft-v1';
const VOCABULARY_STORAGE_KEY = 'portfolio-editor-vocabulary-v1';
const SPLIT_STORAGE_KEY = 'portfolio-editor-split-v1';
let data, revision, token, assets = [], draft = null, baseline = '', saving = false, dragged = null;
let vocabulary = { projectTypes:[], roles:[] };
const dirty = () => draft && JSON.stringify(draft) !== baseline;
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function updateStatus() { $('#save').disabled = !draft || saving || !dirty(); status(dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены'); }
function preview() { try { if (draft) $('#preview').contentWindow.renderDraft?.(clone(draft)); } catch (error) { status('Предпросмотр: ' + error.message, true); } }
let previewTimer;
function changed() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 160); updateStatus(); persistDraft(); const selected = $('#projects button.active'); if (selected) selected.textContent = draft.title || 'Без названия'; }
function persistDraft() { try { if (draft) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft, baseline, revision })); } catch { /* Save remains available if browser storage is full. */ } }
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
function imageFields(parent, image) {
    for (const [key, label] of [['preview','Миниатюра · preview'],['large','На странице · large'],['zoom','Увеличение · zoom'], ...(image.src ? [['src','Исходное изображение (старый формат)']] : [])]) {
        const selected = field(parent, image, key, label, { choices:[['','Не выбрано'], ...assets.map(file => [file, file.replace(/^assets\//,'')])] });
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
    const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Подготовьте версии в Portfolio Image Converter и поместите их в assets. Кнопка обновления списка находится в данных проекта.'; parent.append(note);
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
    if (!['imagePair','image-pair'].includes(block.type)) button(kind === 'image' ? '＋ Изображение' : '＋ Запись', () => { block.items.push({id:uid()}); renderBlocks(); changed(); }, parent);
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
        if (block.type === 'text') { const language = field(card, block, 'language','Язык', { choices:[['','Не указан'],['en','English'],['uk','Ukrainian']] }); language.value = block.language || block.lang || ''; language.addEventListener('input', () => { delete block.lang; changed(); }); field(card,block,'text','Текст',{multiline:true}); }
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
        } else if (block.type === 'spacer') field(card,block,'size','Размер отступа',{ choices:[['small','Небольшой'],['medium','Средний'],['large','Большой']] });
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
    button('Обновить список изображений', async () => { try { assets = (await api('/api/assets')).files; renderBlocks(); status('Список изображений обновлён'); } catch(e) { status(e.message,true); } }, $('#metadata'));
    renderBlocks(); projectList(); updateStatus(); preview();
}
function mayLeave() { if (saving) { status('Дождитесь завершения сохранения.'); return false; } return !dirty() || confirm('Есть несохранённые изменения. Перейти без сохранения? Черновик текущего проекта будет заменён.'); }
function selectProject(project) { if (!mayLeave()) return; draft = clone(project); baseline = JSON.stringify(draft); for (const block of draft.content || []) { block.id ||= uid(); } draft.content ??= []; renderForm(); persistDraft(); }
$('#new').onclick = () => { if (!mayLeave()) return; draft = {id:uid(),title:'Новый проект',year:'',author:{type:'solo',name:'Oleksandr Hants'},projectTypes:[],roles:[],content:[]}; baseline = ''; renderForm(); persistDraft(); };
$('#duplicate-project').onclick = () => { if (saving) return; const copy = clone(draft); renewIds(copy); copy.id = uid(); copy.title += ' — копия'; draft = copy; baseline = ''; renderForm(); persistDraft(); };
$('#add-block').onclick = () => { const type = $('#block-type').value; const block = {id:uid(),type}; if (type === 'text') block.text = ''; if (['gallery','links','exhibitions'].includes(type)) block.items = []; if (type === 'imagePair') block.items = [{id:uid()},{id:uid()}]; if (type === 'video') block.provider = 'youtube'; if (type === 'spacer') block.size = 'medium'; draft.content.push(block); renderBlocks(); changed(); };
$('#save').onclick = async () => {
    if (!draft || saving) return;
    saving = true; $('#save').disabled = true; status('Сохранение…');
    const snapshot = clone(draft);
    try { const result = await api('/api/save',{project:snapshot,revision}); data = result.data; revision = result.revision; baseline = JSON.stringify(snapshot); projectList(); persistDraft(); updateStatus(); status(dirty() ? 'Сохранено. Есть новые несохранённые изменения.' : 'Сохранено. Резервная копия создана.'); }
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
window.addEventListener('beforeunload',event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
initializePreviewLayout();
try {
    const [state, media] = await Promise.all([api('/api/state'),api('/api/assets')]); data = state.data; revision = state.revision; token = state.token; assets = media.files; loadVocabulary(); projectList(); status('Выберите проект');
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (saved?.draft && JSON.stringify(saved.draft) !== saved.baseline && confirm('Восстановить несохранённый черновик из этого браузера?')) { draft = saved.draft; baseline = saved.baseline; if (saved.revision !== revision) { revision = saved.revision; } renderForm(); }
} catch (e) { status('Не удалось открыть редактор: ' + e.message,true); }
