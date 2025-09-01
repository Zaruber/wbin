// Получаем элементы DOM
const loadingElement = document.getElementById('loading');
const resultElement = document.getElementById('result');
const errorElement = document.getElementById('error');
const tableViewElement = document.getElementById('table-view');
const tableBodyElement = document.getElementById('table-body');
const statsTableBodyElement = document.getElementById('stats-table-body');
const copyButton = document.getElementById('copy-btn');
const excelButton = document.getElementById('excel-btn');
const columnsButton = document.getElementById('columns-btn');
const columnsPanel = document.getElementById('columns-panel');
const columnsList = document.getElementById('columns-list');
const successMessage = document.getElementById('success-message');
const jsonContainer = document.querySelector('.json-container');
const tableContainer = document.querySelector('.table-container');
const tableTitle = document.getElementById('table-title');
const campaignsTable = document.getElementById('campaigns-table');
const statsTable = document.getElementById('stats-table');

// Хранилище для обработанных данных таблицы
let tableData = [];
let statsData = [];
let isStatsMode = false;

// При загрузке страницы отправляем сообщение фоновому скрипту
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем обработчик для случая, если сообщение не будет получено
    const messageTimeout = setTimeout(() => {
        showError('Превышено время ожидания ответа от расширения. Пожалуйста, попробуйте снова.');
    }, 10000); // 10 секунд тайм-аут
    
    try {
        chrome.runtime.sendMessage({ action: 'getResults' }, (response) => {
            // Отменяем таймаут, так как получили ответ
            clearTimeout(messageTimeout);
            
            if (!response) {
                showError('Не получен ответ от расширения. Пожалуйста, попробуйте снова.');
                return;
            }
            
            // Проверяем, режим статистики или обычный
            isStatsMode = response.isStatsMode === true;
            
            // Настраиваем отображение в зависимости от режима
            setViewMode(isStatsMode);
            
            if (response && response.success) {
                // Показываем результаты, если они есть
                showResults(response.data);
                
                // В зависимости от режима, парсим и отображаем соответствующие данные
                if (isStatsMode) {
                    parseStatsDataForTable(response.data);
                } else {
                    parseDataForTable(response.data);
                }
            } else if (response && response.error) {
                // Показываем ошибку, если она есть
                let errorMsg = response.error;
                if (response.errorDetails) {
                    errorMsg += '<br><br>Подробности: ' + response.errorDetails;
                }
                showError(errorMsg);
            } else {
                // Если ответа нет, показываем общую ошибку
                showError('Не удалось получить данные от расширения.');
            }
        });
    } catch (error) {
        clearTimeout(messageTimeout);
        showError('Ошибка при запросе данных: ' + error.message);
    }

    // Добавляем обработчики событий для кнопок
    copyButton.addEventListener('click', copyToClipboard);
    excelButton.addEventListener('click', exportToExcel);
    if (columnsButton) {
        columnsButton.addEventListener('click', toggleColumnsPanel);
    }
});

// Функция для настройки режима отображения (статистика или обычный)
function setViewMode(statsMode) {
    if (statsMode) {
        // В режиме статистики - настраиваем макет для показа таблицы статистики
        jsonContainer.style.maxWidth = '50%';
        tableContainer.style.display = 'flex';
        tableTitle.textContent = 'Таблица статистики';
        
        // Показываем таблицу статистики, скрываем таблицу кампаний
        campaignsTable.style.display = 'none';
        statsTable.style.display = 'block';
        
        document.title = 'WBin - Статистика API';
    } else {
        // В обычном режиме - стандартное отображение с таблицей кампаний
        jsonContainer.style.maxWidth = '50%';
        tableContainer.style.display = 'flex';
        tableTitle.textContent = 'Таблица кампаний';
        
        // Показываем таблицу кампаний, скрываем таблицу статистики
        campaignsTable.style.display = 'block';
        statsTable.style.display = 'none';
        
        document.title = 'WBin - Результаты';
    }
}

// Функция для отображения результатов
function showResults(data) {
    // Скрываем индикатор загрузки
    loadingElement.style.display = 'none';
    
    // Проверяем, что data не null или undefined
    if (!data) {
        data = { info: "Нет данных для отображения", content: [] };
    }
    
    // Отображаем результаты
    try {
        resultElement.textContent = JSON.stringify(data, null, 2);
        resultElement.style.display = 'block';
    } catch (error) {
        console.error('Ошибка при отображении JSON:', error);
        resultElement.textContent = 'Ошибка при отображении JSON: ' + error.message;
        resultElement.style.display = 'block';
    }
}

