const API_BASE = 'https://seller-services.wildberries.ru/ns/reports/seller-wb-balance/api/v1';

// Кэш токена AuthorizeV3, который перехватывается на seller.wildberries.ru и сохраняется injector'ом
let authorizeV3Token = '';
try {
	chrome.storage?.local?.get(['authorizev3'], (res) => {
		if (res && typeof res.authorizev3 === 'string' && res.authorizev3.trim()) {
			authorizeV3Token = res.authorizev3.trim();
		}
	});
	chrome.storage?.onChanged?.addListener((changes, area) => {
		if (area === 'local' && changes.authorizev3) {
			const v = changes.authorizev3.newValue;
			if (typeof v === 'string' && v.trim()) authorizeV3Token = v.trim();
		}
	});
} catch (_) {}

// Дожидается появления токена в chrome.storage.local, если его ещё нет
async function waitForAuthorizeToken(timeoutMs = 5000) {
    if (authorizeV3Token && authorizeV3Token.trim()) return true;
    return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(true); } };
        const timer = setTimeout(() => {
            try { chrome.storage?.onChanged?.removeListener(listener); } catch(_) {}
            finish();
        }, timeoutMs);
        const listener = (changes, area) => {
            if (area === 'local' && changes && changes.authorizev3 && typeof changes.authorizev3.newValue === 'string') {
                authorizeV3Token = changes.authorizev3.newValue.trim();
                clearTimeout(timer);
                try { chrome.storage?.onChanged?.removeListener(listener); } catch(_) {}
                finish();
            }
        };
        try { chrome.storage?.onChanged?.addListener(listener); } catch(_) {}
        // Дополнительно повторно читаем storage на случай, если токен уже пришёл
        try {
            chrome.storage?.local?.get(['authorizev3'], (res) => {
                if (!done && res && typeof res.authorizev3 === 'string' && res.authorizev3.trim()) {
                    authorizeV3Token = res.authorizev3.trim();
                    clearTimeout(timer);
                    try { chrome.storage?.onChanged?.removeListener(listener); } catch(_) {}
                    finish();
                }
            });
        } catch(_) {}
    });
}

const state = {
    skip: 0,
    limit: 30,
    type: 6,
    dateFrom: '',
    dateTo: '',
    lastItems: [],
    loadedItems: [],
    loading: false,
    endReached: false,
    selectedIds: new Set(),
    itemById: new Map()
};

async function apiGet(path, params = {}) {
	const url = new URL(API_BASE + path);
	Object.entries(params).forEach(([k, v]) => {
		if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
	});
	const headers = { 'Accept': 'application/json' };
	if (authorizeV3Token) headers['AuthorizeV3'] = authorizeV3Token;
	const res = await fetch(url.toString(), { headers, credentials: 'include' });
	if (!res.ok) throw new Error('HTTP ' + res.status);
	return res.json().catch(() => ({}));
}

function fmtDate(s) { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleDateString('ru-RU'); }

function computePeriod(item) {
    const from = item.dateFrom || item.fromDate || item.periodFrom || item.weekStart;
    const to = item.dateTo || item.toDate || item.periodTo || item.weekEnd;
    if (from || to) {
        const a = fmtDate(from);
        const b = fmtDate(to);
        if (a && b) return `с ${a} по ${b}`;
        if (a) return `с ${a}`;
        if (b) return `по ${b}`;
    }
    return item.period || '';
}

function computeStatus(item) {
	return item.statusName || item.status || '';
}

function computeType(item) {
    if (item && typeof item.type !== 'undefined') {
        if (Number(item.type) === 1) return 'По выкупам';
        if (Number(item.type) === 2) return 'Основной';
    }
    return item.typeName || (item.type ?? state.type);
}

function num(v){ const n=Number(v); return isFinite(n)? n : 0; }
function money(v){ const n=num(v); return n.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function percent(v){ const n=num(v); return n.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2}); }

