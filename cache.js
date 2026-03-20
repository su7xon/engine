// Simple in-memory cache with TTL
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 minutes default
    }

    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    clear() {
        this.cache.clear();
    }

    clearPattern(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    getStats() {
        let expired = 0;
        let valid = 0;
        
        for (const [key, item] of this.cache.entries()) {
            if (Date.now() > item.expiry) {
                expired++;
            } else {
                valid++;
            }
        }
        
        return {
            total: this.cache.size,
            valid,
            expired,
            keys: [...this.cache.keys()]
        };
    }
}

export const cache = new CacheManager();

// Cache keys
export const CACHE_KEYS = {
    INTELLIGENCE: (topic) => `intel:${topic.toLowerCase()}`,
    GDELT: (query) => `gdelt:${query.toLowerCase()}`,
    CURRENTS: (category) => `currents:${category}`,
    ECONOMY: 'economy:dashboard',
    ENTITIES: 'entities:all',
    SEARCH: (q) => `search:${q.toLowerCase()}`
};

export function generateCacheKey(type, ...params) {
    return `${type}:${params.join(':')}`;
}
