// Хранилище для последнего найденного запроса и его заголовков
let lastRequest = null;
let statsRequest = null;
let requestResults = null;
let isStatsMode = false;
let lastMirroredUrl = null;
let lastMirrorAt = 0;
const ENABLE_AUTO_MIRROR = false; // во избежание 429 не зеркалим в фоне автоматически

// Функция для перехвата запросов API v6 (кампании)
chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    // Проверяем, соответствует ли URL искомому шаблону
    if (details.url.includes('https://cmp.wildberries.ru/api/v6/atrevds')) {
      // Сохраняем детали запроса
      lastRequest = {
        url: details.url,
        headers: details.requestHeaders
      };
      console.log('Найден и сохранен запрос v6:', details.url);
      
      if (ENABLE_AUTO_MIRROR) {
        // Попытка автоматически зеркалировать запрос на v5 с теми же заголовками
        try {
          const now = Date.now();
          if (lastMirroredUrl !== details.url || now - lastMirrorAt > 10000) { // не чаще 1 раз в 10с на тот же URL
            lastMirroredUrl = details.url;
            lastMirrorAt = now;
            const v5Url = buildV5UrlExact(details.url);
            // Запускаем в фоне с фолбэками, чтобы при клике уже были данные
            fetchWithFallbacks(details.url, details.requestHeaders, v5Url)
              .then(() => {
                console.log('Автозеркалирование v6->v5 завершено');
                if (requestResults && requestResults.success) {
                  requestResults.source = requestResults.source || 'mirrored_v5_auto';
                }
              })
              .catch((e) => console.warn('Ошибка автозеркалирования v6->v5:', e));
          }
        } catch (e) {
          console.warn('Не удалось инициировать автозеркалирование v6->v5:', e);
        }
      }
    }
  },
  { urls: ["https://cmp.wildberries.ru/api/v6/atrevds*"] },
  ["requestHeaders", "extraHeaders"]
);

// Функция для перехвата запросов API статистики
chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    // Сохраняем детали запроса статистики
    statsRequest = {
      url: details.url,
      headers: details.requestHeaders
    };
    console.log('Найден и сохранен запрос статистики:', details.url);
  },
  { urls: ["https://cmp.wildberries.ru/api/v5/stats/atrevds*"] },
  ["requestHeaders", "extraHeaders"]
);

// Функция генерации отчета для страницы списка кампаний
async function generateCampaignsReport(tab) {
  if (lastRequest) {
    // Создаем новый URL на базе v6 -> v5 и санитизируем query-параметры
    const newUrl = buildSanitizedV5Url(lastRequest.url);
    isStatsMode = false;
    
    try {
      // Сбрасываем предыдущие результаты
      // Если уже есть свежие перехваченные данные v5 — используем их, чтобы избежать 429
      const nowTs = Date.now();
      if (requestResults && requestResults.success && requestResults.source === 'injected_v5' && (nowTs - (requestResults.timestamp || 0) < 15000)) {
        chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
        return;
      }
      requestResults = null;
      
      // Пытаемся получить данные и, если пусто, пробуем альтернативы
      await fetchWithFallbacks(lastRequest.url, lastRequest.headers, newUrl);
      
      // Открываем вкладку с результатами
      chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
    } catch (error) {
      console.error('Ошибка при выполнении запроса:', error);
      // Сохраняем информацию об ошибке, чтобы показать на странице результатов
      requestResults = { 
        success: false, 
        error: error.message,
        errorDetails: error.toString()
      };
      chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
    }
  } else {
    // Если запрос не найден, показываем сообщение
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        alert('Запрос API v6 не найден. Пожалуйста, перезагрузите страницу и сделайте какое-либо действие, чтобы вызвать API-запрос.');
      }
    });
  }
}

// Функция генерации отчета для страницы статистики
async function generateStatisticsReport(tab) {
  if (statsRequest) {
    isStatsMode = true;
    
    try {
      // Сбрасываем предыдущие результаты
      requestResults = null;
      
      // Выполняем запрос к API статистики с сохраненными заголовками
      await makeRequest(statsRequest.url, statsRequest.headers);
      
      // Открываем вкладку с результатами
      chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
    } catch (error) {
      console.error('Ошибка при выполнении запроса статистики:', error);
      // Сохраняем информацию об ошибке, чтобы показать на странице результатов
      requestResults = { 
        success: false, 
        error: error.message,
        errorDetails: error.toString(),
        isStatsMode: true
      };
      chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
    }
  } else {
    // Если запрос статистики не найден, показываем сообщение
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        alert('Запрос API статистики не найден. Пожалуйста, перезагрузите страницу и сделайте какое-либо действие, чтобы вызвать API-запрос.');
      }
    });
  }
}

