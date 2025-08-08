// Прослушиваем сообщения от фонового скрипта
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureRequest') {
    // Проверяем, находимся ли мы на нужных страницах
    if (window.location.href.includes('https://cmp.wildberries.ru/campaigns/list/all') || 
        window.location.href.includes('https://cmp.wildberries.ru/campaigns/statistics/all')) {
      sendResponse({ status: 'ready' });
    }
  }
});

// Инициализация АСК перехвата API, если мы на странице детальной статистики
if (window.location.href.includes('https://cmp.wildberries.ru/campaigns/statistics/details/')) {
  console.log('WBin АСК: контент-скрипт загружен на ' + location.href);

  // Инжектируем скрипт для раннего перехвата запросов АСК
  function injectAskScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      console.log('WBin АСК: inject.js загружен');
      this.remove(); // После загрузки удаляем тег script
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('WBin АСК: inject.js добавлен в DOM');
  }

  // Запускаем инжект скрипта немедленно
  injectAskScript();

  // Слушаем сообщения от инжектированного скрипта
  window.addEventListener('message', function(event) {
    // Проверяем источник сообщения
    if (event.source === window && 
        event.data && 
        event.data.source === 'wbin-ask-inject' && 
        event.data.action === 'askApiDataCaptured') {
      
      console.log('WBin АСК: получены данные API от инжектированного скрипта');
      
      // Передаем данные в фоновый скрипт
      chrome.runtime.sendMessage({
        action: 'askApiDataIntercepted',
        data: event.data.data,
        url: event.data.url,
        timestamp: Date.now()
      });
    }
  });

  // Уведомляем background script о загрузке страницы АСК
  chrome.runtime.sendMessage({ 
    action: 'askPageLoaded',
    url: window.location.href
  });
} 

// Инициализация перехвата для страницы списка кампаний
if (window.location.href.includes('https://cmp.wildberries.ru/campaigns/list')) {
  console.log('WBin CAMP: контент-скрипт загружен на ' + location.href);

  // Инжектируем общий скрипт перехвата
  function injectCampaignsScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      console.log('WBin CAMP: inject.js загружен');
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('WBin CAMP: inject.js добавлен в DOM');
  }

  // Запускаем инжект скрипта немедленно
  injectCampaignsScript();

  // Слушаем сообщения от инжектированного скрипта (ответы v5 для кампаний)
  window.addEventListener('message', function(event) {
    if (
      event.source === window &&
      event.data &&
      event.data.source === 'wbin-cmp-inject' &&
      event.data.action === 'campaignsV5DataCaptured'
    ) {
      console.log('WBin CAMP: получены данные v5 для списка кампаний от инжектированного скрипта');
      chrome.runtime.sendMessage({
        action: 'campaignsApiDataIntercepted',
        data: event.data.data,
        url: event.data.url,
        timestamp: Date.now()
      });
    }
  });
}