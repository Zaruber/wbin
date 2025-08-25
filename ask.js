// WBin ASK Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация страницы АСК
    initAskPage();
});

// Инициализация страницы АСК
function initAskPage() {
    // Установка текущей даты по умолчанию
    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 7); // Неделя назад по умолчанию
    
    // Пытаемся восстановить последние выбранные даты
    chrome.storage.local.get(['askLastDateFrom', 'askLastDateTo'], function(result) {
        if (result.askLastDateFrom) {
            document.getElementById('askDateFrom').value = result.askLastDateFrom;
        } else {
            document.getElementById('askDateFrom').valueAsDate = defaultFrom;
        }
        
        if (result.askLastDateTo) {
            document.getElementById('askDateTo').value = result.askLastDateTo;
        } else {
            document.getElementById('askDateTo').valueAsDate = today;
        }
    });
    
    // Кнопка для получения данных АСК
    document.getElementById('askFetchData').addEventListener('click', askFetchStatsData);
    
    // Кнопка для перехода на WB
    document.getElementById('askAuthWb').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://cmp.wildberries.ru/campaigns/list' });
    });
    
    // Кнопка для отображения сырых данных
    document.getElementById('askToggleRaw').addEventListener('click', function() {
        const rawDataElement = document.getElementById('askRawData');
        const isHidden = !rawDataElement.classList.contains('show');
        
        if (isHidden) {
            rawDataElement.classList.add('show');
            this.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Скрыть сырые данные
            `;
        } else {
            rawDataElement.classList.remove('show');
            this.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Показать сырые данные
            `;
        }
    });
    
    // Кнопка для копирования данных в буфер обмена
    document.getElementById('askCopyData').addEventListener('click', function() {
        askCopyResultsToClipboard();
    });
    
    // Кнопка для копирования итогов по ID кампаний
    const copyPerCampaignBtn = document.getElementById('askCopyPerCampaign');
    if (copyPerCampaignBtn) {
        copyPerCampaignBtn.addEventListener('click', function() {
            askCopyPerCampaignSummaryToClipboard();
        });
    }

    // Очистка прогресса при открытии страницы
    const progressCard = document.getElementById('askProgressCard');
    const progressList = document.getElementById('askProgressList');
    if (progressCard && progressList) {
        progressCard.style.display = 'none';
        progressList.innerHTML = '';
    }
    
    // Попытка восстановить последний ID рекламы
    chrome.storage.local.get(['askLastAdvertId'], function(result) {
        if (result.askLastAdvertId) {
            document.getElementById('askAdvertId').value = result.askLastAdvertId;
        }
    });
}

// Вспомогательные функции прогресса/таймингов
let askProgressState = null;

function askStartProgress(total) {
    const progressCard = document.getElementById('askProgressCard');
    const progressList = document.getElementById('askProgressList');
    if (!progressCard || !progressList) return;
    
    askProgressState = {
        total: total || 1,
        startedAt: Date.now(),
        success: 0,
        fail: 0,
        current: 0
    };
    progressList.innerHTML = '';
    progressCard.style.display = 'block';
    askUpdateProgressHeader();
}

function askUpdateProgressHeader() {
    const hdr = document.querySelector('#askProgressCard .card-header h3');
    if (!hdr || !askProgressState) return;
    const elapsedSec = ((Date.now() - askProgressState.startedAt) / 1000).toFixed(1);
    hdr.textContent = `Прогресс парсинга — ${askProgressState.current}/${askProgressState.total}, успех: ${askProgressState.success}, ошибки: ${askProgressState.fail} (⏱ ${elapsedSec}с)`;
}

function askFormatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function askProgressLog(message, type = 'info') {
    const progressList = document.getElementById('askProgressList');
    const progressCard = document.getElementById('askProgressCard');
    if (!progressList || !progressCard) return;
    
    const li = document.createElement('li');
    const time = askFormatTime(Date.now());
    li.textContent = `${time} • ${message}`;
    
    if (type === 'error') {
        li.style.color = '#b00020';
        li.classList.add('error');
    }
    if (type === 'success') {
        li.style.color = '#0a7a0a';
        li.classList.add('success');
    }
    
    progressList.appendChild(li);
    progressList.scrollTop = progressList.scrollHeight;
    askUpdateProgressHeader();
}