// Обработчик нажатия на иконку расширения
chrome.action.onClicked.addListener(async (tab) => {
  // Теперь иконка открывает popup, этот код не будет вызываться
  // Оставляем для совместимости со старыми версиями
});

// Функция для выполнения запроса
async function makeRequest(url, headers) {
  // Преобразуем заголовки из формата webRequest в формат fetch
  const fetchHeaders = {};
  let referrerHeaderValue = undefined;
  headers.forEach(header => {
    const nameLower = header.name.toLowerCase();
    // Список запрещённых к установке вручную заголовков
    const forbidden = ['content-length', 'host', 'cookie', 'user-agent', 'origin', 'referer', 'connection', 'keep-alive'];
    if (nameLower === 'referer') {
      referrerHeaderValue = header.value;
      return;
    }
    if (!forbidden.includes(nameLower)) {
      fetchHeaders[header.name] = header.value;
    }
  });

  try {
    // Выполняем запрос с сохраненными заголовками
    const response = await fetch(url, { 
      method: 'GET',
      headers: fetchHeaders,
      // Добавляем дополнительные параметры для борьбы с кэшированием
      cache: 'no-store',
      // Важно: чтобы отправлялись cookies домена WB при запросе из фона
      credentials: 'include',
      mode: 'cors',
      redirect: 'follow',
      referrer: referrerHeaderValue || 'https://cmp.wildberries.ru/campaigns/list',
      referrerPolicy: 'strict-origin-when-cross-origin'
    });
    
    if (!response.ok) {
      throw new Error(`Сервер вернул статус: ${response.status}`);
    }
    
    // Получаем текст ответа
    const responseText = await response.text();
    
    // Проверяем, что ответ не пустой
    if (!responseText || responseText.trim() === '') {
      // Если ответ пустой, создаем пустой объект с информацией
      requestResults = { 
        success: true,
        data: { 
          info: "Получен пустой ответ от сервера",
          content: []
        },
        isStatsMode: isStatsMode
      };
      return requestResults.data;
    }
    
    // Пытаемся распарсить JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('Ошибка при парсинге JSON:', jsonError, 'Ответ сервера:', responseText);
      throw new Error(`Ошибка при парсинге ответа: ${jsonError.message}`);
    }
    
    // Сохраняем результаты
    requestResults = { 
      success: true,
      data: data,
      isStatsMode: isStatsMode
    };
    
    return data;
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
    requestResults = { 
      success: false,
      error: error.message,
      errorDetails: error.toString(),
      isStatsMode: isStatsMode
    };
    throw error;
  }
}

// Строит URL для v5 и очищает некорректные query-параметры
function buildSanitizedV5Url(originalUrl) {
  try {
    const urlObj = new URL(originalUrl);
    // Переключаемся на v5 эндпоинт
    urlObj.pathname = urlObj.pathname.replace('/api/v6/', '/api/v5/');

    const params = urlObj.searchParams;
    // Удаляем параметры со значениями undefined/null/пусто
    Array.from(params.entries()).forEach(([key, value]) => {
      const normalized = (value || '').toString().trim().toLowerCase();
      if (normalized === '' || normalized === 'undefined' || normalized === 'null') {
        params.delete(key);
      }
    });

    // Конвертируем массивы вида [8,9] → 8,9 для лучшей совместимости с v5
    const convertArrayParam = (key) => {
      if (!params.has(key)) return;
      const raw = params.get(key) || '';
      const trimmed = raw.trim();
      // Если значение похоже на JSON-массив, пробуем распарсить
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) {
            params.set(key, arr.join(','));
          }
        } catch {
          // Если JSON.parse не удался, делаем мягкую конвертацию: удаляем скобки и пробелы
          params.set(key, trimmed.replace(/[\[\]\s]/g, ''));
        }
      }
    };
    convertArrayParam('type');
    convertArrayParam('status');

    // Подставляем безопасные дефолты для пагинации
    if (!params.has('page_number')) {
      params.set('page_number', '1');
    }
    if (!params.has('page_size')) {
      params.set('page_size', '90');
    }

    // Явно удаляем сортировки/фильтры, если остались пустыми (защита на будущее)
    ['search', 'type', 'status', 'order', 'direction'].forEach((k) => {
      if (params.has(k)) {
        const v = (params.get(k) || '').trim().toLowerCase();
        if (v === '' || v === 'undefined' || v === 'null') {
          params.delete(k);
        }
      }
    });

    const safeUrl = urlObj.toString();
    console.log('Санитизированный URL для v5:', safeUrl);
    return safeUrl;
  } catch (e) {
    console.warn('Не удалось санитизировать URL, используем простую замену v6->v5:', e);
    return originalUrl.replace('/api/v6/', '/api/v5/');
  }
}

