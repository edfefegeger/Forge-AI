// ==================== CONFIG ====================
const API_URL = 'http://localhost:8000';

// Интервал обновления статистики (каждые 10 секунд)
const STATS_UPDATE_INTERVAL = 10000;
let statsUpdateTimer = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 Initializing stats system...');
    initializeStats();
});

// ==================== ОСНОВНАЯ ЛОГИКА ====================

async function fetchStats() {
    try {
        console.log('📊 Fetching stats from API...');

        const response = await fetch(`${API_URL}/stats`);

        if (!response.ok) {
            throw new Error(`Failed to fetch stats (status: ${response.status})`);
        }

        const data = await response.json();
        console.log('✅ Stats received:', data);

        updateStatsDisplay(data);
    } catch (error) {
        console.error('❌ Error fetching stats:', error);

        // Показываем заглушку при ошибке
        updateStatsDisplay({
            token_created: 0,
            trading_volume: 0,
            active_users: 0
        });
    }
}

function updateStatsDisplay(stats) {
    console.log('🔄 Updating stats display:', stats);

    const counterItems = document.querySelectorAll('.counter__item');

    if (counterItems.length >= 3) {
        // Token Created
        const tokenSpan = counterItems[0].querySelector('span');
        const tokenLabel = counterItems[0].querySelector('p');
        if (tokenSpan) animateNumber(tokenSpan, stats.token_created);
        if (tokenLabel) tokenLabel.textContent = 'Token created';

        // Trading Volume
        const volumeSpan = counterItems[1].querySelector('span');
        const volumeLabel = counterItems[1].querySelector('p');
        if (volumeSpan) volumeSpan.textContent = formatVolume(stats.trading_volume);
        if (volumeLabel) volumeLabel.textContent = 'Trading volume';

        // Active Users
        const usersSpan = counterItems[2].querySelector('span');
        const usersLabel = counterItems[2].querySelector('p');
        if (usersSpan) animateNumber(usersSpan, stats.active_users);
        if (usersLabel) usersLabel.textContent = 'Active users';

        console.log('✅ Stats display updated');
    } else {
        console.warn('⚠️ Counter items not found on page');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatVolume(volume) {
    if (volume >= 1_000_000) {
        return `$${(volume / 1_000_000).toFixed(2)}M`;
    } else if (volume >= 1_000) {
        return `$${(volume / 1_000).toFixed(2)}K`;
    }
    return `$${volume.toFixed(2)}`;
}

function animateNumber(element, targetValue, duration = 1000) {
    const startValue = parseInt(element.textContent.replace(/\s/g, '')) || 0;
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = progress * (2 - progress);
        const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuad);

        element.textContent = formatNumber(currentValue);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    update();
}

function initializeStats() {
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

    console.log(`✅ Stats system initialized (updates every ${STATS_UPDATE_INTERVAL / 1000}s)`);
}

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (statsUpdateTimer) {
        clearInterval(statsUpdateTimer);
        console.log('🧹 Stats timer cleared');
    }
});
