// Этот код будет выполняться в контексте целевой страницы до загрузки скриптов сайта
console.log('WBin inject.js загружен на ' + location.href);
// Флаг: получили ли уже данные fullstat
window.__wbin_ask_received = false;

// Перехват XMLHttpRequest до загрузки страницы (АСК и Кампании)
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function(method, url) {
  try {
    // Инициализируем контейнер для заголовков текущего XHR
    this.__wbin = { method, url, headers: {} };
  } catch(_) {}
  if (url && url.includes('/api/v5/fullstat')) {
    console.log('Перехвачен XHR запрос к API v5 (АСК):', url);
    
    this.addEventListener('load', function() {
      try {
        const responseData = JSON.parse(this.responseText);
        console.log('Получены данные API v5 через XHR (АСК)');
        
        // Передаем данные в window для доступа из content script
        window.postMessage({
          source: 'wbin-ask-inject',
          action: 'askApiDataCaptured',
          data: responseData,
          url: url
        }, '*');
      } catch (e) {
        console.error('Ошибка при обработке ответа API (АСК):', e);
      }
    });
  }
  // v6 зеркалим в v5 на этапе send, когда заголовки уже добавлены
  
  return originalXHROpen.apply(this, arguments);
};

XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  try {
    if (this.__wbin && name) {
      this.__wbin.headers[name] = value;
    }
  } catch(_) {}
  return originalXHRSetRequestHeader.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function() {
  try {
    const ctx = this.__wbin;
    if (
      ctx && ctx.url &&
      typeof ctx.url === 'string' &&
      ctx.url.includes('/api/v6/atrevds') &&
      location.pathname.startsWith('/campaigns/list')
    ) {
      const v5Url = buildV5UrlFromV6Exact(ctx.url);
      // Отправляем зеркальный запрос через XHR в контексте страницы с теми же заголовками
      try {
        const mirror = new XMLHttpRequest();
        mirror.open(ctx.method || 'GET', v5Url, true);
        mirror.withCredentials = true;
        // Устанавливаем те же заголовки, что были установлены на оригинальном XHR (то, что JS смог записать)
        const hdrs = ctx.headers || {};
        Object.keys(hdrs).forEach((name) => {
          try { mirror.setRequestHeader(name, hdrs[name]); } catch(_) {}
        });
        mirror.onreadystatechange = function() {
          if (mirror.readyState === 4) {
            try {
              const data = JSON.parse(mirror.responseText);
              window.postMessage({
                source: 'wbin-cmp-inject',
                action: 'campaignsV5DataCaptured',
                data,
                url: v5Url
              }, '*');
            } catch(_) {}
          }
        };
        // Тело запроса, если было (для GET обычно null)
        let body = undefined;
        try { body = arguments && arguments[0]; } catch(_) {}
        mirror.send(body);
      } catch(_) {}
    }
  } catch(_) {}
  return originalXHRSend.apply(this, arguments);
};