// Строит v5 URL из v6 без модификации query (как есть), только меняем версию в пути
function buildV5UrlExact(originalUrl) {
  try {
    const urlObj = new URL(originalUrl);
    urlObj.pathname = urlObj.pathname.replace('/api/v6/', '/api/v5/');
    return urlObj.toString();
  } catch (e) {
    return originalUrl.replace('/api/v6/', '/api/v5/');
  }
}

// Строит упрощенный/расширенный v5 URL без фильтров для максимального охвата
function buildBroadenedV5Url(originalUrl) {
  const v5 = buildSanitizedV5Url(originalUrl);
  try {
    const urlObj = new URL(v5);
    const params = urlObj.searchParams;
    // Удаляем ограничивающие фильтры
    ['search', 'type', 'status', 'order', 'direction', 'autofill'].forEach((k) => params.delete(k));
    // Ставим максимально широкий page_size (90 уже задан, оставим)
    if (!params.has('page_size')) params.set('page_size', '90');
    if (!params.has('page_number')) params.set('page_number', '1');
    const safeUrl = urlObj.toString();
    console.log('Расширенный URL для v5 (без фильтров):', safeUrl);
    return safeUrl;
  } catch (e) {
    console.warn('Не удалось построить расширенный v5 URL:', e);
    return v5;
  }
}

// Санитизация v6 URL (оставляем v6), нормализуем массивы, добавляем разумные дефолты
function buildSanitizedV6Url(originalUrl) {
  try {
    const urlObj = new URL(originalUrl);
    // Оставляем v6, только чистим параметры
    const params = urlObj.searchParams;

    // Удаляем undefined/null/пусто
    Array.from(params.entries()).forEach(([key, value]) => {
      const normalized = (value || '').toString().trim().toLowerCase();
      if (normalized === '' || normalized === 'undefined' || normalized === 'null') {
        params.delete(key);
      }
    });

    // Нормализуем массивы [a,b] → a,b
    const convertArrayParam = (key) => {
      if (!params.has(key)) return;
      const raw = params.get(key) || '';
      const trimmed = raw.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) params.set(key, arr.join(','));
        } catch {
          params.set(key, trimmed.replace(/[\[\]\s]/g, ''));
        }
      }
    };
    convertArrayParam('type');
    convertArrayParam('status');

    // Дефолты пагинации
    if (!params.has('page_number')) params.set('page_number', '1');
    if (!params.has('page_size')) params.set('page_size', '90');

    // Помогающий флаг, если нет: autofill=all
    if (!params.has('autofill')) params.set('autofill', 'all');

    const safeUrl = urlObj.toString();
    console.log('Санитизированный URL для v6:', safeUrl);
    return safeUrl;
  } catch (e) {
    console.warn('Не удалось санитизировать v6 URL, используем исходный:', e);
    return originalUrl;
  }
}

// Проверка, что ответ содержит полезные данные (кампании/артикулы)
function hasUsefulCampaignData(data) {
  if (!data || !data.content || !Array.isArray(data.content)) return false;
  if (data.content.length === 0) return false;
  // Ищем артикулы внутри products
  for (const campaign of data.content) {
    const products = campaign && campaign.products;
    if (Array.isArray(products) && products.length > 0) {
      const hasNm = products.some((p) => p && (p.nm !== undefined && p.nm !== null));
      if (hasNm) return true;
    }
  }
  // Если артикулов нет, но контент непустой — тоже считаем полезным
  return true;
}

