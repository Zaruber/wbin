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
    script.onload = function () {
      console.log('WBin АСК: inject.js загружен');
      this.remove(); // После загрузки удаляем тег script
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('WBin АСК: inject.js добавлен в DOM');
  }

  // Запускаем инжект скрипта немедленно
  injectAskScript();

  // Слушаем сообщения от инжектированного скрипта
  window.addEventListener('message', function (event) {
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
    script.onload = function () {
      console.log('WBin CAMP: inject.js загружен');
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('WBin CAMP: inject.js добавлен в DOM');
  }

  // Запускаем инжект скрипта немедленно
  injectCampaignsScript();

  // Слушаем сообщения от инжектированного скрипта (ответы v5 для кампаний)
  window.addEventListener('message', function (event) {
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

// Управление плавающими кнопками WBin в зависимости от маршрута
(function manageWbinFabs() {
  try {
    const ensureContainer = () => {
      let c = document.getElementById('__wbin_fab_container');
      if (!c) {
        c = document.createElement('div');
        c.id = '__wbin_fab_container';
        c.style.position = 'fixed';
        c.style.right = '24px';
        c.style.bottom = '24px';
        c.style.zIndex = '999999';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '10px';
        (document.body || document.documentElement).appendChild(c);
      }
      return c;
    };

    const clearButtons = () => {
      const c = document.getElementById('__wbin_fab_container');
      if (c) c.innerHTML = '';
    };

    const makeBtn = (label, title, onClick, variant = 'primary') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title || '';
      b.style.background = variant === 'primary' ? '#0a84ff' : '#f5f5f7';
      b.style.color = variant === 'primary' ? '#fff' : '#111827';
      b.style.border = variant === 'primary' ? 'none' : '1px solid rgba(60,60,67,0.12)';
      b.style.borderRadius = '10px';
      b.style.padding = '10px 14px';
      b.style.fontFamily = 'inherit';
      b.style.fontSize = '14px';
      b.style.fontWeight = '600';
      b.style.boxShadow = variant === 'primary' ? '0 6px 12px rgba(10,132,255,0.18)' : 'none';
      b.style.cursor = 'pointer';
      b.addEventListener('click', async () => {
        try {
          b.disabled = true;
          const old = b.textContent;
          b.textContent = 'Загрузка…';
          await onClick();
          b.textContent = old;
        } catch (e) {
          b.textContent = label;
        } finally {
          b.disabled = false;
        }
      });
      return b;
    };

    const render = () => {
      const path = location.pathname || '';
      const container = ensureContainer();
      clearButtons();

      // Только список статистики (не детали)
      if (path.startsWith('/campaigns/statistics') && !path.includes('/campaigns/statistics/details/')) {
        const btnAsk = makeBtn(
          'WBin: АСК из списка',
          'Открыть Анализ АСК с ID и датами из списка статистики',
          () => new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'askFromStats' }, () => resolve());
          }),
          'primary'
        );
        const btnStats = makeBtn(
          'WBin: Получить стату',
          'Получить таблицу статистики',
          () => new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'generateReport', type: 'statistics' }, () => resolve());
          }),
          'secondary'
        );
        container.appendChild(btnAsk);
        container.appendChild(btnStats);
        return;
      }

      // Список кампаний
      if (path.startsWith('/campaigns/list')) {
        const btnList = makeBtn(
          'WBin: Список РК',
          'Получить таблицу кампаний',
          () => new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'generateReport', type: 'campaigns' }, () => resolve());
          }),
          'primary'
        );
        container.appendChild(btnList);
        return;
      }

      // На других страницах — без кнопок
      clearButtons();
    };

    // Первичная отрисовка
    render();

    // Отслеживание смены маршрута в SPA
    let lastHref = location.href;
    setInterval(() => {
      if (lastHref !== location.href) {
        lastHref = location.href;
        render();
      }
    }, 500);

    // Также на случай динамических замен DOM
    const mo = new MutationObserver(() => {
      // поддерживаем контейнер, если был удалён
      if (!document.getElementById('__wbin_fab_container')) {
        render();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) { }
})();