function pickReportNumber(it){ return it.id || it.number || it.reportNumber || it.reportId || ''; }
function pickLegalEntity(it){ return it.supplierFinanceName || it.legalName || it.legalEntity || it.companyName || it.supplierName || ''; }
function pickSales(it){ return it.totalSale ?? it.sales ?? it.sale ?? it.turnover ?? it.revenue ?? 0; }
function pickAgreedDiscountPct(it){ return it.avgSalePercent ?? it.agreedDiscountPercent ?? it.discountPercent ?? it.agreedDiscount ?? 0; }
function pickToBeTransferred(it){ return it.forPay ?? it.toTransfer ?? it.amountToTransfer ?? it.toPayForGoods ?? it.toPay ?? 0; }
function pickLogisticsCost(it){ return it.deliveryRub ?? it.logisticsCost ?? it.deliveryCost ?? it.shipmentCost ?? 0; }
function pickPenaltyHighLogistics(it){ return it.penaltyLogistics ?? 0; }
function pickByDimensionsCoef(it){ return it.penaltyWithoutLogistics ?? 0; }
function pickTotalPenalties(it){ return it.penalty ?? 0; }
function pickOtherPenalties(it){
    const total = num(pickTotalPenalties(it));
    const hi = num(pickPenaltyHighLogistics(it));
    const byDim = num(pickByDimensionsCoef(it));
    const rest = total - hi - byDim;
    return rest > 0 ? rest : 0;
}
function pickRewardAdjustment(it){ return it.additionalPayment ?? it.rewardAdjustment ?? it.commissionAdjustment ?? 0; }
function pickWBCommission(it){ return it.commission ?? it.wbCommission ?? it.wb ?? 0; }
function pickStorageCost(it){ return it.paidStorageSum ?? it.storageCost ?? 0; }
function pickPaidAcceptanceCost(it){ return it.paidAcceptanceSum ?? it.paidAcceptanceCost ?? it.paidIntakeCost ?? 0; }
function pickOtherHoldings(it){ return it.paidWithholdingSum ?? it.otherHoldings ?? it.otherPayments ?? 0; }
function pickTotalToPay(it){ return it.bankPaymentSum ?? it.totalToPay ?? it.totalPayment ?? it.total ?? 0; }
function pickCurrency(it){ return it.currency || it.curr || 'RUB'; }

function findArrayDeep(obj) {
	if (!obj || typeof obj !== 'object') return [];
	if (Array.isArray(obj)) return obj;
	const keys = ['items', 'reports', 'data', 'result', 'payload', 'content', 'list'];
	for (const k of keys) {
		const v = obj[k];
		if (Array.isArray(v)) return v;
		if (v && typeof v === 'object') {
			const inner = findArrayDeep(v);
			if (Array.isArray(inner) && inner.length) return inner;
		}
	}
	return [];
}

function normalizeItems(resp) {
	const arr = findArrayDeep(resp);
	if (Array.isArray(arr)) return arr;
	return [];
}

function renderRows(items) {
    const tbody = document.getElementById('tbody');
    const list = Array.isArray(items) ? items : [];
    state.lastItems = list;
    const idKey = (it)=> it.id || it.reportId || it.uid || it.uuid || it.ID;
	for (const it of list) {
		const tr = document.createElement('tr');
        const id = idKey(it) || '';
        const checked = id && state.selectedIds.has(String(id)) ? 'checked' : '';
        if (id) state.itemById.set(String(id), it);
        tr.innerHTML = `
            <td><input type="checkbox" class="rowSel" data-id="${id}" ${checked}></td>
            <td>${pickReportNumber(it)}</td>
            <td>${pickLegalEntity(it)}</td>
            <td>${computePeriod(it)}</td>
            <td>${fmtDate(it.createDate || it.createdAt || it.created || it.createdDate)}</td>
            <td>${money(pickSales(it))}</td>
            <td>${percent(pickAgreedDiscountPct(it))}</td>
            <td>${money(pickToBeTransferred(it))}</td>
            <td>${money(pickLogisticsCost(it))}</td>
            <td>${money(pickPenaltyHighLogistics(it))}</td>
            <td>${money(pickByDimensionsCoef(it))}</td>
            <td>${money(pickOtherPenalties(it))}</td>
            <td>${money(pickTotalPenalties(it))}</td>
            <td>${money(pickRewardAdjustment(it))}</td>
            <td>${money(pickWBCommission(it))}</td>
            <td>${money(pickStorageCost(it))}</td>
            <td>${money(pickPaidAcceptanceCost(it))}</td>
            <td>${money(pickOtherHoldings(it))}</td>
            <td>${money(pickTotalToPay(it))}</td>
            <td>${pickCurrency(it)}</td>
            <td>${computeType(it)}</td>
            <td>
                <button class="btn btn-sm" data-action="download" data-id="${id}">Скачать</button>
            </td>
        `;
		tbody.appendChild(tr);
	}
    updateSelectionInfo();
}