// Делает запрос к v5, а при пустом ответе пытается альтернативы (расширенный v5, затем v6)
async function fetchWithFallbacks(originalV6Url, headers, v5UrlFirst) {
  // 1) Базовый v5
  try {
    await makeRequest(v5UrlFirst, headers);
    if (requestResults && requestResults.success && hasUsefulCampaignData(requestResults.data)) {
      requestResults.fallback = 'none';
      return;
    }
  } catch (e) {
    // Продолжаем к фолбэкам
    console.warn('Базовый v5 не получен/ошибка, пробуем фолбэки:', e);
  }

  // 2) Расширенный v5 без фильтров
  try {
    const broadenedV5 = buildBroadenedV5Url(originalV6Url);
    await makeRequest(broadenedV5, headers);
    if (requestResults && requestResults.success && hasUsefulCampaignData(requestResults.data)) {
      requestResults.fallback = 'v5_broadened';
      return;
    }
  } catch (e) {
    console.warn('Расширенный v5 не дал результата/ошибка, пробуем v6:', e);
  }

  // 3) Больше не уходим на v6, чтобы не показывать не тот формат

  // Если ничего не помогло — оставляем последний requestResults как есть (в нём уже сообщение об ошибке/пустой контент)
}

// Обработчик сообщений от popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'generateReport') {
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const currentTab = tabs[0];
      
      if (message.type === 'campaigns') {
        // Генерация отчета по кампаниям
        await generateCampaignsReport(currentTab);
      } else if (message.type === 'statistics') {
        // Генерация отчета по статистике
        await generateStatisticsReport(currentTab);
      }
    });
    
    return true; // Указываем, что ответ может быть отправлен асинхронно
  }
});