// Показать сообщение об ошибке в АСК
function askShowError(message) {
    const errorElement = document.getElementById('askError');
    errorElement.textContent = message;
    errorElement.classList.add('show');
    setTimeout(() => {
        errorElement.classList.remove('show');
    }, 5000);
}

// Показать сообщение об успешном копировании в АСК
function askShowCopySuccess() {
    const successElement = document.getElementById('askCopySuccess');
    successElement.classList.add('show');
    setTimeout(() => {
        successElement.classList.remove('show');
    }, 2000);
}

// Функция для получения данных статистики АСК
function askFetchStatsData() {
    const advertIdRaw = document.getElementById('askAdvertId').value.trim();
    if (!advertIdRaw) {
        askShowError('Пожалуйста, введите ID рекламы');
        return;
    }

    const dateFrom = document.getElementById('askDateFrom').value;
    const dateTo = document.getElementById('askDateTo').value;

    if (!dateFrom || !dateTo) {
        askShowError('Пожалуйста, выберите даты');
        return;
    }

    // Поддержка множественного ввода: запятая, точка с запятой, пробелы, переносы строк
    const idList = advertIdRaw
        .split(/[\n,;\s]+/)
        .map(v => v.trim())
        .filter(v => v.length > 0);

    if (idList.length === 0) {
        askShowError('Не удалось распознать ID рекламы');
        return;
    }

    // Сохраняем исходную строку ID и даты
    chrome.storage.local.set({ 
        'askLastAdvertId': advertIdRaw,
        'askLastDateFrom': dateFrom,
        'askLastDateTo': dateTo
    });

    // Отображаем блок результатов
    document.getElementById('askResults').style.display = 'block';

    if (idList.length === 1) {
        askStartProgress(1);
        askFetchSingleStatsData(idList[0], dateFrom, dateTo);
    } else {
        askStartProgress(idList.length);
        askFetchMultipleStatsData(idList, dateFrom, dateTo);
    }
}

function askFetchSingleStatsData(advertId, dateFrom, dateTo) {
    const fetchButton = document.getElementById('askFetchData');
    const originalText = fetchButton.textContent;
    fetchButton.textContent = 'Загрузка...';
    fetchButton.disabled = true;

    askProgressLog(`ID ${advertId}: старт`);

    chrome.runtime.sendMessage({
        action: 'askFetchData',
        params: { advertId, dateFrom, dateTo }
    }, function(response) {
        fetchButton.textContent = originalText;
        fetchButton.disabled = false;

        const headerEl = document.getElementById('askResultsHeader');
        if (headerEl) headerEl.textContent = 'Результаты анализа';
        const mainCard = document.getElementById('askMainSummaryCard');
        if (mainCard) mainCard.style.display = 'block';
        const perCamp = document.getElementById('askPerCampaignSummary');
        if (perCamp) perCamp.style.display = 'none';

        askProgressState.current = 1;
        askDisplayRawData(response || { error: 'Нет ответа от background скрипта' });

        if (response && response.success && response.data) {
            askProgressState.success += 1;
            askProgressLog(`ID ${advertId}: успех`, 'success');
            askProcessData(response.data);
        } else {
            askProgressState.fail += 1;
            askProgressLog(`ID ${advertId}: ошибка — ${response ? (response.error || 'нет ответа') : 'нет ответа'}`, 'error');
            console.error('Ошибка при получении данных АСК:', response ? response.error : 'Ответ не получен');
            askShowError('Ошибка при получении данных. Авторизуйтесь на сайте WB и попробуйте снова.');
        }
    });
}

