const API_URL = 'http://localhost:8000';

let currentChatType = 'website';
let chatHistory = {
    design: [],
    website: []
};

// Интервал обновления статистики (каждые 10 секунд)
const STATS_UPDATE_INTERVAL = 10000;
let statsUpdateTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing DAPP...');

    setTimeout(() => {
        initializeSwitchers();
        initializeChat();
        initializeImageDisplay();
        initializeStats();
        console.log('✅ DAPP initialized successfully');
    }, 100);
});

function initializeSwitchers() {
    const switches = document.querySelectorAll('[data-switch]');
    console.log('Found switches:', switches.length);
    
    switches.forEach(switchBtn => {
        switchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Switch clicked:', switchBtn.getAttribute('data-switch'));

            switches.forEach(s => s.classList.remove('_active'));
            switchBtn.classList.add('_active');

            currentChatType = switchBtn.getAttribute('data-switch');
            toggleDisplay(currentChatType);
            loadChatHistory(currentChatType);
        });
    });
}

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

// ==================== СТАТИСТИКА ====================

async function fetchStats() {
    try {
        console.log('📊 Fetching stats from API...');
        
        const response = await fetch(`${API_URL}/stats`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch stats');
        }
        
        const data = await response.json();
        console.log('✅ Stats received:', data);
        
        updateStatsDisplay(data);
        
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        // В случае ошибки показываем заглушку
        updateStatsDisplay({
            token_created: 0,
            trading_volume: 0,
            active_users: 0
        });
    }
}

