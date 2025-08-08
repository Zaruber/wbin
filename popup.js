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
    
    // Попытка восстановить последний ID рекламы
    chrome.storage.local.get(['askLastAdvertId'], function(result) {
        if (result.askLastAdvertId) {
            document.getElementById('askAdvertId').value = result.askLastAdvertId;
        }
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

// Функция для получения данных статистики АСК через background script
function askFetchStatsData() {
    const advertId = document.getElementById('askAdvertId').value.trim();
    if (!advertId) {
        askShowError('Пожалуйста, введите ID рекламы');
        return;
    }
    
    const dateFrom = document.getElementById('askDateFrom').value;
    const dateTo = document.getElementById('askDateTo').value;
    
    if (!dateFrom || !dateTo) {
        askShowError('Пожалуйста, выберите даты');
        return;
    }
    
    // Сохраняем ID рекламы и даты для будущего использования
    chrome.storage.local.set({ 
        'askLastAdvertId': advertId,
        'askLastDateFrom': dateFrom,
        'askLastDateTo': dateTo
    });
    
    // Индикатор загрузки
    const fetchButton = document.getElementById('askFetchData');
    const originalText = fetchButton.textContent;
    fetchButton.textContent = 'Загрузка...';
    fetchButton.disabled = true;
    
    // Отображаем пустой блок результатов
    document.getElementById('askResults').style.display = 'block';
    
    // Отправляем запрос через background.js для обхода CORS
    chrome.runtime.sendMessage({
        action: 'askFetchData',
        params: {
            advertId: advertId,
            dateFrom: dateFrom,
            dateTo: dateTo
        }
    }, function(response) {
        fetchButton.textContent = originalText;
        fetchButton.disabled = false;
        
        // Всегда показываем сырые данные, даже если есть ошибка
        askDisplayRawData(response || { error: 'Нет ответа от background скрипта' });
        
        if (response && response.success && response.data) {
            // Обрабатываем и показываем данные
            askProcessData(response.data);
        } else {
            console.error('Ошибка при получении данных АСК:', response ? response.error : 'Ответ не получен');
            askShowError('Ошибка при получении данных. Авторизуйтесь на сайте WB и попробуйте снова.');
        }
    });
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