async function askFetchMultipleStatsData(idList, dateFrom, dateTo) {
    const fetchButton = document.getElementById('askFetchData');
    const originalText = fetchButton.textContent;
    fetchButton.disabled = true;

    try {
        const aggregated = { content: { nmStats: [], sideNmStats: [], sum_price: 0 } };
        const nmStatsMap = {};
        const sideNmStatsMap = {};
        const rawPerId = [];
        const perCampaign = [];
        const baseDelayMs = 2500;

        for (let i = 0; i < idList.length; i++) {
            const id = idList[i];
            fetchButton.textContent = `Загрузка ${i + 1}/${idList.length}...`;
            askProgressState.current = i;
            askProgressLog(`ID ${id}: старт`);

            let response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'askFetchData',
                    params: { advertId: id, dateFrom, dateTo }
                }, (resp) => resolve(resp));
            });

            if (!(response && response.success)) {
                askProgressLog(`ID ${id}: ошибка, готовим повтор...`, 'error');
                const retryWait = baseDelayMs + Math.floor(Math.random() * 700);
                askProgressLog(`ID ${id}: ретрай через ${retryWait} мс`);
                await askSleep(retryWait);
                response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'askFetchData',
                        params: { advertId: id, dateFrom, dateTo }
                    }, (resp) => resolve(resp));
                });
            }

            rawPerId.push({ id, response });

            if (!(response && response.success && response.data)) {
                console.warn('Пропускаем ID из-за ошибки:', id, response && response.error);
                askProgressState.fail += 1;
                askProgressLog(`ID ${id}: не удалось получить данные`, 'error');
                continue;
            }

            const unified = askToUnifiedFormat(response.data);
            if (!unified || !unified.content) {
                console.warn('Неизвестный формат данных, пропускаем ID', id);
                askProgressState.fail += 1;
                askProgressLog(`ID ${id}: неизвестный формат данных`, 'error');
                continue;
            }

            aggregated.content.sum_price += (unified.content.sum_price || 0);

            if (Array.isArray(unified.content.nmStats)) {
                unified.content.nmStats.forEach((item) => {
                    if (item.imt_nm_stats && Array.isArray(item.imt_nm_stats) && item.imt_nm_stats.length > 0) {
                        item.imt_nm_stats.forEach((variation) => {
                            const key = String(variation.nm_id || variation.nmId || 'unknown');
                            if (!nmStatsMap[key]) {
                                nmStatsMap[key] = { 
                                    nm_id: key, 
                                    name: variation.name || item.name || '', 
                                    atbs: 0, 
                                    sum_price: 0,
                                    views: 0,
                                    clicks: 0,
                                    shks: 0,
                                    spend: 0,
                                    avg_position: 0,
                                    ctr: 0,
                                    cr: 0,
                                    cpm: 0,
                                    cpc: 0,
                                    cpo: 0
                                };
                            }
                            nmStatsMap[key].atbs += (variation.atbs || 0);
                            nmStatsMap[key].sum_price += (variation.sum_price || 0);
                            nmStatsMap[key].views += (variation.views || 0);
                            nmStatsMap[key].clicks += (variation.clicks || 0);
                            nmStatsMap[key].shks += (variation.shks || 0);
                            nmStatsMap[key].spend += (variation.spend || 0);
                            if (variation.avg_position != null) {
                                nmStatsMap[key].avg_position = (nmStatsMap[key].avg_position + variation.avg_position) / 2;
                            }
                            if (variation.ctr != null) {
                                nmStatsMap[key].ctr = (nmStatsMap[key].ctr + variation.ctr) / 2;
                            }
                            if (variation.cr != null) {
                                nmStatsMap[key].cr = (nmStatsMap[key].cr + variation.cr) / 2;
                            }
                            if (variation.cpm != null) {
                                nmStatsMap[key].cpm = (nmStatsMap[key].cpm + variation.cpm) / 2;
                            }
                            if (variation.cpc != null) {
                                nmStatsMap[key].cpc = (nmStatsMap[key].cpc + variation.cpc) / 2;
                            }
                            if (variation.cpo != null) {
                                nmStatsMap[key].cpo = (nmStatsMap[key].cpo + variation.cpo) / 2;
                            }
                        });
                    } else {
                        const key = String(item.nm_id || item.nmId || 'unknown');
                        if (!nmStatsMap[key]) {
                            nmStatsMap[key] = { 
                                nm_id: key, 
                                name: item.name || '', 
                                atbs: 0, 
                                sum_price: 0,
                                views: 0,
                                clicks: 0,
                                shks: 0,
                                spend: 0,
                                avg_position: 0,
                                ctr: 0,
                                cr: 0,
                                cpm: 0,
                                cpc: 0,
                                cpo: 0
                            };
                        }
                        nmStatsMap[key].atbs += (item.atbs || 0);
                        nmStatsMap[key].sum_price += (item.sum_price || 0);
                        nmStatsMap[key].views += (item.views || 0);
                        nmStatsMap[key].clicks += (item.clicks || 0);
                        nmStatsMap[key].shks += (item.shks || 0);
                        nmStatsMap[key].spend += (item.spend || 0);
                        if (item.avg_position != null) {
                            nmStatsMap[key].avg_position = (nmStatsMap[key].avg_position + item.avg_position) / 2;
                        }
                        if (item.ctr != null) {
                            nmStatsMap[key].ctr = (nmStatsMap[key].ctr + item.ctr) / 2;
                        }
                        if (item.cr != null) {
                            nmStatsMap[key].cr = (nmStatsMap[key].cr + item.cr) / 2;
                        }
                        if (item.cpm != null) {
                            nmStatsMap[key].cpm = (nmStatsMap[key].cpm + item.cpm) / 2;
                        }
                        if (item.cpc != null) {
                            nmStatsMap[key].cpc = (nmStatsMap[key].cpc + item.cpc) / 2;
                        }
                        if (item.cpo != null) {
                            nmStatsMap[key].cpo = (nmStatsMap[key].cpo + item.cpo) / 2;
                        }
                    }
                });
            }

            if (Array.isArray(unified.content.sideNmStats)) {
                unified.content.sideNmStats.forEach((item) => {
                    const key = String(item.nm_id || item.nmId || 'unknown');
                    if (!sideNmStatsMap[key]) {
                        sideNmStatsMap[key] = { nm_id: key, name: item.name || '', atbs: 0, orders: 0, shks: 0, sum_price: 0 };
                    }
                    sideNmStatsMap[key].atbs += (item.atbs || 0);
                    sideNmStatsMap[key].orders += (item.orders || 0);
                    sideNmStatsMap[key].shks += (item.shks || 0);
                    sideNmStatsMap[key].sum_price += (item.sum_price || 0);
                });
            }

            let atbsNm = 0;
            let goodsNm = 0;
            if (Array.isArray(unified.content.nmStats)) {
                unified.content.nmStats.forEach((it) => {
                    if (it.imt_nm_stats && Array.isArray(it.imt_nm_stats) && it.imt_nm_stats.length > 0) {
                        it.imt_nm_stats.forEach((variation) => {
                            atbsNm += (variation.atbs || 0);
                            goodsNm += (variation.shks || 0);
                        });
                    } else {
                        atbsNm += (it.atbs || 0);
                        goodsNm += (it.shks || 0);
                    }
                });
            }
            let assocAtbs = 0, assocGoods = 0, assocPrice = 0;
            if (Array.isArray(unified.content.sideNmStats)) {
                unified.content.sideNmStats.forEach((it) => {
                    assocAtbs += (it.atbs || 0);
                    assocGoods += (it.shks || 0);
                    assocPrice += (it.sum_price || 0);
                });
            }
            
            console.log('Итоги по РК', id, {
                base_atbs: atbsNm,
                base_goods: goodsNm,
                assoc_atbs: assocAtbs,
                assoc_goods: assocGoods,
                assoc_price: assocPrice
            });
            perCampaign.push({ id, atbsNm, goodsNm, assocAtbs, assocGoods, assocPrice });
            askProgressState.success += 1;
            askProgressLog(`ID ${id}: успех (корзины=${atbsNm}, ас.товары=${assocGoods}, ас.руб=${assocPrice})`, 'success');

            if (i < idList.length - 1) {
                const jitter = Math.floor(Math.random() * 500);
                const waitMs = baseDelayMs + jitter;
                fetchButton.textContent = `Пауза ${i + 1}/${idList.length}…`;
                askProgressLog(`ID ${id}: пауза ${waitMs} мс`);
                await askSleep(waitMs);
            }
            askProgressState.current = i + 1;
            askUpdateProgressHeader();
        }

        aggregated.content.nmStats = Object.values(nmStatsMap);
        aggregated.content.sideNmStats = Object.values(sideNmStatsMap);

        askDisplayRawData({ items: rawPerId });
        const headerEl = document.getElementById('askResultsHeader');
        if (headerEl) headerEl.textContent = 'Результаты анализа (агрегировано)';
        const mainCard = document.getElementById('askMainSummaryCard');
        if (mainCard) mainCard.style.display = 'block';

        try {
            const container = document.getElementById('askPerCampaignSummary');
            const tbody = document.getElementById('askPerCampaignSummaryBody');
            if (container && tbody) {
                tbody.innerHTML = '';
                perCampaign.forEach((row) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row.id}</td>
                        <td>${row.atbsNm}</td>
                        <td>${row.goodsNm}</td>
                        <td>${row.assocAtbs}</td>
                        <td>${row.assocGoods}</td>
                        <td>${new Intl.NumberFormat('ru-RU').format(row.assocPrice)}</td>
                    `;
                    tbody.appendChild(tr);
                });
                container.style.display = perCampaign.length > 0 ? 'block' : 'none';
            }
            askFillBaseTableForMultiple(rawPerId);
            askFillAssocTableForMultiple(rawPerId);
        } catch (e) {
            console.warn('Не удалось отобразить итоги по ID кампаний:', e);
        }

        askProgressLog(`Готово: успех=${askProgressState.success}, ошибки=${askProgressState.fail}, всего=${askProgressState.total}`);
    } catch (e) {
        console.error('Ошибка при массовой загрузке АСК:', e);
        askShowError('Ошибка при массовой загрузке данных АСК');
    } finally {
        fetchButton.textContent = originalText;
        fetchButton.disabled = false;
    }
}

function askSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function askToUnifiedFormat(data) {
    if (data && data.content && data.content.nmStats) {
        return data;
    }
    if (data && data.stats) {
        return askConvertApiV5DataToOldFormat(data);
    }
    return null;
}

// Функция для обработки данных АСК из API
function askProcessData(data) {
    console.log('Обрабатываем данные API АСК:', data);
    
    if (!data) {
        askShowError('Получены некорректные данные');
        console.error('Некорректные данные для обработки: данные отсутствуют');
        return;
    }
    
    let campaignData = null;
    
    if (data.content && data.content.nmStats) {
        campaignData = data;
    } else if (data.stats) {
        campaignData = askConvertApiV5DataToOldFormat(data);
    } else {
        console.log('Неизвестная структура данных API:', data);
        askShowError('Неизвестный формат данных API');
        return;
    }
    
    console.log('Нормализованные данные АСК:', campaignData);
    
    const content = campaignData.content;
    const totalSumPrice = content.sum_price || 0;
    
    let totalAtbsNmStats = 0;
    let totalOrdersNmStats = 0;
    let nmStatsSumPrice = 0;
    
    if (content.nmStats && content.nmStats.length > 0) {
        console.log('nmStats:', content.nmStats);
        content.nmStats.forEach(item => {
            totalAtbsNmStats += (item.atbs || 0);
            totalOrdersNmStats += (item.shks || 0);
            console.log('Артикул:', item.nm_id, 'atbs:', item.atbs, 'shks:', item.shks);
        });
        
        nmStatsSumPrice = content.nmStats[0].sum_price || 0;
    } else {
        console.log('Массив nmStats пуст - нет данных по основным артикулам для данного периода');
    }
    
    let associatedAtbs = 0;
    let associatedGoods = 0;
    let associatedPrice = 0;
    
    if (content.sideNmStats && content.sideNmStats.length > 0) {
        console.log('sideNmStats (ассоциированные конверсии):', content.sideNmStats);
        content.sideNmStats.forEach(item => {
            associatedAtbs += (item.atbs || 0);
            associatedGoods += (item.shks || 0);
            associatedPrice += (item.sum_price || 0);
            console.log('Ассоциированный артикул:', item.nm_id, 'atbs:', item.atbs, 'orders:', item.orders, 'sum_price:', item.sum_price);
        });
    } else {
        console.log('Массив sideNmStats пуст - нет ассоциированных конверсий для данного периода');
    }
    
    console.log('Данные АСК для отображения:', {
        totalAtbsNmStats,
        totalSumPrice,
        nmStatsSumPrice,
        associatedPrice,
        associatedAtbs,
        associatedGoods,
        nmStatsLength: content.nmStats ? content.nmStats.length : 0,
        sideNmStatsLength: content.sideNmStats ? content.sideNmStats.length : 0
    });
    
    askFillBaseAndAssocTables({
        advertId: (data && data.content && data.content.advertId) || (data && data.advertId) || '—',
        nmStats: content.nmStats || [],
        sideNmStats: content.sideNmStats || []
    });
}

// Функция для преобразования данных из нового API v5/fullstat в старый формат для АСК
function askConvertApiV5DataToOldFormat(apiData) {
    console.log('Конвертируем данные из API v5 в старый формат для АСК');
    
    const result = {
        content: {
            advertId: apiData.advertId || apiData.advert_id || apiData.id || undefined,
            nmStats: [],
            sideNmStats: [],
            sum_price: 0
        }
    };
    
    let totalSumPrice = 0;
    
    if (apiData.stats && apiData.stats.length > 0) {
        const nmStatsMap = {};
        
        apiData.stats.forEach(stat => {
            totalSumPrice += (stat.sum_price || 0);
            
            const nmId = stat.nm_id;
            
            if (!nmStatsMap[nmId]) {
                nmStatsMap[nmId] = {
                    nm_id: nmId,
                    name: stat.subject || "",
                    atbs: 0,
                    sum_price: 0
                };
            }
            
            nmStatsMap[nmId].atbs += (stat.atbs || 0);
            nmStatsMap[nmId].sum_price += (stat.sum_price || 0);
        });
        
        result.content.nmStats = Object.values(nmStatsMap);
        result.content.sum_price = totalSumPrice;
    }
    
    if (apiData.sideStats && apiData.sideStats.length > 0) {
        console.log('Обрабатываем ассоциированные конверсии (sideStats)');
        
        const sideNmStatsMap = {};
        
        apiData.sideStats.forEach(stat => {
            const nmId = stat.nm_id;
            
            if (!sideNmStatsMap[nmId]) {
                sideNmStatsMap[nmId] = {
                    nm_id: nmId,
                    name: stat.subject || "",
                    atbs: 0,
                    orders: 0,
                    shks: 0,
                    sum_price: 0
                };
            }
            
            sideNmStatsMap[nmId].atbs += (stat.atbs || 0);
            sideNmStatsMap[nmId].orders += (stat.orders || 0);
            sideNmStatsMap[nmId].shks += (stat.shks || 0);
            sideNmStatsMap[nmId].sum_price += (stat.sum_price || 0);
        });
        
        result.content.sideNmStats = Object.values(sideNmStatsMap);
    }
    
    return result;
}

// Заполнение двух таблиц: базовая статистика и ассоциированные конверсии
function askFillBaseAndAssocTables({ advertId, nmStats, sideNmStats }) {
    const baseBody = document.getElementById('askBaseStatsBody');
    const assocBody = document.getElementById('askAssocBody');
    if (baseBody) baseBody.innerHTML = '';
    if (assocBody) assocBody.innerHTML = '';

    const fmt = new Intl.NumberFormat('ru-RU');

    if (baseBody && Array.isArray(nmStats)) {
        nmStats.forEach((item) => {
            if (item.imt_nm_stats && Array.isArray(item.imt_nm_stats) && item.imt_nm_stats.length > 0) {
                item.imt_nm_stats.forEach((variation) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${advertId || '—'}</td>
                        <td>${variation.nm_id || ''}</td>
                        <td>${variation.avg_position != null ? variation.avg_position : ''}</td>
                        <td>${variation.spend != null ? fmt.format(variation.spend) : ''}</td>
                        <td>${variation.sum_price != null ? fmt.format(variation.sum_price) : ''}</td>
                        <td>${variation.views != null ? variation.views : ''}</td>
                        <td>${variation.clicks != null ? variation.clicks : ''}</td>
                        <td>${variation.atbs != null ? variation.atbs : 0}</td>
                        <td>${variation.shks != null ? variation.shks : ''}</td>
                        <td>${variation.ctr != null ? variation.ctr : ''}</td>
                        <td>${variation.cr != null ? variation.cr : ''}</td>
                        <td>${variation.cpm != null ? variation.cpm : ''}</td>
                        <td>${variation.cpc != null ? variation.cpc : ''}</td>
                        <td>${variation.cpo != null ? variation.cpo : ''}</td>
                    `;
                    baseBody.appendChild(row);
                });
            } else {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${advertId || '—'}</td>
                    <td>${item.nm_id || ''}</td>
                    <td>${item.avg_position != null ? item.avg_position : ''}</td>
                    <td>${item.spend != null ? fmt.format(item.spend) : ''}</td>
                    <td>${item.sum_price != null ? fmt.format(item.sum_price) : ''}</td>
                    <td>${item.views != null ? item.views : ''}</td>
                    <td>${item.clicks != null ? item.clicks : ''}</td>
                    <td>${item.atbs != null ? item.atbs : 0}</td>
                    <td>${item.shks != null ? item.shks : ''}</td>
                    <td>${item.ctr != null ? item.ctr : ''}</td>
                    <td>${item.cr != null ? item.cr : ''}</td>
                    <td>${item.cpm != null ? item.cpm : ''}</td>
                    <td>${item.cpc != null ? item.cpc : ''}</td>
                    <td>${item.cpo != null ? item.cpo : ''}</td>
                `;
                baseBody.appendChild(row);
            }
        });
    }

    askPopulateAssociatedDetailsTable(sideNmStats || []);
}

// Функция для заполнения таблицы с детализацией ассоциированных конверсий АСК
function askPopulateAssociatedDetailsTable(sideNmStats) {
    const assocBody = document.getElementById('askAssocBody');
    if (!assocBody) return;
    assocBody.innerHTML = '';
    if (!sideNmStats || sideNmStats.length === 0) return;
    
    const sortedStats = sideNmStats.sort((a, b) => (b.sum_price || 0) - (a.sum_price || 0));
    const fmt = new Intl.NumberFormat('ru-RU');
    
    sortedStats.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nm_id}</td>
            <td>${fmt.format(item.sum_price || 0)}</td>
            <td>${item.atbs || 0}</td>
            <td>${item.shks || 0}</td>
        `;
        assocBody.appendChild(tr);
    });
}

