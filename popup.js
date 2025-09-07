document.addEventListener('DOMContentLoaded', function() {
    // Принудительно устанавливаем размеры попапа
    function setPopupDimensions() {
        document.documentElement.style.width = '400px';
        document.documentElement.style.minWidth = '400px';
        document.documentElement.style.maxWidth = '400px';
        document.documentElement.style.minHeight = '500px';
        document.documentElement.style.maxHeight = '600px';
        
        document.body.style.width = '400px';
        document.body.style.minWidth = '400px';
        document.body.style.maxWidth = '400px';
        document.body.style.minHeight = '500px';
        document.body.style.maxHeight = '600px';
        document.body.style.overflow = 'visible';
    }
    
    // Устанавливаем размеры сразу
    setPopupDimensions();
    
    // Повторяем через небольшую задержку для надежности
    setTimeout(setPopupDimensions, 100);
    // Управление feature items
    const featureItems = document.querySelectorAll('.feature-item');
    
    // Добавляем data-feature атрибуты к feature items
    const campaignsFeature = document.querySelector('.feature-item:nth-child(1)');
    const statisticsFeature = document.querySelector('.feature-item:nth-child(2)');
    const askFeature = document.querySelector('.feature-item:nth-child(3)');
    const financialFeature = document.querySelector('.feature-item:nth-child(4)');
    
    if (campaignsFeature) campaignsFeature.setAttribute('data-feature', 'campaigns');
    if (statisticsFeature) statisticsFeature.setAttribute('data-feature', 'statistics');
    if (askFeature) askFeature.setAttribute('data-feature', 'ask');
    if (financialFeature) financialFeature.setAttribute('data-feature', 'financial');
    
    // Функции для каждого типа отчета
    function handleCampaignsReport() {
        setFeatureLoading(campaignsFeature, 'Загрузка...');
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url && currentTab.url.includes('cmp.wildberries.ru/campaigns/list')) {
                chrome.runtime.sendMessage({ action: 'generateReport', type: 'campaigns' }, function(response) {
                    setFeatureSuccess(campaignsFeature, 'Готово!');
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                });
            } else {
                setFeatureError(campaignsFeature, 'Ошибка');
                showNotification('Перейдите на страницу кампаний Wildberries', 'error');
            }
        });
    }
    
    function handleStatisticsReport() {
        setFeatureLoading(statisticsFeature, 'Загрузка...');
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url && currentTab.url.includes('cmp.wildberries.ru/campaigns/statistics')) {
                chrome.runtime.sendMessage({ action: 'generateReport', type: 'statistics' }, function(response) {
                    setFeatureSuccess(statisticsFeature, 'Готово!');
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                });
            } else {
                setFeatureError(statisticsFeature, 'Ошибка');
                showNotification('Перейдите на страницу статистики Wildberries', 'error');
            }
        });
    }
    
    function handleAskReport() {
        setFeatureLoading(askFeature, 'Открытие...');
        chrome.tabs.create({ url: chrome.runtime.getURL('ask/ask.html') });
        setTimeout(() => {
            window.close();
        }, 500);
    }
    
    function handleFinancialReport() {
        setFeatureLoading(financialFeature, 'Открытие...');
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            const url = (tab && tab.url) || '';
            const isReportsPage = typeof url === 'string' && url.includes('seller.wildberries.ru/suppliers-mutual-settlements/reports-implementations/reports-weekly');
            if (isReportsPage) {
                const repUrl = chrome.runtime.getURL('finreport/reports.html');
                chrome.tabs.create({ url: repUrl });
                setTimeout(() => { window.close(); }, 300);
            } else {
                setFeatureError(financialFeature, 'Откройте страницу отчетов');
                showNotification('Откройте страницу: Финансовые отчёты → Отчёты реализации', 'error');
            }
        });
    }
    
    // Добавляем обработчики для feature items
    featureItems.forEach(feature => {
        feature.addEventListener('click', function() {
            const featureType = this.getAttribute('data-feature');
            
            // Выполняем соответствующую функцию
            switch(featureType) {
                case 'campaigns':
                    handleCampaignsReport();
                    break;
                case 'statistics':
                    handleStatisticsReport();
                    break;
                case 'ask':
                    handleAskReport();
                    break;
                case 'financial':
                    handleFinancialReport();
                    break;
            }
        });
    });
});

// Вспомогательные функции для управления состоянием feature items
function setFeatureLoading(feature, text) {
    const featureName = feature.querySelector('.feature-name');
    if (featureName) {
        featureName.textContent = text;
    }
    feature.classList.add('loading');
}

function setFeatureSuccess(feature, text) {
    const featureName = feature.querySelector('.feature-name');
    if (featureName) {
        featureName.textContent = text;
    }
    feature.classList.remove('loading');
    feature.classList.add('success');
}

function setFeatureError(feature, text) {
    const featureName = feature.querySelector('.feature-name');
    if (featureName) {
        featureName.textContent = text;
    }
    feature.classList.remove('loading');
    feature.classList.add('error');
    
    // Сбрасываем состояние через 3 секунды
    setTimeout(() => {
        feature.classList.remove('error');
        const featureName = feature.querySelector('.feature-name');
        if (featureName) {
            featureName.textContent = getOriginalFeatureName(feature);
        }
    }, 3000);
}

function getOriginalFeatureName(feature) {
    const featureType = feature.getAttribute('data-feature');
    switch(featureType) {
        case 'campaigns': return 'Кампании';
        case 'statistics': return 'Статистика';
        case 'ask': return 'АСК Анализ';
        case 'financial': return 'Фин.Отчеты';
        default: return 'Раздел';
    }
}

// Функция для показа уведомлений (можно расширить)
function showNotification(message, type = 'info') {
    // Простая реализация - можно заменить на более продвинутую
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 197, 94, 0.9)'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        backdrop-filter: blur(10px);
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Добавляем CSS анимации для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }
`;
document.head.appendChild(style);