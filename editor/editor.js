const $ = selector => document.querySelector(selector);
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();
const labels = { text:'Text · Текст', image:'Image · Изображение', imagePair:'Image pair · Два изображения', 'image-pair':'Image pair · Два изображения', gallery:'Gallery · Галерея', video:'Video · Видео', youtube:'Video · YouTube', vimeo:'Video · Vimeo', links:'Links / Materials', materials:'Links / Materials', exhibitions:'Exhibitions · Выставки', spacer:'Spacer · Отступ' };
let data, revision, token, assets = [], draft = null, baseline = '', saving = false, dragged = null;
const dirty = () => draft && JSON.stringify(draft) !== baseline;
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function updateStatus() { $('#save').disabled = !draft || saving || !dirty(); status(dirty() ? 'Есть несохранённые изменения' : 'Все изменения сохранены'); }
function preview() { try { if (draft) $('#preview').contentWindow.renderDraft?.(clone(draft)); } catch (error) { status('Предпросмотр: ' + error.message, true); } }
let previewTimer;
function changed() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 160); updateStatus(); persistDraft(); const selected = $('#projects button.active'); if (selected) selected.textContent = draft.title || 'Без названия'; }
function persistDraft() { try { if (draft) localStorage.setItem('portfolio-editor-draft-v1', JSON.stringify({ draft, baseline, revision })); } catch { /* Save remains available if browser storage is full. */ } }
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
    if (options.check) { input.type = 'checkbox'; input.checked = object[key] === true; wrap.className = 'check'; }
    input.addEventListener('input', () => { object[key] = options.check ? input.checked : options.array ? input.value.split(',').map(v => v.trim()).filter(Boolean) : input.value; changed(); });
    wrap.append(input); parent.append(wrap); return input;
}
function imageFields(parent, image) {
    for (const [key, label] of [['preview','Миниатюра · preview'],['large','На странице · large'],['zoom','Увеличение · zoom'], ...(image.src ? [['src','Исходное изображение (старый формат)']] : [])]) {
        const selected = field(parent, image, key, label, { choices:[['','Не выбрано'], ...assets.map(file => [file, file.replace(/^assets\//,'')])] });
        if (image[key] && !assets.includes(image[key])) { const option = new Option(image[key] + ' (файл не найден)', image[key]); selected.add(option); selected.value = image[key]; }
    }
    field(parent, image, 'caption', 'Подпись'); field(parent, image, 'alt', 'Описание для доступности');
    field(parent, image, 'description', 'Описание в архиве', { multiline:true }); field(parent, image, 'credit', 'Автор фотографии');
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
        else if (['gallery','imagePair','image-pair'].includes(block.type)) itemsForm(card,block,'image');
        else if (['links','materials','exhibitions'].includes(block.type)) { field(card,block,'title','Заголовок списка'); itemsForm(card,block,block.type === 'exhibitions' ? 'exhibitions' : 'links'); }
        else if (['video','youtube','vimeo'].includes(block.type)) {
            const provider = field(card,block,'provider','Платформа',{ choices:[['youtube','YouTube'],['vimeo','Vimeo']] });
            provider.value = block.provider || (block.type === 'vimeo' || block.vimeoId ? 'vimeo' : 'youtube');
            field(card,block,'url','Ссылка на видео'); field(card,block,block.youtubeId ? 'youtubeId' : block.vimeoId ? 'vimeoId' : 'videoId','ID видео (если не указана ссылка)'); field(card,block,'title','Название'); field(card,block,'caption','Подпись');
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
    field($('#metadata'),draft,'projectTypes','Типы проекта (через запятую)',{array:true}); field($('#metadata'),draft,'roles','Роли (через запятую)',{array:true});
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
$('#recover').onclick = async () => { try { const {names} = await api('/api/backups'); $('#backup-list').replaceChildren(...names.map(name => new Option(name.replace(/\.json$/,''),name))); $('#restore').disabled = !names.length; $('#backups').showModal(); } catch (e) { status(e.message,true); } };
$('#close-backups').onclick = () => $('#backups').close();
$('#restore').onclick = async () => { if (!confirm('Восстановить весь список проектов? Несохранённый черновик будет закрыт.')) return; try { const result = await api('/api/restore',{name:$('#backup-list').value,revision}); data = result.data; revision = result.revision; draft = null; baseline = ''; localStorage.removeItem('portfolio-editor-draft-v1'); $('#form').hidden = true; $('#empty').hidden = false; $('#backups').close(); projectList(); updateStatus(); status('Копия восстановлена.'); } catch(e) { status(e.message,true); } };
window.addEventListener('preview-ready',preview);
window.addEventListener('beforeunload',event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
try {
    const [state, media] = await Promise.all([api('/api/state'),api('/api/assets')]); data = state.data; revision = state.revision; token = state.token; assets = media.files; projectList(); status('Выберите проект');
    const saved = JSON.parse(localStorage.getItem('portfolio-editor-draft-v1') || 'null');
    if (saved?.draft && JSON.stringify(saved.draft) !== saved.baseline && confirm('Восстановить несохранённый черновик из этого браузера?')) { draft = saved.draft; baseline = saved.baseline; if (saved.revision !== revision) { revision = saved.revision; } renderForm(); }
} catch (e) { status('Не удалось открыть редактор: ' + e.message,true); }
