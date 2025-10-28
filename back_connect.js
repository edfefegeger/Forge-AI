// Конфигурация API
const API_URL = 'http://localhost:8000';

// Состояние приложения
let currentChatType = 'website';
let chatHistory = {
    design: [],
    website: []
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing DAPP...');
    
    // Небольшая задержка чтобы убедиться что все загрузилось
    setTimeout(() => {
        initializeSwitchers();
        initializeChat();
        initializeImageDisplay();
        console.log('✅ DAPP initialized successfully');
    }, 100);
});

// Инициализация переключателей вкладок
function initializeSwitchers() {
    const switches = document.querySelectorAll('[data-switch]');
    console.log('Found switches:', switches.length);
    
    switches.forEach(switchBtn => {
        switchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Switch clicked:', switchBtn.getAttribute('data-switch'));
            
            // Убираем активный класс у всех
            switches.forEach(s => s.classList.remove('_active'));
            // Добавляем активный класс к выбранному
            switchBtn.classList.add('_active');
            
            // Получаем тип чата
            currentChatType = switchBtn.getAttribute('data-switch');
            
            // Переключаем отображение
            toggleDisplay(currentChatType);
            
            // Загружаем историю чата
            loadChatHistory(currentChatType);
        });
    });
}

// Переключение отображения между design и website
function toggleDisplay(type) {
    const websiteView = document.querySelector('.dapp__website');
    const designView = document.querySelector('.dapp__design');
    
    console.log('Toggling display to:', type);
    
    if (type === 'website') {
        websiteView.classList.add('_active');
        designView.classList.remove('_active');
    } else {
        websiteView.classList.remove('_active');
        designView.classList.add('_active');
    }
}

// Инициализация чата
function initializeChat() {
    const input = document.querySelector('.dapp__input input');
    const button = document.querySelector('.dapp__input button');
    
    console.log('Initializing chat...');
    console.log('Input found:', !!input);
    console.log('Button found:', !!button);
    
    if (!input || !button) {
        console.error('❌ Input or button not found!');
        return;
    }
    
    // Отправка по клику на кнопку
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖱️ Button clicked!');
        sendMessage();
    });
    
    // Отправка по Enter
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log('⌨️ Enter pressed!');
            sendMessage();
        }
    });
    
    console.log('✅ Chat initialized');
}