function formatNumber(num) {
    // Форматирование чисел с пробелами (например, 100 000)
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatVolume(volume) {
    // Форматирование объема торгов
    if (volume >= 1000000) {
        return `$${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
        return `$${(volume / 1000).toFixed(2)}K`;
    }
    return `$${volume.toFixed(2)}`;
}

function animateNumber(element, targetValue, duration = 1000) {
    const startValue = parseInt(element.textContent.replace(/\s/g, '')) || 0;
    const startTime = Date.now();
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function для плавной анимации
        const easeOutQuad = progress * (2 - progress);
        const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuad);
        
        element.textContent = formatNumber(currentValue);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    update();
}

function updateStatsDisplay(stats) {
    console.log('🔄 Updating stats display:', stats);
    
    const counterItems = document.querySelectorAll('.counter__item');
    
    if (counterItems.length >= 3) {
        // Token Created
        const tokenSpan = counterItems[0].querySelector('span');
        const tokenLabel = counterItems[0].querySelector('p');
        if (tokenSpan) {
            animateNumber(tokenSpan, stats.token_created);
        }
        if (tokenLabel) {
            tokenLabel.textContent = 'Token created';
        }
        
        // Trading Volume
        const volumeSpan = counterItems[1].querySelector('span');
        const volumeLabel = counterItems[1].querySelector('p');
        if (volumeSpan) {
            volumeSpan.textContent = formatVolume(stats.trading_volume);
        }
        if (volumeLabel) {
            volumeLabel.textContent = 'Trading volume';
        }
        
        // Active Users
        const usersSpan = counterItems[2].querySelector('span');
        const usersLabel = counterItems[2].querySelector('p');
        if (usersSpan) {
            animateNumber(usersSpan, stats.active_users);
        }
        if (usersLabel) {
            usersLabel.textContent = 'Active users';
        }
        
        console.log('✅ Stats display updated');
    } else {
        console.warn('⚠️ Counter items not found');
    }
}

function initializeStats() {
    console.log('📊 Initializing stats system...');
    
    // Первоначальная загрузка
    fetchStats();
    
    // Периодическое обновление каждые 10 секунд
    if (statsUpdateTimer) {
        clearInterval(statsUpdateTimer);
    }
    
    statsUpdateTimer = setInterval(() => {
        console.log('⏰ Auto-updating stats...');
        fetchStats();
    }, STATS_UPDATE_INTERVAL);
    
    console.log(`✅ Stats system initialized (updates every ${STATS_UPDATE_INTERVAL/1000}s)`);
}

// ==================== ЧАТ ====================

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
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖱️ Button clicked!');
        sendMessage();
    });
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log('⌨️ Enter pressed!');
            sendMessage();
        }
    });
    
    console.log('✅ Chat initialized');
}

async function sendMessage() {
    const input = document.querySelector('.dapp__input input');
    const userMessage = input.value.trim();
    
    console.log('📤 Sending message:', userMessage);
    
    if (!userMessage) {
        console.log('⚠️ Empty message, skipping');
        return;
    }

    addMessageToChat(userMessage, 'user');
    input.value = '';

    const loadingMsg = currentChatType === 'design' 
        ? 'Generating logo and banner...' 
        : 'Generating website mockup...';
    addMessageToChat(loadingMsg, 'ai', true);
    
    try {
        console.log('🌐 Sending request to API...');
        console.log('Chat type:', currentChatType);
        console.log('API URL:', API_URL);
        
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
        
        removeLoadingMessage();
        
        const successMsg = currentChatType === 'design'
            ? `✓ Successfully generated ${data.images.length} images (logo + banner)`
            : '✓ Website mockup generated successfully!';
        addMessageToChat(successMsg, 'ai');
        
        displayImages(data.images, data.type);
        
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
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeLoadingMessage() {
    const loadingMessage = document.querySelector('.dapp__message._loading');
    if (loadingMessage) {
        loadingMessage.remove();
        console.log('🗑️ Loading message removed');
    }
}

function displayImages(images, type) {
    console.log('🖼️ Displaying images:', images);
    if (type === 'design') {
        displayDesignImages(images);
    } else if (type === 'website') {
        displayWebsiteImage(images);
    }
}

function displayDesignImages(images) {
    console.log('🎨 Displaying design images');
    const designView = document.querySelector('.dapp__design');
    
    const logoContainer = designView.querySelector('.dapp__logos');
    const imgsContainer = designView.querySelector('.dapp__imgs');

    logoContainer.innerHTML = '';
    imgsContainer.innerHTML = '';
    
    const twoContainer = document.createElement('div');
    twoContainer.className = 'dapp__two';
    imgsContainer.appendChild(twoContainer);
    
    images.forEach((img, index) => {
        console.log(`Adding ${img.type} image:`, img.url);
        
        if (img.type === 'logo') {
            const logoImg = document.createElement('img');
            logoImg.src = img.url;
            logoImg.alt = 'Generated Logo';
            logoImg.style.opacity = '0';
            logoImg.style.transform = 'scale(0.8)';
            logoImg.style.transition = 'all 0.5s ease';
            logoContainer.appendChild(logoImg);
            
            setTimeout(() => {
                logoImg.style.opacity = '1';
                logoImg.style.transform = 'scale(1)';
            }, 100);
            
        } else if (img.type === 'banner') {
            const bannerImg = document.createElement('img');
            bannerImg.src = img.url;
            bannerImg.alt = 'Generated Banner';
            bannerImg.style.opacity = '0';
            bannerImg.style.transform = 'translateY(20px)';
            bannerImg.style.transition = 'all 0.5s ease';
            twoContainer.appendChild(bannerImg);
            
            setTimeout(() => {
                bannerImg.style.opacity = '1';
                bannerImg.style.transform = 'translateY(0)';
            }, 300 * (index + 1));
        }
    });
    
    console.log('✅ Design images displayed');
}

function displayWebsiteImage(images) {
    console.log('🌐 Displaying website image');
    const websiteView = document.querySelector('.dapp__website');
    
    if (images.length > 0) {
        websiteView.innerHTML = '';
        
        const img = document.createElement('img');
        img.src = images[0].url;
        img.alt = 'Generated Website';
        img.style.opacity = '0';
        img.style.transform = 'scale(0.95)';
        img.style.transition = 'all 0.6s ease';
        
        websiteView.appendChild(img);
        
        setTimeout(() => {
            img.style.opacity = '1';
            img.style.transform = 'scale(1)';
        }, 100);
        
        console.log('✅ Website image displayed');
    }
}

function loadChatHistory(type) {
    const chatContainer = document.querySelector('.dapp__chat');
    chatContainer.innerHTML = '';
    
    console.log('📜 Loading chat history for:', type);
    
    if (type === 'design') {
        addMessageToChat('👋 Hello! I can generate logo and banner images for your project. What would you like to create?', 'ai');
    } else {
        addMessageToChat('👋 Hello! I can generate website mockup designs. Describe your ideal website!', 'ai');
    }
    
    chatHistory[type].forEach(item => {
        addMessageToChat(item.userMessage, 'user');
        const successMsg = type === 'design'
            ? `✓ Successfully generated ${item.images.length} images (logo + banner)`
            : '✓ Website mockup generated successfully!';
        addMessageToChat(successMsg, 'ai');
        
        displayImages(item.images, type);
    });
}

function initializeImageDisplay() {
    loadChatHistory(currentChatType);
    console.log('🖼️ Image display initialized');
}

// Health check
fetch(`${API_URL}/health`)
    .then(res => res.json())
    .then(data => {
        console.log('✅ API health check:', data);
    })
    .catch(err => {
        console.error('❌ API not available:', err);
    });

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (statsUpdateTimer) {
        clearInterval(statsUpdateTimer);
        console.log('🧹 Stats timer cleared');
    }
});