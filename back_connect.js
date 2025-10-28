const API_URL = 'http://localhost:8000';

let currentChatType = 'website';
let chatHistory = {
    design: [],
    website: []
};


document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing DAPP...');

    setTimeout(() => {
        initializeSwitchers();
        initializeChat();
        initializeImageDisplay();
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
    
    // Очищаем input
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

// Загрузка истории чата
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


fetch(`${API_URL}/health`)
    .then(res => res.json())
    .then(data => {
        console.log('✅ API health check:', data);
    })
    .catch(err => {
        console.error('❌ API not available:', err);
    });