function onRowAction(e) {
	const btn = e.target.closest('button[data-action]'); if (!btn) return;
	const id = btn.getAttribute('data-id'); const action = btn.getAttribute('data-action');
	if (action === 'download') downloadReport(id, 'zip');
}

function onRowSelectChange(e){
    const cb = e.target.closest('input.rowSel'); if(!cb) return;
    const id = cb.getAttribute('data-id'); if(!id) return;
    if (cb.checked) state.selectedIds.add(String(id)); else state.selectedIds.delete(String(id));
    updateSelectionInfo();
}

function updateSelectionInfo(){
    document.getElementById('selCount').textContent = String(state.selectedIds.size);
    const all = document.getElementById('selectAllToggle');
    if (all) {
        const pageIds = (state.lastItems||[]).map(it=>String(it.id||it.reportId||it.uid||it.uuid||it.ID)).filter(Boolean);
        all.checked = pageIds.length>0 && pageIds.every(id=>state.selectedIds.has(id));
        all.indeterminate = pageIds.some(id=>state.selectedIds.has(id)) && !all.checked;
    }
}

async function loadNext() {
    if (state.loading || state.endReached) return;
    state.loading = true;
    try {
        const data = await apiGet('/reports-weekly', {
            type: state.type,
            limit: state.limit,
            skip: state.skip,
            dateFrom: state.dateFrom,
            dateTo: state.dateTo
        });
        const items = normalizeItems(data);
        if (!items || items.length === 0) {
            state.endReached = true;
        } else {
            state.loadedItems.push(...items);
            state.skip += items.length;
            renderRows(items);
        }
    } catch (err) {
        console.error(err);
        alert('Не удалось загрузить отчеты. Убедитесь, что вы авторизованы в seller.wildberries.ru, затем обновите страницу.');
    } finally {
        state.loading = false;
    }
}

