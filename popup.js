document.addEventListener('DOMContentLoaded', function() {
    // Переключение между вкладками
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Удаляем класс active у всех кнопок и скрываем все контенты
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.style.display = 'none');
            
            // Добавляем класс active к нажатой кнопке
            this.classList.add('active');
            
            // Показываем соответствующий контент
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).style.display = 'block';
        });
    });
    
    // Обработка нажатия на кнопку "ОТЧЁТ"
    const reportButton = document.getElementById('report-btn');
    
    reportButton.addEventListener('click', function() {
        // Получаем активную вкладку
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            
            // Проверяем, на какой странице находится пользователь
            if (currentTab.url.includes('cmp.wildberries.ru/campaigns/list')) {
                // Вызываем действие из background.js для страницы списка кампаний
                chrome.runtime.sendMessage({ action: 'generateReport', type: 'campaigns' });
                window.close();
            } 
            else if (currentTab.url.includes('cmp.wildberries.ru/campaigns/statistics')) {
                // Вызываем действие из background.js для страницы статистики
                chrome.runtime.sendMessage({ action: 'generateReport', type: 'statistics' });
                window.close();
            } 
            else {
                // Пользователь не на нужной странице, показываем сообщение
                alert('Пожалуйста, перейдите на страницу кампаний или статистики Wildberries согласно инструкции.');
            }
        });
    });
}); 