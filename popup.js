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
    
    // Обработка нажатия на кнопку отчёта для АСК
    const askReportBtn = document.getElementById('ask-report-btn');
    if (askReportBtn) {
        askReportBtn.addEventListener('click', function() {
            chrome.tabs.create({ url: chrome.runtime.getURL('ask.html') });
            window.close();
        });
    }

    // Кнопка: заполнить Анализ АСК из страницы статистики
    const askFromStatsBtn = document.getElementById('ask-from-stats-btn');
    if (askFromStatsBtn) {
        askFromStatsBtn.addEventListener('click', function() {
            // Проверяем, что активная вкладка — это статистика WB (не детальная)
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];
                if (currentTab && currentTab.url && currentTab.url.includes('cmp.wildberries.ru/campaigns/statistics') && !currentTab.url.includes('/campaigns/statistics/details/')) {
                    askFromStatsBtn.disabled = true;
                    const originalText = askFromStatsBtn.textContent;
                    askFromStatsBtn.textContent = 'Загрузка…';
                    chrome.runtime.sendMessage({ action: 'askFromStats' }, function(resp) {
                        askFromStatsBtn.disabled = false;
                        askFromStatsBtn.textContent = originalText;
                        if (!(resp && resp.success)) {
                            alert('Не удалось получить данные со страницы статистики. Обновите страницу и попробуйте снова.');
                        } else {
                            window.close();
                        }
                    });
                } else {
                    alert('Откройте список статистики кампаний WB (не детали) и попробуйте снова.');
                }
            });
        });
    }
    
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