// Функция для отображения ошибки
function showError(message) {
    // Скрываем индикатор загрузки
    loadingElement.style.display = 'none';
    
    // Отображаем сообщение об ошибке
    errorElement.innerHTML = 'Ошибка: ' + message;
    errorElement.style.display = 'block';
}

// Функция для парсинга данных JSON и создания таблицы
function parseDataForTable(data) {
    // Очищаем содержимое таблицы и массив данных
    tableBodyElement.innerHTML = '';
    tableData = [];
    
    try {
        // Проверяем наличие нужных данных в ответе
        if (data && data.content && Array.isArray(data.content)) {
            if (data.content.length === 0) {
                // Если контент пустой, показываем сообщение в таблице
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="3" style="text-align: center; padding: 20px;">Нет данных для отображения</td>
                `;
                tableBodyElement.appendChild(row);
                tableViewElement.style.display = 'block';
                return;
            }
            
            // Обрабатываем каждую кампанию
            data.content.forEach(campaign => {
                // Получаем id и campaignName
                const id = campaign.id || 'Н/Д';
                const campaignName = campaign.campaignName || 'Н/Д';
                
                // Если есть товары, добавляем строку для каждого товара
                if (campaign.products && Array.isArray(campaign.products) && campaign.products.length > 0) {
                    campaign.products.forEach(product => {
                        // Создаем новую строку таблицы
                        const row = document.createElement('tr');
                        const nm = product.nm || 'Н/Д';
                        
                        // Добавляем ячейки с данными
                        row.innerHTML = `
                            <td>${id}</td>
                            <td>${campaignName}</td>
                            <td>${nm}</td>
                        `;
                        
                        // Добавляем строку в таблицу
                        tableBodyElement.appendChild(row);
                        
                        // Добавляем данные в массив для экспорта
                        tableData.push({
                            id: id,
                            campaignName: campaignName,
                            nm: nm
                        });
                    });
                } else {
                    // Если товаров нет, добавляем строку с пустым артикулом
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${id}</td>
                        <td>${campaignName}</td>
                        <td>Н/Д</td>
                    `;
                    tableBodyElement.appendChild(row);
                    
                    // Добавляем данные в массив для экспорта
                    tableData.push({
                        id: id,
                        campaignName: campaignName,
                        nm: 'Н/Д'
                    });
                }
            });
            
            // Показываем таблицу
            tableViewElement.style.display = 'block';
        } else {
            // Если нет данных контента, показываем сообщение в таблице
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="3" style="text-align: center; padding: 20px;">Структура данных не содержит нужной информации</td>
            `;
            tableBodyElement.appendChild(row);
            tableViewElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка при парсинге данных:', error);
        errorElement.innerHTML = 'Ошибка при парсинге данных: ' + error.message;
        errorElement.style.display = 'block';
        
        // Показываем пустую таблицу
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="3" style="text-align: center; padding: 20px;">Ошибка при обработке данных</td>
        `;
        tableBodyElement.appendChild(row);
        tableViewElement.style.display = 'block';
    }
}

