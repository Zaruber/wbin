// Хранилище для последнего найденного запроса и его заголовков
let lastRequest = null;
let statsRequest = null;
let requestResults = null;
let isStatsMode = false;

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
    // Создаем новый URL, меняя v6 на v5
    const newUrl = lastRequest.url.replace('/api/v6/', '/api/v5/');
    isStatsMode = false;
    
    try {
      // Сбрасываем предыдущие результаты
      requestResults = null;
      
      // Выполняем запрос с новым URL и сохраненными заголовками
      await makeRequest(newUrl, lastRequest.headers);
      
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
  headers.forEach(header => {
    // Пропускаем некоторые заголовки, которые могут вызвать ошибки
    if (!['content-length', 'host'].includes(header.name.toLowerCase())) {
      fetchHeaders[header.name] = header.value;
    }
  });

  try {
    // Выполняем запрос с сохраненными заголовками
    const response = await fetch(url, { 
      method: 'GET',
      headers: fetchHeaders,
      // Добавляем дополнительные параметры для борьбы с кэшированием
      cache: 'no-cache',
      credentials: 'same-origin'
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
}); 