// Отправка сообщения
async function sendMessage() {
    const input = document.querySelector('.dapp__input input');
    const userMessage = input.value.trim();
    
    console.log('📤 Sending message:', userMessage);
    
    if (!userMessage) {
        console.log('⚠️ Empty message, skipping');
        return;
    }
    
    // Добавляем сообщение пользователя в чат
    addMessageToChat(userMessage, 'user');
    
    // Очищаем input
    input.value = '';
    
    // Показываем индикатор загрузки
    const loadingMsg = currentChatType === 'design' 
        ? 'Generating logo and banner...' 
        : 'Generating website mockup...';
    addMessageToChat(loadingMsg, 'ai', true);
    
    try {
        console.log('🌐 Sending request to API...');
        console.log('Chat type:', currentChatType);
        console.log('API URL:', API_URL);
        
        // Отправляем запрос на backend
        const response = await fetch(`${API_URL}/generate-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_prompt: userMessage,
                chat_type: currentChatType
            })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API error:', errorText);
            throw new Error('Failed to generate images');
        }
        
        const data = await response.json();
        console.log('✅ Response received:', data);
        
        // Удаляем индикатор загрузки
        removeLoadingMessage();
        
        // Добавляем ответ AI
        const successMsg = currentChatType === 'design'
            ? `✓ Successfully generated ${data.images.length} images (logo + banner)`
            : '✓ Website mockup generated successfully!';
        addMessageToChat(successMsg, 'ai');
        
        // Отображаем изображения
        displayImages(data.images, data.type);
        
        // Сохраняем в историю
        chatHistory[currentChatType].push({
            userMessage,
            images: data.images
        });
        
        console.log('✅ Message sent successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error);
        removeLoadingMessage();
        addMessageToChat('✗ Error generating images. Please try again.', 'ai');
    }
}

// Добавление сообщения в чат
function addMessageToChat(message, type, isLoading = false) {
    const chatContainer = document.querySelector('.dapp__chat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `dapp__message _${type}`;
    if (isLoading) {
        messageDiv.classList.add('_loading');
    }
    messageDiv.textContent = message;
    chatContainer.appendChild(messageDiv);
    
    console.log(`💬 Added ${type} message:`, message);
    
    // Прокрутка вниз
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Удаление индикатора загрузки
function removeLoadingMessage() {
    const loadingMessage = document.querySelector('.dapp__message._loading');
    if (loadingMessage) {
        loadingMessage.remove();
        console.log('🗑️ Loading message removed');
    }
}

// Отображение сгенерированных изображений
function displayImages(images, type) {
    console.log('🖼️ Displaying images:', images);
    if (type === 'design') {
        displayDesignImages(images);
    } else if (type === 'website') {
        displayWebsiteImage(images);
    }
}

// Отображение изображений для Design вкладки (лого + баннер)
function displayDesignImages(images) {
    console.log('🎨 Displaying design images');
    const designView = document.querySelector('.dapp__design');
    
    // Находим контейнеры
    const logoContainer = designView.querySelector('.dapp__logos');
    const imgsContainer = designView.querySelector('.dapp__imgs');
    
    // Очищаем контейнеры
    logoContainer.innerHTML = '';
    imgsContainer.innerHTML = '';
    
    // Создаем контейнер для баннеров
    const twoContainer = document.createElement('div');
    twoContainer.className = 'dapp__two';
    imgsContainer.appendChild(twoContainer);
    
    images.forEach((img, index) => {
        console.log(`Adding ${img.type} image:`, img.url);
        
        if (img.type === 'logo') {
            // Добавляем лого с красивой анимацией
            const logoImg = document.createElement('img');
            logoImg.src = img.url;
            logoImg.alt = 'Generated Logo';
            logoImg.style.opacity = '0';
            logoImg.style.transform = 'scale(0.8)';
            logoImg.style.transition = 'all 0.5s ease';
            logoContainer.appendChild(logoImg);
            
            // Анимация появления
            setTimeout(() => {
                logoImg.style.opacity = '1';
                logoImg.style.transform = 'scale(1)';
            }, 100);
            
        } else if (img.type === 'banner') {
            // Добавляем баннер с анимацией
            const bannerImg = document.createElement('img');
            bannerImg.src = img.url;
            bannerImg.alt = 'Generated Banner';
            bannerImg.style.opacity = '0';
            bannerImg.style.transform = 'translateY(20px)';
            bannerImg.style.transition = 'all 0.5s ease';
            twoContainer.appendChild(bannerImg);
            
            // Анимация появления с задержкой
            setTimeout(() => {
                bannerImg.style.opacity = '1';
                bannerImg.style.transform = 'translateY(0)';
            }, 300 * (index + 1));
        }
    });
    
    console.log('✅ Design images displayed');
}

// Отображение изображения для Website вкладки
function displayWebsiteImage(images) {
    console.log('🌐 Displaying website image');
    const websiteView = document.querySelector('.dapp__website');
    
    if (images.length > 0) {
        // Очищаем контейнер
        websiteView.innerHTML = '';
        
        // Создаем изображение с анимацией
        const img = document.createElement('img');
        img.src = images[0].url;
        img.alt = 'Generated Website';
        img.style.opacity = '0';
        img.style.transform = 'scale(0.95)';
        img.style.transition = 'all 0.6s ease';
        
        websiteView.appendChild(img);
        
        // Анимация появления
        setTimeout(() => {
            img.style.opacity = '1';
            img.style.transform = 'scale(1)';
        }, 100);
        
        console.log('✅ Website image displayed');
    }
}

// Загрузка истории чата
function loadChatHistory(type) {
    const chatContainer = document.querySelector('.dapp__chat');
    chatContainer.innerHTML = '';
    
    console.log('📜 Loading chat history for:', type);
    
    // Добавляем приветственное сообщение
    if (type === 'design') {
        addMessageToChat('👋 Hello! I can generate logo and banner images for your project. What would you like to create?', 'ai');
    } else {
        addMessageToChat('👋 Hello! I can generate website mockup designs. Describe your ideal website!', 'ai');
    }
    
    // Загружаем историю
    chatHistory[type].forEach(item => {
        addMessageToChat(item.userMessage, 'user');
        const successMsg = type === 'design'
            ? `✓ Successfully generated ${item.images.length} images (logo + banner)`
            : '✓ Website mockup generated successfully!';
        addMessageToChat(successMsg, 'ai');
        
        // Отображаем изображения из истории
        displayImages(item.images, type);
    });
}

// Инициализация отображения изображений
function initializeImageDisplay() {
    // Устанавливаем начальное состояние
    loadChatHistory(currentChatType);
    console.log('🖼️ Image display initialized');
}

// Проверка доступности API при загрузке
fetch(`${API_URL}/health`)
    .then(res => res.json())
    .then(data => {
        console.log('✅ API health check:', data);
    })
    .catch(err => {
        console.error('❌ API not available:', err);
    });