const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');

const revision = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const types = new Set(['text','image','imagePair','image-pair','gallery','video','youtube','vimeo','links','materials','exhibitions','spacer']);

function validateProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw fail('Некорректный проект.');
    if (typeof project.id !== 'string' || !/^[\w-]{1,160}$/.test(project.id)) throw fail('Некорректный ID проекта.');
    if (typeof project.title !== 'string' || !project.title.trim()) throw fail('Введите название проекта.');
    if (!Array.isArray(project.content)) throw fail('Некорректный список блоков.');
    const ids = new Set();
    const stringFields = (object, keys) => {
        for (const key of keys) if (object[key] !== undefined && typeof object[key] !== 'string') throw fail(`Поле ${key} должно быть текстом.`);
    };
    stringFields(project, ['year']);
    for (const key of ['roles','projectTypes']) if (project[key] !== undefined && (!Array.isArray(project[key]) || project[key].some(x => typeof x !== 'string'))) throw fail(`Некорректное поле ${key}.`);
    if (project.author && !(['solo','collective'].includes(project.author.type) && typeof project.author.name === 'string')) throw fail('Выберите автора проекта.');
    const image = item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('Некорректное изображение.');
        stringFields(item, ['src','preview','large','zoom','caption','alt','description','credit']);
        for (const key of ['src','preview','large','zoom']) if (item[key]) {
            if (!/^assets\//.test(item[key]) || item[key].includes('\\') || item[key].split('/').some(p => p === '..' || p.startsWith('.')) || /[?#\x00]/.test(item[key])) throw fail('Выберите изображение внутри папки assets.');
        }
    };
    for (const block of project.content) {
        if (!block || typeof block !== 'object' || !types.has(block.type)) throw fail('Неизвестный тип блока.');
        if (typeof block.id !== 'string' || !block.id.trim() || ids.has(block.id)) throw fail('ID блоков должны быть уникальными.');
        ids.add(block.id);
        stringFields(block, ['text','title','caption','url','provider','videoId','youtubeId','vimeoId','language','lang','size']);
        if (block.language && !['en','uk'].includes(block.language)) throw fail('Язык блока: English, Ukrainian или без языка.');
        if (block.type === 'image') image(block);
        if (['gallery','imagePair','image-pair','links','materials','exhibitions'].includes(block.type)) {
            if (!Array.isArray(block.items)) throw fail('Некорректный список элементов.');
            if (['imagePair','image-pair'].includes(block.type) && block.items.length !== 2) throw fail('В паре должно быть два изображения.');
            for (const item of block.items) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('Некорректный элемент списка.');
                if (['gallery','imagePair','image-pair'].includes(block.type)) image(item);
                else {
                    stringFields(item, ['title','label','url','description','year','date','venue','city','country']);
                    if (item.url) { let url; try { url = new URL(item.url); } catch { throw fail('Проверьте ссылку.'); } if (!['https:','http:','mailto:'].includes(url.protocol)) throw fail('Недопустимый тип ссылки.'); }
                }
            }
        }
        if (['video','youtube','vimeo'].includes(block.type)) {
            const provider = block.provider || (block.type === 'vimeo' || block.vimeoId ? 'vimeo' : 'youtube');
            const id = block.videoId || block.youtubeId || block.vimeoId;
            if (!['youtube','vimeo'].includes(provider)) throw fail('Выберите YouTube или Vimeo.');
            if (id && !(provider === 'youtube' ? /^[\w-]{11}$/ : /^\d+$/).test(id)) throw fail('Проверьте ID видео.');
            if (!id && block.url) { let url; try { url = new URL(block.url); } catch { throw fail('Проверьте ссылку на видео.'); } const host = url.hostname; if (url.protocol !== 'https:' || !(provider === 'youtube' ? host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') : host === 'vimeo.com' || host.endsWith('.vimeo.com'))) throw fail('Ссылка должна вести на выбранную видеоплатформу.'); }
        }
        if (block.type === 'spacer' && !['small','medium','large'].includes(block.size)) throw fail('Выберите размер отступа.');
    }
}

async function createEditorServer({ root = path.resolve(__dirname, '..') } = {}) {
    root = await fs.realpath(root);
    const dataFile = path.join(root, 'data', 'projects.json');
    const backupDir = path.join(root, '.editor-backups');
    const token = randomBytes(32).toString('hex');
    let saving = false;
    const inside = file => file.startsWith(root + path.sep);
    async function safePath(relative) {
        const file = await fs.realpath(path.resolve(root, relative));
        if (!inside(file)) throw fail('Доступ запрещён.', 403);
        return file;
    }
    async function readData() { await safePath('data/projects.json'); const bytes = await fs.readFile(dataFile); return { bytes, data: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), revision: revision(bytes) }; }
    async function backup(bytes) {
        await fs.mkdir(backupDir, { recursive: true });
        if (!inside(await fs.realpath(backupDir))) throw fail('Недопустимая папка копий.', 403);
        const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json`;
        const handle = await fs.open(path.join(backupDir, name), 'wx');
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        return name;
    }
    async function replace(bytes) {
        const temp = path.join(root, 'data', `.projects-${randomBytes(12).toString('hex')}.tmp`);
        const handle = await fs.open(temp, 'wx');
        try {
            await handle.writeFile(bytes); await handle.sync(); await handle.close();
            await fs.rename(temp, dataFile);
        } catch (error) { await handle.close().catch(() => {}); await fs.unlink(temp).catch(() => {}); throw error; }
    }
    const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.avif':'image/avif' };
    const server = http.createServer(async (req, res) => {
        const send = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            const origin = `http://127.0.0.1:${server.address().port}`;
            if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) throw fail('Доступ запрещён.', 403);
            const url = new URL(req.url, origin);
            if (url.pathname.startsWith('/api/')) {
                if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('Доступ запрещён.', 403);
                if (req.method === 'GET' && url.pathname === '/api/state') { const current = await readData(); return send(200, { data:current.data, revision:current.revision, token }); }
                if (req.method === 'GET' && url.pathname === '/api/assets') {
                    const files = [];
                    async function walk(dir) { for (const entry of await fs.readdir(dir, { withFileTypes:true })) { if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue; const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else if (/\.(webp|png|jpe?g|avif|gif)$/i.test(entry.name)) files.push(path.relative(root, file).split(path.sep).join('/')); } }
                    await walk(await safePath('assets')); return send(200, { files });
                }
                if (req.method === 'GET' && url.pathname === '/api/backups') { let names = []; try { await safePath('.editor-backups'); names = (await fs.readdir(backupDir)).filter(x => /^[\w.-]+\.json$/.test(x)).sort().reverse(); } catch (e) { if (e.code !== 'ENOENT') throw e; } return send(200, { names }); }
                if (req.method !== 'POST' || !['/api/save','/api/restore'].includes(url.pathname)) throw fail('Не найдено.', 404);
                if (req.headers['x-editor-token'] !== token || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) throw fail('Доступ запрещён.', 403);
                let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10 * 1024 * 1024) throw fail('Слишком большой проект.', 413); }
                const input = JSON.parse(body);
                if (saving) throw fail('Сохранение уже выполняется.', 409);
                saving = true;
                try {
                    const current = await readData();
                    if (input.revision !== current.revision) throw fail('Файл изменился вне редактора. Обновите страницу, сохранив нужные тексты.', 409);
                    let next = current.data;
                    if (url.pathname === '/api/save') {
                        validateProject(input.project);
                        const index = next.projects.findIndex(p => p.id === input.project.id);
                        if (index < 0) next.projects.push(input.project); else next.projects[index] = input.project;
                        next.schemaVersion ??= 1;
                    } else {
                        if (typeof input.name !== 'string' || !/^[\w.-]+\.json$/.test(input.name)) throw fail('Некорректная копия.');
                        const file = await safePath(path.join('.editor-backups', input.name));
                        next = JSON.parse(await fs.readFile(file, 'utf8'));
                        if (!Array.isArray(next.projects)) throw fail('Некорректная копия.');
                    }
                    const bytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
                    const backupName = await backup(current.bytes);
                    await replace(bytes);
                    return send(200, { data:next, revision:revision(bytes), backup:backupName });
                } finally { saving = false; }
            }
            if (!['GET','HEAD'].includes(req.method)) throw fail('Метод запрещён.', 405);
            const relative = decodeURIComponent(['/', '/editor/'].includes(url.pathname) ? '/editor/index.html' : url.pathname).slice(1);
            if (relative.split(/[\\/]/).some(p => p.startsWith('.') || p === '..') || relative.includes('\0')) throw fail('Доступ запрещён.', 403);
            const ext = path.extname(relative).toLowerCase();
            if (!mime[ext] || (ext === '.json' && relative !== 'data/projects.json' && !relative.startsWith('presets/'))) throw fail('Доступ запрещён.', 403);
            const bytes = await fs.readFile(await safePath(relative));
            res.writeHead(200, { 'Content-Type':mime[ext] }); res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch (error) { if (!res.headersSent) send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : 'Не удалось выполнить операцию. Исходный файл и резервные копии сохранены.' }); else res.end(); }
    });
    return server;
}
module.exports = { createEditorServer, validateProject };
if (require.main === module) createEditorServer().then(server => {
    let port = 8765;
    server.on('listening', () => {
        const address = `http://127.0.0.1:${server.address().port}/editor/index.html`;
        console.log(`Editor: ${address}`);
        const index = process.argv.indexOf('--chrome');
        if (index >= 0 && process.argv[index + 1]) {
            const child = require('node:child_process').spawn(process.argv[index + 1], [address], { detached:true, stdio:'ignore', windowsHide:true });
            child.on('error', () => console.log(`Open ${address} in Chrome.`)); child.unref();
        }
    });
    server.on('error', error => { if (error.code === 'EADDRINUSE' && port < 8785) server.listen(++port, '127.0.0.1'); else { console.error(error.message); process.exitCode = 1; } });
    server.listen(port, '127.0.0.1');
});
