document.addEventListener('DOMContentLoaded', function() {
    // Переключение между вкладками
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            // Удаляем класс active у всех элементов навигации и скрываем все секции
            navItems.forEach(nav => nav.classList.remove('active'));
            contentSections.forEach(content => content.style.display = 'none');
            
            // Добавляем класс active к выбранному элементу
            this.classList.add('active');
            
            // Показываем соответствующий контент
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).style.display = 'block';
        });
    });
    
    // Инициализация вкладки АСК
    initAskTab();
    
    // Обработка нажатия на кнопку отчёта для кампаний
    const campaignsReportBtn = document.getElementById('campaigns-report-btn');
    if (campaignsReportBtn) {
        campaignsReportBtn.addEventListener('click', function() {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];
                if (currentTab.url.includes('cmp.wildberries.ru/campaigns/list')) {
                    chrome.runtime.sendMessage({ action: 'generateReport', type: 'campaigns' });
                    window.close();
                } else {
                    alert('Пожалуйста, перейдите на страницу кампаний Wildberries согласно инструкции.');
                }
            });
        });
    }
    
    // Обработка нажатия на кнопку отчёта для статистики
    const statisticsReportBtn = document.getElementById('statistics-report-btn');
    if (statisticsReportBtn) {
        statisticsReportBtn.addEventListener('click', function() {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];
                if (currentTab.url.includes('cmp.wildberries.ru/campaigns/statistics')) {
                    chrome.runtime.sendMessage({ action: 'generateReport', type: 'statistics' });
                    window.close();
                } else {
                    alert('Пожалуйста, перейдите на страницу статистики Wildberries согласно инструкции.');
                }
            });
        });
    }
});

