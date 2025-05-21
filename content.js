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