// Перехват fetch до загрузки страницы (АСК и Кампании)
const originalFetch = window.fetch;
window.fetch = function(resource, init) {
  const url = (typeof resource === 'string') ? resource : resource.url;
  
  if (url && url.includes('/api/v5/fullstat')) {
    console.log('Перехвачен fetch запрос к API v5 (АСК):', url);
    
    return originalFetch.apply(this, arguments)
      .then(response => {
        const responseClone = response.clone();
        
        responseClone.json()
          .then(data => {
            console.log('Получены данные API v5 через fetch (АСК)');
            try { window.__wbin_ask_received = true; } catch(_) {}
            
            // Передаем данные в window для доступа из content script
            window.postMessage({
              source: 'wbin-ask-inject',
              action: 'askApiDataCaptured',
              data: data,
              url: url
            }, '*');
          })
          .catch(err => console.error('Ошибка при клонировании ответа fetch (АСК):', err));
        
        return response;
      });
  }
  // Если это список кампаний и идёт v6-запрос, пробуем параллельно запросить v5 с теми же заголовками
  if (url && url.includes('/api/v6/atrevds') && location.pathname.startsWith('/campaigns/list')) {
    try {
      const v5Url = buildV5UrlFromV6Exact(url);
      const mainPromise = originalFetch.apply(this, arguments);

      // Строим Request с максимально полным переносом init из оригинального вызова
      let origRequest;
      try {
        origRequest = (resource instanceof Request)
          ? resource
          : new Request(resource, init);
      } catch(_) {
        origRequest = undefined;
      }

      let v5Promise;
      if (origRequest) {
        try {
          const v5Request = new Request(v5Url, origRequest);
          v5Promise = originalFetch.call(this, v5Request);
        } catch(_) {
          // Фолбэк: соберём минимальный init вручную
          const method = (init && init.method) || (resource && resource.method) || 'GET';
          const headersFromInit = (init && init.headers) ? normalizeHeaders(init.headers) : {};
          const headersFromRequest = (resource && resource.headers) ? normalizeHeaders(resource.headers) : {};
          const mergedHeaders = { ...headersFromRequest, ...headersFromInit };
          const safeHeaders = filterSettableHeaders(mergedHeaders);
          v5Promise = originalFetch.call(this, v5Url, { method, headers: safeHeaders, credentials: 'same-origin' });
        }
      } else {
        // Если не удалось сконструировать Request
        const method = (init && init.method) || (resource && resource.method) || 'GET';
        const headersFromInit = (init && init.headers) ? normalizeHeaders(init.headers) : {};
        const headersFromRequest = (resource && resource.headers) ? normalizeHeaders(resource.headers) : {};
        const mergedHeaders = { ...headersFromRequest, ...headersFromInit };
        const safeHeaders = filterSettableHeaders(mergedHeaders);
        v5Promise = originalFetch.call(this, v5Url, { method, headers: safeHeaders, credentials: 'same-origin' });
      }

      v5Promise
        .then(r => r.clone().json())
        .then(data => {
          window.postMessage({
            source: 'wbin-cmp-inject',
            action: 'campaignsV5DataCaptured',
            data,
            url: v5Url
          }, '*');
        })
        .catch(() => {});

      return mainPromise;
    } catch (e) {
      console.warn('WBin: не удалось сформировать v5 URL из fetch:', e);
    }
  }
  
  return originalFetch.apply(this, arguments);
};

// Утилита: построение v5 URL из v6 с чисткой параметров
function buildV5UrlFromV6Exact(v6Url) {
  const urlObj = new URL(v6Url, location.origin);
  urlObj.pathname = urlObj.pathname.replace('/api/v6/', '/api/v5/');
  return urlObj.toString();
}

// Нормализация заголовков из разных форматов в плоский объект
function normalizeHeaders(h) {
  const out = {};
  try {
    if (!h) return out;
    if (h instanceof Headers) {
      h.forEach((v, k) => { out[k] = v; });
      return out;
    }
    if (Array.isArray(h)) {
      h.forEach(([k, v]) => { if (k) out[k] = v; });
      return out;
    }
    if (typeof h === 'object') {
      Object.keys(h).forEach(k => { out[k] = h[k]; });
      return out;
    }
  } catch(_) {}
  return out;
}

// Фильтрация недопустимых к установке заголовков в браузере
function filterSettableHeaders(headersObj) {
  const forbidden = new Set([
    'cookie', 'cookie2', 'origin', 'referer', 'user-agent', 'host', 'connection', 'content-length',
    'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'
  ]);
  const secPrefix = 'sec-';
  const proxyPrefix = 'proxy-';
  const out = {};
  Object.entries(headersObj || {}).forEach(([k, v]) => {
    if (!k) return;
    const key = String(k).toLowerCase();
    if (forbidden.has(key)) return;
    if (key.startsWith(secPrefix) || key.startsWith(proxyPrefix)) return;
    out[k] = v;
  });
  return out;
}

console.log('WBin: перехват API инициализирован');