// Функция для парсинга данных статистики и создания таблицы
function parseStatsDataForTable(data) {
    // Очищаем содержимое таблицы статистики и массив данных
    statsTableBodyElement.innerHTML = '';
    statsData = [];
    
    try {
        // Проверяем наличие нужных данных в ответе
        if (data && data.content && Array.isArray(data.content)) {
            if (data.content.length === 0) {
                // Если контент пустой, показываем сообщение в таблице
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="10" style="text-align: center; padding: 20px;">Нет данных для отображения</td>
                `;
                statsTableBodyElement.appendChild(row);
                tableViewElement.style.display = 'block';
                return;
            }
            
            // Обрабатываем каждую запись статистики
            data.content.forEach(stat => {
                // Создаем новую строку таблицы
                const row = document.createElement('tr');
                
                // Получаем данные из записи
                const id = stat.id || 'Н/Д';
                const campaignName = stat.campaign_name || stat.campaignName || 'Н/Д';
                
                // Получаем артикулы
                let nms = 'Н/Д';
                if (stat.nms && Array.isArray(stat.nms) && stat.nms.length > 0) {
                    nms = stat.nms.join(', ');
                }
                
                const views = stat.views || 0;
                const clicks = stat.clicks || 0;
                const ctr = stat.ctr || 0;
                const cpc = stat.cpc || 0;
                const cr = stat.cr || 0;
                const atbs = stat.atbs || 0; // Корзины
                const orders = stat.shks || 0;
                const sum = stat.sum || 0;
                
                // Добавляем ячейки с данными
                row.innerHTML = `
                    <td>${campaignName}</td>
                    <td>${id}</td>
                    <td>${nms}</td>
                    <td>${views}</td>
                    <td>${clicks}</td>
                    <td>${ctr}</td>
                    <td>${cpc}</td>
                    <td>${cr}</td>
                    <td>${atbs}</td>
                    <td>${orders}</td>
                    <td>${sum}</td>
                `;
                
                // Добавляем строку в таблицу
                statsTableBodyElement.appendChild(row);
                
                // Добавляем данные в массив для экспорта
                statsData.push({
                    campaignName,
                    id,
                    nms,
                    views,
                    clicks,
                    ctr,
                    cpc,
                    cr,
                    atbs,
                    orders,
                    sum
                });
            });
            
            // Показываем таблицу
            tableViewElement.style.display = 'block';
        } else {
            // Если нет данных контента, показываем сообщение в таблице
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="10" style="text-align: center; padding: 20px;">Структура данных не содержит нужной информации</td>
            `;
            statsTableBodyElement.appendChild(row);
            tableViewElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка при парсинге данных статистики:', error);
        errorElement.innerHTML = 'Ошибка при парсинге данных статистики: ' + error.message;
        errorElement.style.display = 'block';
        
        // Показываем пустую таблицу
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="10" style="text-align: center; padding: 20px;">Ошибка при обработке данных</td>
        `;
        statsTableBodyElement.appendChild(row);
        tableViewElement.style.display = 'block';
    }
}

// ======== Настройка столбцов ========
function toggleColumnsPanel() {
    if (!columnsPanel) return;
    const willShow = !columnsPanel.classList.contains('show');
    if (willShow) buildColumnsList();
    columnsPanel.classList.toggle('show', willShow);
}

function buildColumnsList() {
    if (!columnsList) return;
    columnsList.innerHTML = '';
    const currentTable = isStatsMode ? document.getElementById('stats-data-table') : document.getElementById('data-table');
    if (!currentTable) return;
    const headers = Array.from(currentTable.querySelectorAll('thead th'));
    const storageKey = isStatsMode ? 'wbin_stats_columns' : 'wbin_campaigns_columns';
    chrome.storage.local.get([storageKey], (res) => {
        const saved = res[storageKey];
        const visibleMap = Array.isArray(saved) ? saved.reduce((m, c) => (m[c] = true, m), {}) : null;
        headers.forEach((th, idx) => {
            const label = th.textContent.trim() || `Колонка ${idx+1}`;
            const id = `col-${idx}`;
            const wrapper = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = visibleMap ? !!visibleMap[idx] : true;
            cb.addEventListener('change', () => applyColumnsVisibility());
            wrapper.appendChild(cb);
            const span = document.createElement('span');
            span.textContent = label;
            wrapper.appendChild(span);
            wrapper.dataset.colIndex = String(idx);
            columnsList.appendChild(wrapper);
        });
        applyColumnsVisibility();
    });
}

function applyColumnsVisibility() {
    const currentTable = isStatsMode ? document.getElementById('stats-data-table') : document.getElementById('data-table');
    if (!currentTable || !columnsList) return;
    const rows = Array.from(currentTable.querySelectorAll('tr'));
    const states = [];
    const checkboxes = Array.from(columnsList.querySelectorAll('label'));
    checkboxes.forEach((label, i) => {
        const cb = label.querySelector('input[type="checkbox"]');
        const visible = !!(cb && cb.checked);
        states[i] = visible;
        rows.forEach((tr) => {
            const cell = tr.children[i];
            if (cell) cell.style.display = visible ? '' : 'none';
        });
    });
    const storageKey = isStatsMode ? 'wbin_stats_columns' : 'wbin_campaigns_columns';
    // Сохраняем индексы видимых колонок
    const visibleIdx = states.map((v, i) => v ? i : null).filter((x) => x !== null);
    chrome.storage.local.set({ [storageKey]: visibleIdx });
}

// Получение индексов видимых столбцов
function getVisibleColumns() {
    if (!columnsList) return null;
    const checkboxes = Array.from(columnsList.querySelectorAll('label'));
    return checkboxes.map((label, i) => {
        const cb = label.querySelector('input[type="checkbox"]');
        return cb && cb.checked ? i : null;
    }).filter((x) => x !== null);
}

// Фильтрация данных по видимым столбцам
function filterDataByVisibleColumns(data, visibleColumns) {
    if (!visibleColumns || visibleColumns.length === 0) return data;
    return data.map(row => {
        const filtered = {};
        Object.keys(row).forEach((key, index) => {
            if (visibleColumns.includes(index)) {
                filtered[key] = row[key];
            }
        });
        return filtered;
    });
}

// Функция для копирования данных в буфер обмена в формате для вставки в Google Sheets
function copyToClipboard() {
    try {
        const visibleColumns = getVisibleColumns();
        if (!visibleColumns || visibleColumns.length === 0) {
            throw new Error('Нет видимых столбцов для копирования');
        }

        // В режиме статистики копируем данные статистики
        if (isStatsMode) {
            if (statsData.length === 0) {
                throw new Error('Нет данных для копирования');
            }
            
            // Фильтруем данные по видимым столбцам
            const filteredData = filterDataByVisibleColumns(statsData, visibleColumns);
            
            // Формируем строку заголовков для статистики (только видимые)
            const allHeaders = ['Название', 'ID Кампании', 'Артикулы', 'Показы', 'Клики', 'CTR (%)', 'CPC', 'CR (%)', 'Корзины', 'Заказы', 'Затраты'];
            const headers = visibleColumns.map(i => allHeaders[i]).join('\t');
            
            // Формируем строки данных с заменой точек на запятые в числовых значениях
            const rows = filteredData.map(item => {
                const values = [item.campaignName, item.id, item.nms, item.views, item.clicks, 
                               String(item.ctr).replace('.', ','), String(item.cpc).replace('.', ','), 
                               String(item.cr).replace('.', ','), item.atbs, item.orders, String(item.sum).replace('.', ',')];
                return visibleColumns.map(i => values[i]).join('\t');
            });
            
            // Объединяем всё в одну строку с разделителями строк
            const clipboardText = headers + '\n' + rows.join('\n');
            
            // Копируем в буфер обмена
            navigator.clipboard.writeText(clipboardText)
                .then(() => {
                    showSuccessMessage('Данные статистики скопированы в буфер обмена');
                })
                .catch(err => {
                    console.error('Ошибка копирования: ', err);
                    throw new Error('Не удалось скопировать данные: ' + err.message);
                });
            
            return;
        }
        
        // В обычном режиме копируем данные таблицы кампаний
        if (tableData.length === 0) {
            throw new Error('Нет данных для копирования');
        }
        
        // Фильтруем данные по видимым столбцам
        const filteredData = filterDataByVisibleColumns(tableData, visibleColumns);
        
        // Формируем строку заголовков (только видимые)
        const allHeaders = ['ID', 'Название кампании', 'Артикул'];
        const headers = visibleColumns.map(i => allHeaders[i]).join('\t');
        
        // Формируем строки данных
        const rows = filteredData.map(item => {
            const values = [item.id, item.campaignName, item.nm];
            return visibleColumns.map(i => values[i]).join('\t');
        });
        
        // Объединяем всё в одну строку с разделителями строк
        const clipboardText = headers + '\n' + rows.join('\n');
        
        // Копируем в буфер обмена
        navigator.clipboard.writeText(clipboardText)
            .then(() => {
                showSuccessMessage('Данные кампаний скопированы в буфер обмена');
            })
            .catch(err => {
                console.error('Ошибка копирования: ', err);
                throw new Error('Не удалось скопировать данные: ' + err.message);
            });
    } catch (error) {
        showErrorMessage(error.message);
    }
}

// Функция для экспорта данных в Excel
function exportToExcel() {
    try {
        const visibleColumns = getVisibleColumns();
        if (!visibleColumns || visibleColumns.length === 0) {
            throw new Error('Нет видимых столбцов для экспорта');
        }

        // В режиме статистики экспортируем данные статистики
        if (isStatsMode) {
            if (statsData.length === 0) {
                throw new Error('Нет данных для экспорта');
            }
            
            // Фильтруем данные по видимым столбцам
            const filteredData = filterDataByVisibleColumns(statsData, visibleColumns);
            
            // Используем точку с запятой в качестве разделителя для лучшей совместимости с Excel
            // Создаем заголовки
            const allHeaders = ['Название', 'ID Кампании', 'Артикулы', 'Показы', 'Клики', 'CTR (%)', 'CPC', 'CR (%)', 'Корзины', 'Заказы', 'Затраты'];
            const headers = visibleColumns.map(i => allHeaders[i]);
            
            // Подготавливаем BOM (Byte Order Mark) для корректного отображения кириллицы в Excel
            const BOM = '\uFEFF';
            
            // Создаем содержимое с разделителями точкой с запятой
            let csvContent = BOM + headers.join(';') + '\r\n';
            
            // Добавляем строки данных
            filteredData.forEach(item => {
                // Заменяем точки на запятые в числовых значениях для правильного отображения в русской локализации Excel
                // И добавляем префикс к значениям CTR, CPC и CR, чтобы предотвратить их интерпретацию как даты
                const allValues = [
                    item.campaignName, item.id, item.nms, item.views, item.clicks,
                    String(item.ctr).replace('.', ',') + '%', String(item.cpc).replace('.', ','),
                    String(item.cr).replace('.', ',') + '%', item.atbs, item.orders, String(item.sum).replace('.', ',')
                ];
                const values = visibleColumns.map(i => allValues[i]);
                
                // Экранируем кавычками поля, содержащие точку с запятой и заменяем возможные кавычки
                const safeValues = values.map(value => {
                    const strValue = String(value);
                    if (strValue.includes(';')) {
                        return `"${strValue.replace(/"/g, '""')}"`;
                    }
                    return strValue;
                });
                
                // Формируем строку CSV
                csvContent += safeValues.join(';') + '\r\n';
            });
            
            // Создаем Blob с данными, указывая кодировку UTF-8
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
            
            // Создаем URL для Blob
            const url = URL.createObjectURL(blob);
            
            // Создаем временную ссылку для скачивания
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', 'wbads_stats_export.csv');
            link.style.display = 'none';
            
            // Добавляем ссылку в DOM, кликаем и удаляем
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Освобождаем URL
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
            
            showSuccessMessage('Файл Excel со статистикой успешно загружен');
            return;
        }
        
        // В обычном режиме экспортируем данные таблицы кампаний
        if (tableData.length === 0) {
            throw new Error('Нет данных для экспорта');
        }
        
        // Фильтруем данные по видимым столбцам
        const filteredData = filterDataByVisibleColumns(tableData, visibleColumns);
        
        // Используем точку с запятой в качестве разделителя для лучшей совместимости с Excel
        // Создаем заголовки
        const allHeaders = ['ID', 'Название кампании', 'Артикул'];
        const headers = visibleColumns.map(i => allHeaders[i]);
        
        // Подготавливаем BOM (Byte Order Mark) для корректного отображения кириллицы в Excel
        const BOM = '\uFEFF';
        
        // Создаем содержимое с разделителями точкой с запятой
        let csvContent = BOM + headers.join(';') + '\r\n';
        
        // Добавляем строки данных
        filteredData.forEach(item => {
            // Экранируем кавычками все поля, содержащие точку с запятой
            const allValues = [item.id, item.campaignName, item.nm];
            const values = visibleColumns.map(i => allValues[i]);
            
            // Экранируем кавычками поля, содержащие точку с запятой и заменяем возможные кавычки
            const safeValues = values.map(value => {
                const strValue = String(value);
                if (strValue.includes(';')) {
                    return `"${strValue.replace(/"/g, '""')}"`;
                }
                return strValue;
            });
            
            // Формируем строку CSV
            csvContent += safeValues.join(';') + '\r\n';
        });
        
        // Создаем Blob с данными, указывая кодировку UTF-8
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        
        // Создаем URL для Blob
        const url = URL.createObjectURL(blob);
        
        // Создаем временную ссылку для скачивания
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'wbads_export.csv');
        link.style.display = 'none';
        
        // Добавляем ссылку в DOM, кликаем и удаляем
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Освобождаем URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
        
        showSuccessMessage('Файл Excel с кампаниями успешно загружен');
    } catch (error) {
        showErrorMessage(error.message);
    }
}

// Функция для отображения сообщения об успехе
function showSuccessMessage(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    
    // Скрываем сообщение через 3 секунды
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 3000);
}

// Функция для отображения сообщения об ошибке
function showErrorMessage(message) {
    errorElement.innerHTML = 'Ошибка: ' + message;
    errorElement.style.display = 'block';
    
    // Скрываем сообщение через 5 секунд
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
} 