async function downloadReport(id, type) {
	try {
		// Если API предоставляет прямую ссылку в элементе
		if (!id) {
			alert('Нет идентификатора отчета');
			return;
		}
        const item = state.itemById.get(String(id)) || {};
		// На практике endpoint archived-excel возвращает JSON с ссылкой на файл,
		// поэтому запрашиваем JSON и обрабатываем редирект вручную
		const headers = { 'Accept': 'application/json, text/plain, */*' };
		if (authorizeV3Token) headers['AuthorizeV3'] = authorizeV3Token;

		const extractUrlFromJson = (obj) => {
			try {
				if (!obj || typeof obj !== 'object') return '';
				const candidateKeys = ['url','link','href','downloadUrl','download','file','archiveUrl','excelUrl'];
				for (const k of candidateKeys) {
					const v = obj[k];
					if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
				}
				// Поиск первой строки-URL в глубине объекта
				const stack = [obj];
				while (stack.length) {
					const cur = stack.pop();
					if (!cur || typeof cur !== 'object') continue;
					for (const v of Object.values(cur)) {
						if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
						if (v && typeof v === 'object') stack.push(v);
					}
				}
				return '';
			} catch (_){ return ''; }
		};

		const fetchBlobFollowingJsonLink = async (url) => {
			const res = await fetch(url, { credentials: 'include', headers });
			if (!res.ok) return null;
			const contentType = (res.headers.get('Content-Type') || res.headers.get('content-type') || '').toLowerCase();
			if (contentType.includes('application/json')) {
				// Пытаемся извлечь либо встроенный base64-файл, либо ссылку на файл
				let json = {};
				try { json = await res.json(); } catch (_){ return null; }
				// 1) Встроенный base64 (как в archived-excel: { data: { name, file, contentType } })
				try {
					const candidates = [json, json && json.data, json && json.result, json && json.payload, json && json.content];
					for (const node of candidates) {
						if (!node || typeof node !== 'object') continue;
						const b64 = node.file || node.content || node.archive || '';
						if (typeof b64 === 'string' && b64.length > 100) {
							const raw = b64.replace(/^data:[^,]*,/, '');
							const binary = atob(raw);
							const bytes = new Uint8Array(binary.length);
							for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
							const ct = String(node.contentType || '').toLowerCase();
							const mime = ct.includes('zip') ? 'application/zip' : (ct.includes('xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
							const blob = new Blob([bytes], { type: mime });
							let name = node.name || node.fileName || '';
							if (!name) name = ct.includes('zip') ? 'report.zip' : 'report.xlsx';
							return { blob, filename: name };
						}
					}
				} catch (_){ /* ignore */ }

				// 2) Ссылка на файл в JSON
				const href = extractUrlFromJson(json);
				if (!href) return null;
				const fileRes = await fetch(href, { credentials: 'include' });
				if (!fileRes.ok) return null;
				const cd2 = fileRes.headers.get('Content-Disposition') || fileRes.headers.get('content-disposition') || '';
				let filename2 = '';
				const m2 = cd2.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
				if (m2) filename2 = decodeURIComponent(m2[1] || m2[2] || '');
				if (!filename2) {
					try { filename2 = decodeURIComponent(new URL(href).pathname.split('/').pop() || ''); } catch (_){ filename2=''; }
				}
				const blob2 = await fileRes.blob();
				return { blob: blob2, filename: filename2 };
			}
			// Иначе это уже файл
			const cd = res.headers.get('Content-Disposition') || res.headers.get('content-disposition') || '';
			let filename = '';
			const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
			if (m) filename = decodeURIComponent(m[1] || m[2] || '');
			const blob = await res.blob();
			return { blob, filename };
		};

		const attempts = [];
		if (type==='zip') {
			// ZIP архив из archived-excel (JSON с base64)
			attempts.push(`${API_BASE}/reports-weekly/${id}/details/archived-excel`);
			if (item.type || state.type) attempts.push(`${API_BASE}/reports-weekly/${id}/details/archived-excel?type=${encodeURIComponent(item.type ?? state.type)}`);
			// Резерв: детали
			attempts.push(`${API_BASE}/reports-weekly/${id}/details`);
			if (item.type || state.type) attempts.push(`${API_BASE}/reports-weekly/${id}/details?type=${encodeURIComponent(item.type ?? state.type)}`);
		} else if (type==='json') {
			// Для возможности выгрузки JSON при необходимости
			attempts.push(`${API_BASE}/reports-weekly/${id}/details`);
			if (item.type || state.type) attempts.push(`${API_BASE}/reports-weekly/${id}/details?type=${encodeURIComponent(item.type ?? state.type)}`);
			attempts.push(`${API_BASE}/reports-weekly/${id}`);
			if (item.type || state.type) attempts.push(`${API_BASE}/reports-weekly/${id}?type=${encodeURIComponent(item.type ?? state.type)}`);
		}

        let result = null;
		for (const url of attempts) {
			result = await fetchBlobFollowingJsonLink(url);
            if (result) break;
        }
        if (!result) {
            if (type==='xlsx') {
                // Fallback: формируем CSV по текущим данным строки
                const row = [
                    pickReportNumber(item),
                    pickLegalEntity(item),
                    computePeriod(item),
                    fmtDate(item.createDate || item.createdAt || item.created || item.createdDate),
                    money(pickSales(item)),
                    percent(pickAgreedDiscountPct(item)),
                    money(pickToBeTransferred(item)),
                    money(pickLogisticsCost(item)),
                    money(pickPenaltyHighLogistics(item)),
                    money(pickByDimensionsCoef(item)),
                    money(pickOtherPenalties(item)),
                    money(pickTotalPenalties(item)),
                    money(pickRewardAdjustment(item)),
                    money(pickWBCommission(item)),
                    money(pickStorageCost(item)),
                    money(pickPaidAcceptanceCost(item)),
                    money(pickOtherHoldings(item)),
                    money(pickTotalToPay(item)),
                    pickCurrency(item),
                    String(computeType(item))
                ];
                const header = ['№ отчета','Юридическое лицо','Период','Дата формирования','Продажа','Согласованная скидка, %','К перечислению за товар','Стоимость логистики','Штраф. Повышенная логистика','согласно коэффициенту по обмерам','Другие виды штрафов','Общая сумма штрафов','Корректировка Вознаграждения','Вайлдберриз (ВВ)','Стоимость хранения','Стоимость платной приемки','Прочие удержания/выплаты','Итого к оплате','Валюта','Тип отчета'];
                const csv = [header, row].map(r => r.map(v => {
                    const s = (v==null?'':String(v)).replace(/"/g,'""');
                    return /[";,\n]/.test(s) ? `"${s}"` : s;
                }).join(';')).join('\n');
                const blob = new Blob(["\uFEFF"+csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `report-${id}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                return;
            }
            alert('Ошибка скачивания');
            return;
        }

        let filename = (result.filename || '').trim();
        if (!filename) filename = (type==='json') ? `report-${id}.json` : `report-${id}.zip`;
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
	} catch (e) {
		console.error(e); alert('Ошибка скачивания');
	}
}

// Скачивает отдельные отчеты и возвращает список записей для общего архива
async function fetchReportsAsZipEntries(ids){
    const entries = [];
    for (const id of ids){
        try{
            const single = await fetchSingleZip(id);
            if (single) entries.push(single);
        }catch(e){ console.error('fetchSingleZip failed', id, e); }
    }
    return entries;
}

async function fetchSingleZip(id){
    // Вызываем ту же логику, что внутри downloadReport, но возвращаем Blob и имя
    const headers = { 'Accept': 'application/json, text/plain, */*' };
    if (authorizeV3Token) headers['AuthorizeV3'] = authorizeV3Token;
    const tryUrls = [
        `${API_BASE}/reports-weekly/${id}/details/archived-excel`,
        `${API_BASE}/reports-weekly/${id}/details`
    ];
    for (const url of tryUrls){
        const res = await fetch(url, { credentials: 'include', headers });
        if (!res.ok) continue;
        const ct = (res.headers.get('content-type')||'').toLowerCase();
        if (!ct.includes('application/json')) continue;
        let json={}; try{ json=await res.json(); }catch(_){ continue; }
        const node = json && (json.data||json.payload||json.result||json.content||json);
        const b64 = node && (node.file||node.content||node.archive);
        if (typeof b64 === 'string' && b64.length>100){
            const raw=b64.replace(/^data:[^,]*,/, '');
            const bin=atob(raw); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
            const name = (node.name||node.fileName||`report-${id}.zip`).toString();
            const blob = new Blob([bytes], { type: 'application/zip' });
            return { name: ensureZipExt(name), blob };
        }
        // ссылка (fallback)
        const href = extractUrlFromAny(json);
        if (href){
            const r2 = await fetch(href, { credentials: 'include' }); if(!r2.ok) continue;
            const cd = r2.headers.get('content-disposition')||'';
            let name=''; const m=cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i); if(m) name=decodeURIComponent(m[1]||m[2]||'');
            if(!name){ try{ name=decodeURIComponent(new URL(href).pathname.split('/').pop()||''); }catch(_){ name=''; } }
            const blob=await r2.blob();
            return { name: ensureZipExt(name||`report-${id}.zip`), blob };
        }
    }
    return null;
}

function extractUrlFromAny(obj){
    try{
        if(!obj||typeof obj!=='object') return '';
        const keys=['url','link','href','downloadUrl','download','file','archiveUrl','excelUrl'];
        for(const k of keys){ const v=obj[k]; if(typeof v==='string' && /^https?:\/\//i.test(v)) return v; }
        const stack=[obj];
        while(stack.length){
            const cur=stack.pop(); if(!cur||typeof cur!=='object') continue;
            for(const v of Object.values(cur)){
                if(typeof v==='string' && /^https?:\/\//i.test(v)) return v;
                if(v&&typeof v==='object') stack.push(v);
            }
        }
        return '';
    }catch(_){ return ''; }
}

function ensureZipExt(name){
    const n=String(name||'').trim();
    if (/\.zip$/i.test(n)) return n;
    // Если вдруг дали .xlsx — не трогаем, но для общего архива нужен zip, так что оставим как есть для вложенного файла
    return n + '.zip';
}

async function createZipArchive(entries){
    // Минимальная реализация ZIP без внешних зависимостей сложна; используем "store" (без сжатия) вручную нельзя быстро.
    // Поэтому применим простой контейнер TAR и назовем .zip — так нельзя. Нужно именно ZIP.
    // Лучший путь без зависимостей — сформировать Blob из уже zip-файлов внутри другого zip, но это тоже требует ZIP-пакера.
    // Добавим легковесный упаковщик ZIP (минимальная реализация) в коде.
    const writer = new SimpleZipWriter();
    for (const e of entries){ await writer.addFile(e.name, e.blob); }
    return await writer.finish();
}

class SimpleZipWriter{
    constructor(){ this.files=[]; this.offset=0; }
    async addFile(name, blob){
        const nameBytes = utf8(name);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const crc = crc32(bytes);
        const dos = toDosTime(new Date());
        const localHeader = buildLocalFileHeader(crc, bytes.length, nameBytes, dos);
        this.files.push({ nameBytes, bytes, crc, size: bytes.length, localHeader, offset: this.offset, dos });
        this.offset += localHeader.length + nameBytes.length + bytes.length;
    }
    async finish(){
        const parts=[];
        // locals
        for(const f of this.files){ parts.push(f.localHeader, f.nameBytes, f.bytes); }
        // central dir
        const centralOffset = this.offset;
        let centralSize = 0;
        for (const f of this.files){
            const ch = buildCentralDirectoryHeader(f.crc, f.size, f.nameBytes, f.offset, f.dos);
            parts.push(ch, f.nameBytes);
            centralSize += ch.length + f.nameBytes.length;
        }
        const end = buildEndOfCentralDirectory(this.files.length, centralSize, centralOffset);
        parts.push(end);
        return new Blob(parts, { type: 'application/zip' });
    }
}

function toDosTime(date){
    const dt = new Date(date);
    const year = dt.getFullYear();
    const dosDate = ((year - 1980) << 9) | ((dt.getMonth()+1) << 5) | dt.getDate();
    const dosTime = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1);
    return { date: dosDate, time: dosTime };
}

function buildLocalFileHeader(crc, size, nameBytes, dos){
    const sig = new Uint8Array([0x50,0x4b,0x03,0x04]);
    const buf = new Uint8Array(26);
    const view = new DataView(buf.buffer);
    view.setUint16(0, 20, true); // version needed to extract
    view.setUint16(2, 0x0800, true); // UTF-8 flag
    view.setUint16(4, 0, true); // compression: store
    view.setUint16(6, dos.time, true);
    view.setUint16(8, dos.date, true);
    view.setUint32(10, crc >>> 0, true);
    view.setUint32(14, size >>> 0, true);
    view.setUint32(18, size >>> 0, true);
    view.setUint16(22, nameBytes.length, true);
    view.setUint16(24, 0, true); // extra len
    return concat(sig, buf);
}

function buildCentralDirectoryHeader(crc, size, nameBytes, offset, dos){
    const sig = new Uint8Array([0x50,0x4b,0x01,0x02]);
    const buf = new Uint8Array(42);
    const view = new DataView(buf.buffer);
    view.setUint16(0, 20, true); // version made by
    view.setUint16(2, 20, true); // version needed
    view.setUint16(4, 0x0800, true); // UTF-8 flag
    view.setUint16(6, 0, true); // compression
    view.setUint16(8, dos.time, true);
    view.setUint16(10, dos.date, true);
    view.setUint32(12, crc >>> 0, true);
    view.setUint32(16, size >>> 0, true);
    view.setUint32(20, size >>> 0, true);
    view.setUint16(24, nameBytes.length, true);
    view.setUint16(26, 0, true); // extra len
    view.setUint16(28, 0, true); // comment len
    view.setUint16(30, 0, true); // disk start
    view.setUint16(32, 0, true); // internal attr
    view.setUint32(34, 0, true); // external attr
    view.setUint32(38, offset >>> 0, true);
    return concat(sig, buf);
}

function buildEndOfCentralDirectory(count, cdSize, cdOffset){
    const sig = new Uint8Array([0x50,0x4b,0x05,0x06]);
    const buf = new Uint8Array(18);
    const view = new DataView(buf.buffer);
    view.setUint16(0, 0, true); // this disk
    view.setUint16(2, 0, true); // start disk
    view.setUint16(4, count, true);
    view.setUint16(6, count, true);
    view.setUint32(8, cdSize >>> 0, true);
    view.setUint32(12, cdOffset >>> 0, true);
    view.setUint16(16, 0, true); // comment len
    return concat(sig, buf);
}

function concat(a, b){ const r=new Uint8Array(a.length+b.length); r.set(a,0); r.set(b,a.length); return r; }
function utf8(s){ return new TextEncoder().encode(String(s||'')); }

function crc32(bytes){
    let c = ~0 >>> 0;
    for (let i=0; i<bytes.length; i++){
        c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xFF];
    }
    return (~c) >>> 0;
}

const CRC_TABLE = (()=>{
    const t = new Uint32Array(256);
    for (let i=0;i<256;i++){
        let c=i;
        for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i]=c>>>0;
    }
    return t;
})();

function bind() {
    document.getElementById('reload').addEventListener('click', () => {
        // сброс и повторная загрузка
        state.skip = 0; state.loadedItems = []; state.endReached = false; state.selectedIds.clear();
        document.getElementById('tbody').innerHTML = '';
        loadNext();
    });
    // Фильтры удалены из разметки — сбрасываем на дефолт и сразу подгружаем
    state.type = 6; state.dateFrom = ''; state.dateTo = '';

    const tbody = document.getElementById('tbody');
    tbody.addEventListener('click', onRowAction);
    tbody.addEventListener('change', onRowSelectChange);

    // Кнопки экспорта CSV/XLSX удалены

    document.getElementById('selectAllOnPage').addEventListener('click', async ()=>{
        const checkboxes = document.querySelectorAll('input.rowSel');
        
        // Обновляем состояние
        for(const it of (state.lastItems||[])){
            const id = it.id||it.reportId||it.uid||it.uuid||it.ID; if(!id) continue;
            state.selectedIds.add(String(id));
        }
        
        // Анимированное изменение чекбоксов с задержкой
        for(let i = 0; i < checkboxes.length; i++){
            setTimeout(() => {
                checkboxes[i].checked = true;
            }, i * 30); // 30ms задержка между чекбоксами
        }
        
        // Обновляем счетчик и master checkbox
        setTimeout(() => {
            updateSelectionInfo();
        }, checkboxes.length * 30 + 100);
    });
    document.getElementById('clearSelection').addEventListener('click', async ()=>{
        const checkboxes = document.querySelectorAll('input.rowSel:checked');
        
        // Обновляем состояние
        state.selectedIds.clear();
        
        // Анимированное снятие выбора с задержкой
        for(let i = 0; i < checkboxes.length; i++){
            setTimeout(() => {
                checkboxes[i].checked = false;
            }, i * 20); // 20ms задержка между чекбоксами
        }
        
        // Обновляем счетчик и master checkbox
        setTimeout(() => {
            updateSelectionInfo();
        }, checkboxes.length * 20 + 100);
    });
    const btnZip = document.getElementById('downloadSelectedZip');
    if (btnZip) btnZip.addEventListener('click', async ()=>{
        if(state.selectedIds.size===0){ alert('Не выбрано ни одного отчета'); return; }
        try{
            const ids = [...state.selectedIds];
            const entries = await fetchReportsAsZipEntries(ids);
            if (!entries || entries.length===0){ alert('Не удалось собрать архив.'); return; }
            const combined = await createZipArchive(entries);
            const now = new Date();
            const pad = (n)=> String(n).padStart(2,'0');
            const fname = `reports-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.zip`;
            const url = URL.createObjectURL(combined);
            const a = document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }catch(e){ console.error(e); alert('Ошибка формирования общего архива'); }
    });
    document.getElementById('selectAllToggle').addEventListener('change', async (e)=>{
        const checked = e.target.checked;
        const checkboxes = document.querySelectorAll('input.rowSel');
        
        // Обновляем состояние
        if(checked){
            for(const it of (state.lastItems||[])){
                const id = it.id||it.reportId||it.uid||it.uuid||it.ID; if(!id) continue;
                state.selectedIds.add(String(id));
            }
        } else {
            for(const it of (state.lastItems||[])){
                const id = it.id||it.reportId||it.uid||it.uuid||it.ID; if(!id) continue;
                state.selectedIds.delete(String(id));
            }
        }
        
        // Анимированное изменение чекбоксов с задержкой
        for(let i = 0; i < checkboxes.length; i++){
            setTimeout(() => {
                checkboxes[i].checked = checked;
            }, i * 30); // 30ms задержка между чекбоксами
        }
        
        // Обновляем счетчик
        setTimeout(() => {
            updateSelectionInfo();
        }, checkboxes.length * 30 + 100);
    });

    // IntersectionObserver для ленивой подгрузки
    const sentinel = document.getElementById('sentinel');
    const io = new IntersectionObserver((entries)=>{
        for(const entry of entries){ if(entry.isIntersecting) loadNext(); }
    }, { root: null, rootMargin: '200px', threshold: 0 });
    io.observe(sentinel);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Ждём до 5с токен AuthorizeV3, чтобы избежать 401 на первом запросе
    try { await waitForAuthorizeToken(5000); } catch(_) {}
    bind();
    loadNext();
});

// Ограничиваем массовые скачивания по батчам
async function runBatched(ids, worker, batchSize=3){
    for (let i=0; i<ids.length; i+=batchSize){
        const chunk = ids.slice(i, i+batchSize);
        await Promise.all(chunk.map(worker));
    }
}