// Инициализация вкладки АСК
function initAskTab() {
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
            this.textContent = 'Скрыть сырые данные';
        } else {
            rawDataElement.classList.remove('show');
            this.textContent = 'Показать сырые данные';
        }
    });
    
    // Кнопка для копирования данных в буфер обмена
    document.getElementById('askCopyData').addEventListener('click', function() {
        askCopyResultsToClipboard();
    });
    
    // Кнопка для копирования детализированной таблицы
    document.getElementById('askCopyDetailsData').addEventListener('click', function() {
        askCopyDetailsTableToClipboard();
    });

    // Кнопка для копирования итогов по ID кампаний (если есть)
    const copyPerCampaignBtn = document.getElementById('askCopyPerCampaign');
    if (copyPerCampaignBtn) {
        copyPerCampaignBtn.addEventListener('click', function() {
            askCopyPerCampaignSummaryToClipboard();
        });
    }

    // Очистка прогресса при открытии вкладки
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
    const hdr = document.querySelector('#askProgressCard .card-header h4');
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
    if (type === 'error') li.style.color = '#b00020';
    if (type === 'success') li.style.color = '#0a7a0a';
    progressList.appendChild(li);
    // автопрокрутка вниз
    progressList.scrollTop = progressList.scrollHeight;
    askUpdateProgressHeader();
}
// Копирование итогов по ID кампаний в буфер обмена (TSV)
function askCopyPerCampaignSummaryToClipboard() {
    const tbody = document.getElementById('askPerCampaignSummaryBody');
    if (!tbody || tbody.children.length === 0) {
        askShowError('Нет итогов для копирования');
        return;
    }

    const rows = [];
    rows.push('ID РК\tКорзины (РК)\tАс. Конверсии, руб\tАс. Корзины, шт\tАс. Заказы, шт');
    for (const tr of tbody.children) {
        const tds = tr.children;
        if (tds.length >= 5) {
            const id = tds[0].textContent.trim();
            const atbs = tds[1].textContent.trim();
            const priceRaw = tds[2].textContent.trim();
            const price = priceRaw.replace(/[^\d\-,.]/g, '');
            const assocAtbs = tds[3].textContent.trim();
            const assocOrders = tds[4].textContent.trim();
            rows.push(`${id}\t${atbs}\t${price}\t${assocAtbs}\t${assocOrders}`);
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

// Показать сообщение об успешном копировании деталей в АСК
function askShowCopyDetailsSuccess() {
    const successElement = document.getElementById('askCopyDetailsSuccess');
    successElement.classList.add('show');
    setTimeout(() => {
        successElement.classList.remove('show');
    }, 2000);
}

// Функция для копирования результатов АСК в буфер обмена
function askCopyResultsToClipboard() {
    const atbsValue = document.getElementById('askAtbs').textContent;
    const associatedPriceValue = document.getElementById('askAssociatedPrice').textContent;
    const associatedAtbsValue = document.getElementById('askAssociatedAtbs').textContent;
    const associatedOrdersValue = document.getElementById('askAssociatedOrders').textContent;
    
    // Убираем знак валюты и другие символы форматирования
    const cleanPrice = associatedPriceValue.replace(/[^\d\-,.]/g, '');
    
    // Форматируем данные в формате для вставки в таблицу (TSV - Tab Separated Values)
    const dataToCopy = `${atbsValue}\t${cleanPrice}\t${associatedAtbsValue}\t${associatedOrdersValue}`;
    
    // Копируем в буфер обмена
    navigator.clipboard.writeText(dataToCopy)
        .then(() => {
            console.log('Данные АСК скопированы в буфер обмена:', dataToCopy);
            askShowCopySuccess();
        })
        .catch(err => {
            console.error('Не удалось скопировать данные АСК:', err);
            askShowError('Не удалось скопировать данные. Проверьте разрешения.');
        });
}

// Отображение сырых данных АСК в виде форматированного JSON
function askDisplayRawData(data) {
    const rawDataElement = document.getElementById('askRawData');
    try {
        // Форматирование JSON с отступами для читабельности
        const formattedData = JSON.stringify(data, null, 2);
        rawDataElement.textContent = formattedData;
        rawDataElement.classList.add('show');
        
        // Изменяем текст кнопки
        const toggleButton = document.getElementById('askToggleRaw');
        if (toggleButton) {
            toggleButton.textContent = 'Скрыть сырые данные';
        }
    } catch (e) {
        console.error('Ошибка при форматировании JSON:', e);
        rawDataElement.textContent = 'Ошибка форматирования данных: ' + e.message;
        rawDataElement.classList.add('show');
    }
}

// Функция для получения данных статистики АСК через background script (поддержка нескольких ID)
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

        // Обычный одиночный режим: показываем основную сводку
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
        const perCampaign = []; // для итогов по каждому ID
        const baseDelayMs = 2500; // базовая задержка между запросами для снижения 429

        for (let i = 0; i < idList.length; i++) {
            const id = idList[i];
            fetchButton.textContent = `Загрузка ${i + 1}/${idList.length}...`;
            askProgressState.current = i; // до начала обработки текущего
            askProgressLog(`ID ${id}: старт`);

            // eslint-disable-next-line no-await-in-loop
            let response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'askFetchData',
                    params: { advertId: id, dateFrom, dateTo }
                }, (resp) => resolve(resp));
            });

            // Простой ретрай: если нет успеха, подождём и повторим 1 раз
            if (!(response && response.success)) {
                askProgressLog(`ID ${id}: ошибка, готовим повтор...`, 'error');
                const retryWait = baseDelayMs + Math.floor(Math.random() * 700);
                askProgressLog(`ID ${id}: ретрай через ${retryWait} мс`);
                await askSleep(retryWait);
                // eslint-disable-next-line no-await-in-loop
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
                    const key = String(item.nm_id || item.nmId || 'unknown');
                    if (!nmStatsMap[key]) {
                        nmStatsMap[key] = { nm_id: key, name: item.name || '', atbs: 0, sum_price: 0 };
                    }
                    nmStatsMap[key].atbs += (item.atbs || 0);
                    nmStatsMap[key].sum_price += (item.sum_price || 0);
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

            // Подсчет итогов по данному ID
            let atbsNm = 0;
            if (Array.isArray(unified.content.nmStats)) {
                unified.content.nmStats.forEach((it) => { atbsNm += (it.atbs || 0); });
            }
            let assocAtbs = 0, assocOrders = 0, assocPrice = 0;
            if (Array.isArray(unified.content.sideNmStats)) {
                unified.content.sideNmStats.forEach((it) => {
                    assocAtbs += (it.atbs || 0);
                    assocOrders += (it.orders || 0);
                    assocPrice += (it.sum_price || 0);
                });
            }
            perCampaign.push({ id, atbsNm, assocPrice, assocAtbs, assocOrders });
            askProgressState.success += 1;
            askProgressLog(`ID ${id}: успех (корзины=${atbsNm}, ас.руб=${assocPrice})`, 'success');

            // Пауза между запросами, чтобы сгладить всплески (и снизить шанс 429)
            if (i < idList.length - 1) {
                const jitter = Math.floor(Math.random() * 500); // 0-500 мс
                const waitMs = baseDelayMs + jitter;
                fetchButton.textContent = `Пауза ${i + 1}/${idList.length}…`;
                askProgressLog(`ID ${id}: пауза ${waitMs} мс`);
                // eslint-disable-next-line no-await-in-loop
                await askSleep(waitMs);
            }
            askProgressState.current = i + 1;
            askUpdateProgressHeader();
        }

        aggregated.content.nmStats = Object.values(nmStatsMap);
        aggregated.content.sideNmStats = Object.values(sideNmStatsMap);

        askDisplayRawData({ items: rawPerId });
        // Не показываем общий агрегат как "Результаты анализа" при множественном режиме,
        // вместо этого заполним пер-кампанийную таблицу и скорректируем заголовок/видимость
        const headerEl = document.getElementById('askResultsHeader');
        if (headerEl) headerEl.textContent = 'Результаты анализа (по ID кампаний)';
        const mainCard = document.getElementById('askMainSummaryCard');
        if (mainCard) mainCard.style.display = 'none';
        // В множественном режиме всё равно показываем нижнюю детализацию асс. конверсий (по сумме)
        // поэтому после отрисовки агрегата вручную включим блок и заполним его суммарными sideNmStats

        // Отобразим итоги по каждому ID
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
                        <td>${new Intl.NumberFormat('ru-RU').format(row.assocPrice)}</td>
                        <td>${row.assocAtbs}</td>
                        <td>${row.assocOrders}</td>
                    `;
                    tbody.appendChild(tr);
                });
                container.style.display = perCampaign.length > 0 ? 'block' : 'none';
            }
            // Отрисуем агрегированную детализацию снизу
            const detailsContainer = document.getElementById('askAssociatedDetails');
            if (detailsContainer) {
                detailsContainer.style.display = 'block';
            }
            // Сконструируем aggregated из карт для использования в askPopulateAssociatedDetailsTable
            const aggregatedForDetails = { content: { sideNmStats: Object.values(sideNmStatsMap) } };
            askPopulateAssociatedDetailsTable(aggregatedForDetails.content.sideNmStats);
        } catch (e) {
            console.warn('Не удалось отобразить итоги по ID кампаний:', e);
        }

        // Финальный итог
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
    
    // Ищем данные в API-ответе
    let campaignData = null;
    
    // Если структура полностью соответствует предыдущему формату
    if (data.content && data.content.nmStats) {
        campaignData = data;
    } 
    // Если это новый формат API v5/fullstat
    else if (data.stats) {
        campaignData = askConvertApiV5DataToOldFormat(data);
    }
    // Возможно, другой формат
    else {
        console.log('Неизвестная структура данных API:', data);
        askShowError('Неизвестный формат данных API');
        return;
    }
    
    // Теперь у нас есть данные в едином формате
    console.log('Нормализованные данные АСК:', campaignData);
    
    const content = campaignData.content;
    
    // Получение общей суммы заказов
    const totalSumPrice = content.sum_price || 0;
    
    // Подсчет суммы atbs ТОЛЬКО из элементов массива nmStats
    let totalAtbsNmStats = 0;
    let nmStatsSumPrice = 0;
    
    // Сумма atbs ТОЛЬКО из nmStats
    if (content.nmStats && content.nmStats.length > 0) {
        console.log('nmStats:', content.nmStats);
        content.nmStats.forEach(item => {
            totalAtbsNmStats += (item.atbs || 0);
            console.log('Артикул:', item.nm_id, 'atbs:', item.atbs);
        });
        
        // Для ассоциированных конверсий берем sum_price первого элемента nmStats
        nmStatsSumPrice = content.nmStats[0].sum_price || 0;
    } else {
        console.log('Массив nmStats пуст - нет данных по основным артикулам для данного периода');
    }
    
    // Подсчет ассоциированных корзин, заказов и суммы из sideNmStats
    let associatedAtbs = 0;
    let associatedOrders = 0;
    let associatedPrice = 0; // Теперь считаем из ассоциированных конверсий
    
    if (content.sideNmStats && content.sideNmStats.length > 0) {
        console.log('sideNmStats (ассоциированные конверсии):', content.sideNmStats);
        content.sideNmStats.forEach(item => {
            associatedAtbs += (item.atbs || 0);
            associatedOrders += (item.orders || 0);
            associatedPrice += (item.sum_price || 0); // Суммируем цены ассоциированных товаров
            console.log('Ассоциированный артикул:', item.nm_id, 'atbs:', item.atbs, 'orders:', item.orders, 'sum_price:', item.sum_price);
        });
    } else {
        console.log('Массив sideNmStats пуст - нет ассоциированных конверсий для данного периода');
    }
    
    console.log('Данные АСК для отображения:', {
        totalAtbsNmStats,
        totalSumPrice,
        nmStatsSumPrice,
        associatedPrice, // Теперь это сумма из sideNmStats
        associatedAtbs,
        associatedOrders,
        nmStatsLength: content.nmStats ? content.nmStats.length : 0,
        sideNmStatsLength: content.sideNmStats ? content.sideNmStats.length : 0
    });
    
    // Отображение результатов в таблице
    document.getElementById('askAtbs').textContent = totalAtbsNmStats;
    document.getElementById('askAssociatedPrice').textContent = 
        new Intl.NumberFormat('ru-RU').format(associatedPrice);
    document.getElementById('askAssociatedAtbs').textContent = associatedAtbs;
    document.getElementById('askAssociatedOrders').textContent = associatedOrders;
    
    // Заполнение детализированной таблицы ассоциированных конверсий
    askPopulateAssociatedDetailsTable(content.sideNmStats || []);
}

// Функция для преобразования данных из нового API v5/fullstat в старый формат для АСК
function askConvertApiV5DataToOldFormat(apiData) {
    console.log('Конвертируем данные из API v5 в старый формат для АСК');
    
    const result = {
        content: {
            nmStats: [],
            sideNmStats: [],
            sum_price: 0
        }
    };
    
    // Общая сумма заказов (суммируем из статистики)
    let totalSumPrice = 0;
    
    // Обрабатываем основную статистику
    if (apiData.stats && apiData.stats.length > 0) {
        // Собираем статистику по артикулам
        const nmStatsMap = {};
        
        apiData.stats.forEach(stat => {
            // Суммируем общую сумму заказов
            totalSumPrice += (stat.sum_price || 0);
            
            // Группируем по артикулам для nmStats
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
        
        // Преобразуем map в массив для nmStats
        result.content.nmStats = Object.values(nmStatsMap);
        
        // Общая сумма
        result.content.sum_price = totalSumPrice;
    }
    
    // Обрабатываем ассоциированные конверсии (sideStats)
    if (apiData.sideStats && apiData.sideStats.length > 0) {
        console.log('Обрабатываем ассоциированные конверсии (sideStats)');
        
        // Собираем статистику по ассоциированным артикулам
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
        
        // Преобразуем map в массив для sideNmStats
        result.content.sideNmStats = Object.values(sideNmStatsMap);
    }
    
    return result;
}

// Функция для заполнения таблицы с детализацией ассоциированных конверсий АСК
function askPopulateAssociatedDetailsTable(sideNmStats) {
    const tableBody = document.getElementById('askAssociatedDetailsBody');
    const detailsContainer = document.getElementById('askAssociatedDetails');
    
    // Очищаем таблицу
    tableBody.innerHTML = '';
    
    if (!sideNmStats || sideNmStats.length === 0) {
        // Если нет данных, скрываем таблицу
        detailsContainer.style.display = 'none';
        return;
    }
    
    // Показываем контейнер с таблицей
    detailsContainer.style.display = 'block';
    
    // Сортируем по убыванию суммы для наглядности
    const sortedStats = sideNmStats.sort((a, b) => (b.sum_price || 0) - (a.sum_price || 0));
    
    // Заполняем таблицу
    sortedStats.forEach(item => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${item.nm_id}</td>
            <td>${item.atbs || 0}</td>
            <td>${item.orders || 0}</td>
            <td>${new Intl.NumberFormat('ru-RU').format(item.sum_price || 0)}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
    console.log('Детализированная таблица АСК заполнена:', sortedStats.length, 'артикулов');
}

// Функция для копирования детализированной таблицы АСК в буфер обмена
function askCopyDetailsTableToClipboard() {
    const tableBody = document.getElementById('askAssociatedDetailsBody');
    
    if (!tableBody || tableBody.children.length === 0) {
        askShowError('Нет данных для копирования');
        return;
    }
    
    // Собираем данные из таблицы
    let tableData = [];
    
    // Добавляем заголовки
    tableData.push('Артикул\tКорзины\tЗаказы\tСумма, руб');
    
    // Проходим по всем строкам таблицы
    for (let row of tableBody.children) {
        const cells = row.children;
        if (cells.length >= 4) {
            // Извлекаем данные из ячеек
            const articul = cells[0].textContent.trim();
            const baskets = cells[1].textContent.trim();
            const orders = cells[2].textContent.trim();
            const sumRaw = cells[3].textContent.trim();
            
            // Убираем форматирование из суммы (пробелы, запятые оставляем только цифры и точки)
            const sumClean = sumRaw.replace(/\s/g, '').replace(/,/g, '.');
            
            // Добавляем строку данных (разделители - табуляция)
            tableData.push(`${articul}\t${baskets}\t${orders}\t${sumClean}`);
        }
    }
    
    // Объединяем все строки
    const dataToСopy = tableData.join('\n');
    
    // Копируем в буфер обмена
    navigator.clipboard.writeText(dataToСopy)
        .then(() => {
            console.log('Детализированная таблица АСК скопирована в буфер обмена:', tableData.length - 1, 'строк');
            askShowCopyDetailsSuccess();
        })
        .catch(err => {
            console.error('Не удалось скопировать таблицу АСК:', err);
            askShowError('Не удалось скопировать таблицу. Проверьте разрешения.');
        });
} 