// Функция для копирования результатов АСК в буфер обмена
function askCopyResultsToClipboard() {
    const baseTable = document.getElementById('askBaseStatsBody');
    const assocTable = document.getElementById('askAssocBody');
    
    if (!baseTable || !assocTable) {
        askShowError('Таблицы не найдены');
        return;
    }
    
    let dataToCopy = '';
    
    dataToCopy += 'БАЗОВАЯ СТАТИСТИКА\n';
    dataToCopy += 'ID кампании\tАртикул\tСр. позиция\tЗатраты\tЗаказы, руб\tПоказы\tКлики\tКорзины\tЗаказы, шт\tCTR\tCR\tCPM\tCPC\tCPO\n';
    
    for (const row of baseTable.children) {
        const cells = row.children;
        if (cells.length >= 14) {
            const rowData = [];
            for (let i = 0; i < 14; i++) {
                const cellText = cells[i].textContent.trim();
                const cleanValue = cellText.replace(/\s/g, '').replace(/,/g, '.');
                rowData.push(cleanValue);
            }
            dataToCopy += rowData.join('\t') + '\n';
        }
    }
    
    dataToCopy += '\nАССОЦИИРОВАННЫЕ КОНВЕРСИИ\n';
    dataToCopy += 'ID кампании\tАртикул\tЗаказов на сумму\tКорзины\tЗаказы, шт\n';
    
    for (const row of assocTable.children) {
        const cells = row.children;
        if (cells.length >= 5) {
            const campaignId = cells[0].textContent.trim();
            const articul = cells[1].textContent.trim();
            const sumRaw = cells[2].textContent.trim();
            const baskets = cells[3].textContent.trim();
            const orders = cells[4].textContent.trim();
            const sumClean = sumRaw.replace(/\s/g, '').replace(/,/g, '.');
            dataToCopy += `${campaignId}\t${articul}\t${sumClean}\t${baskets}\t${orders}\n`;
        }
    }
    
    navigator.clipboard.writeText(dataToCopy)
        .then(() => {
            console.log('Обе таблицы АСК скопированы в буфер обмена');
            askShowCopySuccess();
        })
        .catch(err => {
            console.error('Не удалось скопировать данные АСК:', err);
            askShowError('Не удалось скопировать данные. Проверьте разрешения.');
        });
}