// Обработчик сообщений от страницы results.html
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getResults') {
    // Проверяем, есть ли доступные результаты запроса
    setTimeout(() => {
      try {
        if (requestResults) {
          sendResponse(requestResults);
        } else {
          sendResponse({ 
            success: false, 
            error: 'Результаты запроса не найдены. Пожалуйста, запустите расширение снова.' 
          });
        }
      } catch (e) {
        console.error('Ошибка при отправке ответа:', e);
        sendResponse({ 
          success: false, 
          error: 'Внутренняя ошибка расширения: ' + e.message 
        });
      }
    }, 0);
    
    return true; // Возвращаем true, чтобы указать, что ответ будет отправлен асинхронно
  }
  
  // Обработка запросов АСК (ассоциированные конверсии)
  if (message.action === 'askFetchData') {
    const { advertId, dateFrom, dateTo } = message.params;
    
    console.log(`Запрашиваем данные АСК для ID=${advertId}, с ${dateFrom} по ${dateTo}`);
    
    // Сначала проверяем, есть ли уже сохраненные данные для этого advertId
    chrome.storage.local.get(['lastAskApiData', 'lastAskApiUrl', 'lastAskApiTimestamp'], function(result) {
      const now = Date.now();
      const isDataFresh = result.lastAskApiTimestamp && (now - result.lastAskApiTimestamp < 5 * 60 * 1000); // 5 минут
      const correctAdvertId = result.lastAskApiUrl && result.lastAskApiUrl.includes('advertID=' + advertId);
      
      console.log('Проверка кешированных данных АСК:', { 
        isDataFresh, 
        correctAdvertId,
        hasCachedData: !!result.lastAskApiData
      });
      
      if (isDataFresh && correctAdvertId && result.lastAskApiData) {
        console.log('Используем кешированные данные API АСК');
        sendResponse({ success: true, data: result.lastAskApiData });
        return;
      }
      
      // Форматируем даты для API
      const apiFromDate = formatDateForAskApi(dateFrom);
      const apiToDate = formatDateForAskApi(dateTo, true);
      
      console.log('Даты для API АСК:', { apiFromDate, apiToDate });
      
      // Открываем страницу Wildberries в фоновой вкладке для перехвата API-запроса
      const pageUrl = `https://cmp.wildberries.ru/campaigns/statistics/details/${advertId}?from=${dateFrom}&to=${dateTo}`;
      console.log('Открываем страницу АСК:', pageUrl);
      
      chrome.tabs.create({ 
        url: pageUrl,
        active: false 
      }, function(tab) {
        console.log('Создана вкладка АСК с ID:', tab.id);
        
        // Флаги для отслеживания состояния
        let responseWasSent = false;
        let apiDataReceived = false;
        
        // Таймаут на случай, если данные API не будут получены
        const timeoutId = setTimeout(() => {
          if (!responseWasSent && !apiDataReceived) {
            console.error('Таймаут получения данных API АСК');
            
            // Проверяем, может быть данные пришли с задержкой
            chrome.storage.local.get(['lastAskApiData', 'lastAskApiUrl'], function(result) {
              if (result.lastAskApiUrl && result.lastAskApiUrl.includes('advertID=' + advertId) && result.lastAskApiData) {
                console.log('Найдены данные АСК с задержкой');
                sendResponse({ success: true, data: result.lastAskApiData });
              } else {
                sendResponse({ 
                  success: false, 
                  error: 'Не удалось получить данные API АСК. Проверьте авторизацию.',
                  debug_info: { tab_id: tab.id, url: pageUrl }
                });
              }
              
              responseWasSent = true;
            });
            
            // Закрываем вкладку
            try {
              chrome.tabs.remove(tab.id);
              console.log('Вкладка АСК закрыта по таймауту');
            } catch(e) {
              console.error('Ошибка при закрытии вкладки АСК:', e);
            }
          }
        }, 20000); // 20 секунд на загрузку
        
        // Слушатель для получения данных API АСК
        function apiDataListener(message) {
          if (message.action === 'askApiDataIntercepted' && message.url && message.url.includes('advertID=' + advertId)) {
            console.log('Получены данные API АСК для запрошенного advertId:', advertId);
            console.log('URL API АСК:', message.url);
            
            clearTimeout(timeoutId);
            apiDataReceived = true;
            
            if (!responseWasSent) {
              console.log('Отправляем ответ с данными API АСК');
              sendResponse({ success: true, data: message.data });
              responseWasSent = true;
              
              // Закрываем вкладку
              setTimeout(() => {
                try {
                  chrome.tabs.remove(tab.id);
                  console.log('Вкладка АСК закрыта после получения данных API');
                } catch(e) {
                  console.error('Ошибка при закрытии вкладки АСК:', e);
                }
              }, 1000);
            }
          }
        }
        
        // Регистрируем слушателя для данных API АСК
        chrome.runtime.onMessage.addListener(apiDataListener);
        
        // Удаляем слушателя после таймаута
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(apiDataListener);
          console.log('Удален слушатель apiDataListener для АСК');
        }, 25000); // немного больше чем основной таймаут
      });
    });
    
    // Для асинхронного ответа
    return true;
  }
});

// Функция для форматирования даты в формат API АСК (с временем и часовым поясом)
function formatDateForAskApi(dateStr, isEndDate = false) {
  // Парсим дату
  const dateParts = dateStr.split('-');
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // месяцы в JS с 0
  const day = parseInt(dateParts[2], 10);
  
  // Создаем объект Date с нужными параметрами
  const date = new Date(year, month, day);
  
  // Для конечной даты устанавливаем время на конец дня
  if (isEndDate) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  
  // Форматируем в ISO строку и добавляем Z в конце (UTC)
  return date.toISOString().replace('.000Z', 'Z');
}

// Дополнительный обработчик для АСК API перехвата
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Получено сообщение в background.js (АСК):', request.action);
  
  // Перехваченные данные API для АСК
  if (request.action === 'askApiDataIntercepted') {
    console.log('Перехвачены данные API АСК:', request.url);
    
    // Сохраняем данные для использования
    chrome.storage.local.set({ 
      'lastAskApiData': request.data,
      'lastAskApiUrl': request.url,
      'lastAskApiTimestamp': Date.now()
    }, function() {
      console.log('Данные API АСК сохранены в хранилище');
    });
    
    return true;
  }
}); 

// Обработчик перехваченных данных для списка кампаний (v5 с фронта)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'campaignsApiDataIntercepted') {
    console.log('Перехвачены данные v5 для списка кампаний');
    // Сохраняем как успешный результат, если ещё нет результата
    if (!requestResults || !requestResults.success) {
      requestResults = {
        success: true,
        data: request.data,
        isStatsMode: false,
        source: 'injected_v5',
        timestamp: Date.now()
      };
    }
    return true;
  }
});