// Если мы на странице списка кампаний — попробуем один раз инициировать v5-запрос самостоятельно
if (location.pathname.startsWith('/campaigns/list')) {
  try {
    if (!window.__wbin_initial_v5_fired) {
      window.__wbin_initial_v5_fired = true;
      setTimeout(() => {
        try {
          // Собираем параметры из адресной строки и задаём дефолты
          const ui = new URLSearchParams(location.search);
          const p = new URLSearchParams();
          // Пагинация
          p.set('page_number', '1');
          p.set('page_size', ui.get('pageSize') || ui.get('page_size') || '90');
          // Фильтры (дефолты охватывают поиск+автореклама и основные статусы)
          p.set('type', ui.get('type') || '[8,9]');
          p.set('status', ui.get('status') || '[4,9,11]');
          p.set('order', ui.get('order') || 'createDate');
          p.set('direction', ui.get('direction') || 'desc');
          p.set('autofill', ui.get('autofill') || 'all');
          if (ui.get('search')) p.set('search', ui.get('search'));

          const v6Url = `${location.origin}/api/v6/atrevds?${p.toString()}`;
          const v5Url = buildV5UrlFromV6Exact(v6Url);

          // Выполняем пробный запрос к v5
          window.fetch(v5Url, { credentials: 'same-origin' })
            .then(r => r.clone().json())
            .then(data => {
              window.postMessage({
                source: 'wbin-cmp-inject',
                action: 'campaignsV5DataCaptured',
                data,
                url: v5Url
              }, '*');
            })
            .catch(() => {});
        } catch (e) {
          console.warn('WBin: не удалось выполнить начальный v5-запрос:', e);
        }
      }, 0);
    }
  } catch (e) {
    // noop
  }
}

// Если мы на странице детальной статистики кампании (АСК) — форсим fullstat при задержке
if (location.pathname.startsWith('/campaigns/statistics/details/')) {
  (function ensureAskFullstat() {
    try {
      const url = new URL(location.href);
      const idMatch = location.pathname.match(/details\/(\d+)/);
      const advertId = idMatch ? idMatch[1] : null;
      const fromRaw = url.searchParams.get('from');
      const toRaw = url.searchParams.get('to');

      if (!advertId || !fromRaw || !toRaw) return;

      const toIso = new Date(toRaw + 'T23:59:59Z').toISOString().replace('.000Z','Z');
      const fromIso = new Date(fromRaw + 'T00:00:00Z').toISOString().replace('.000Z','Z');

      const buildFullstatUrl = () => `${location.origin}/api/v5/fullstat?advertID=${advertId}&to=${encodeURIComponent(toIso)}&from=${encodeURIComponent(fromIso)}&appType=0&placementType=0`;

      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      const forceFetch = async () => {
        // Подождём чуть-чуть, вдруг фронт WB сам дернёт
        await sleep(2000);
        if (window.__wbin_ask_received) return;
        const url = buildFullstatUrl();
        console.log('WBin: форсируем запрос fullstat:', url);
        try {
          let attempt = 0;
          let delayMs = 800;
          while (attempt < 2 && !window.__wbin_ask_received) {
            attempt++;
            const resp = await originalFetch.call(window, url, { credentials: 'same-origin' });
            if (resp && resp.ok) {
              const data = await resp.clone().json().catch(() => null);
              if (data) {
                try { window.__wbin_ask_received = true; } catch(_) {}
                window.postMessage({
                  source: 'wbin-ask-inject',
                  action: 'askApiDataCaptured',
                  data,
                  url
                }, '*');
                break;
              }
            } else {
              // Если 429/5xx — подождём и повторим
              await sleep(delayMs + Math.floor(Math.random()*400));
              delayMs *= 2;
            }
          }
        } catch (e) {
          console.warn('WBin: не удалось форсировать fullstat:', e);
        }
      };

      // Запускаем форс только если в течение 3.5с не пришли данные
      setTimeout(() => { if (!window.__wbin_ask_received) forceFetch(); }, 3500);
    } catch (e) {
      // noop
    }
  })();
}