// Копирование итогов по ID кампаний в буфер обмена
function askCopyPerCampaignSummaryToClipboard() {
    const tbody = document.getElementById('askPerCampaignSummaryBody');
    if (!tbody || tbody.children.length === 0) {
        askShowError('Нет итогов для копирования');
        return;
    }

    const rows = [];
    rows.push('ID Кампании\tКорзины (Базовые)\tЗаказы (Базовые)\tКорзины (Ас.К)\tЗаказы, шт (Ас.К)\tЗаказы, руб (Ас.К)');
    
    for (const tr of tbody.children) {
        const tds = tr.children;
        if (tds.length >= 6) {
            const id = tds[0].textContent.trim();
            const baseAtbs = tds[1].textContent.trim();
            const baseGoods = tds[2].textContent.trim();
            const assocAtbs = tds[3].textContent.trim();
            const assocGoods = tds[4].textContent.trim();
            const assocPriceRaw = tds[5].textContent.trim();
            const assocPrice = assocPriceRaw.replace(/[^\d\-,.]/g, '');
            rows.push(`${id}\t${baseAtbs}\t${baseGoods}\t${assocAtbs}\t${assocGoods}\t${assocPrice}`);
        }
    }

    const text = rows.join('\n');
    navigator.clipboard.writeText(text)
        .then(() => askShowCopySuccess())
        .catch((e) => {
            console.error('Не удалось скопировать итоги по ID кампаний:', e);
            askShowError('Не удалось скопировать итоги по ID кампаний');
        });
}

// Отображение сырых данных АСК в виде форматированного JSON
function askDisplayRawData(data) {
    const rawDataElement = document.getElementById('askRawData');
    try {
        const formattedData = JSON.stringify(data, null, 2);
        rawDataElement.textContent = formattedData;
        rawDataElement.classList.add('show');
        
        const toggleButton = document.getElementById('askToggleRaw');
        if (toggleButton) {
            toggleButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Скрыть сырые данные
            `;
        }
    } catch (e) {
        console.error('Ошибка при форматировании JSON:', e);
        rawDataElement.textContent = 'Ошибка форматирования данных: ' + e.message;
        rawDataElement.classList.add('show');
    }
}

function askFillBaseTableForMultiple(rawPerId) {
    const baseBody = document.getElementById('askBaseStatsBody');
    if (!baseBody) return;
    baseBody.innerHTML = '';

    const fmt = new Intl.NumberFormat('ru-RU');

    rawPerId.forEach(({ id, response }) => {
        if (!(response && response.success && response.data)) return;
        const unified = askToUnifiedFormat(response.data);
        if (!(unified && unified.content && Array.isArray(unified.content.nmStats))) return;

        unified.content.nmStats.forEach((item) => {
            if (item.imt_nm_stats && Array.isArray(item.imt_nm_stats) && item.imt_nm_stats.length > 0) {
                item.imt_nm_stats.forEach((variation) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${id}</td>
                        <td>${variation.nm_id || ''}</td>
                        <td>${variation.avg_position != null ? variation.avg_position : ''}</td>
                        <td>${variation.spend != null ? fmt.format(variation.spend) : ''}</td>
                        <td>${variation.sum_price != null ? fmt.format(variation.sum_price) : ''}</td>
                        <td>${variation.views != null ? variation.views : ''}</td>
                        <td>${variation.clicks != null ? variation.clicks : ''}</td>
                        <td>${variation.atbs != null ? variation.atbs : 0}</td>
                        <td>${variation.shks != null ? variation.shks : ''}</td>
                        <td>${variation.ctr != null ? variation.ctr : ''}</td>
                        <td>${variation.cr != null ? variation.cr : ''}</td>
                        <td>${variation.cpm != null ? variation.cpm : ''}</td>
                        <td>${variation.cpc != null ? variation.cpc : ''}</td>
                        <td>${variation.cpo != null ? variation.cpo : ''}</td>
                    `;
                    baseBody.appendChild(row);
                });
            } else {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${id}</td>
                    <td>${item.nm_id || ''}</td>
                    <td>${item.avg_position != null ? item.avg_position : ''}</td>
                    <td>${item.spend != null ? fmt.format(item.spend) : ''}</td>
                    <td>${item.sum_price != null ? fmt.format(item.sum_price) : ''}</td>
                    <td>${item.views != null ? item.views : ''}</td>
                    <td>${item.clicks != null ? item.clicks : ''}</td>
                    <td>${item.atbs != null ? item.atbs : 0}</td>
                    <td>${item.shks != null ? item.shks : ''}</td>
                    <td>${item.ctr != null ? item.ctr : ''}</td>
                    <td>${item.cr != null ? item.cr : ''}</td>
                    <td>${item.cpm != null ? item.cpm : ''}</td>
                    <td>${item.cpc != null ? item.cpc : ''}</td>
                    <td>${item.cpo != null ? item.cpo : ''}</td>
                `;
                baseBody.appendChild(row);
            }
        });
    });
}

function askFillAssocTableForMultiple(rawPerId) {
    const assocBody = document.getElementById('askAssocBody');
    if (!assocBody) return;
    assocBody.innerHTML = '';

    const fmt = new Intl.NumberFormat('ru-RU');

    rawPerId.forEach(({ id, response }) => {
        if (!(response && response.success && response.data)) return;
        const unified = askToUnifiedFormat(response.data);
        if (!(unified && unified.content && Array.isArray(unified.content.sideNmStats))) return;

        unified.content.sideNmStats.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${id}</td>
                <td>${item.nm_id || ''}</td>
                <td>${fmt.format(item.sum_price || 0)}</td>
                <td>${item.atbs || 0}</td>
                <td>${item.shks || 0}</td>
            `;
            assocBody.appendChild(row);
        });
    });
}

