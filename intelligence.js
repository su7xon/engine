import dotenv from 'dotenv';
import { cache, CACHE_KEYS } from './cache.js';

dotenv.config();

const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY;
const DEBUG_MODE = process.env.DEBUG === 'true';

const LOG = (source, msg, data) => {
    if (DEBUG_MODE) console.log(`[${source}] ${msg}`, data || '');
};

const TTL = {
    SHORT: 2 * 60 * 1000,
    MEDIUM: 5 * 60 * 1000,
    LONG: 15 * 60 * 1000,
    VERY_LONG: 60 * 60 * 1000
};

// Comprehensive RSS feeds for global coverage
const RSS_FEEDS = [
    { name: 'Reuters World', url: 'https://feeds.reuters.com/news/worldnews', category: 'world' },
    { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
    { name: 'Defense News', url: 'https://www.defensenews.com/feed/rss/', category: 'defense' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world' },
    { name: 'The Hindu', url: 'https://www.thehindu.com/news/feeds/default/rss/front_page_news.xml', category: 'india' },
    { name: 'Economic Times', url: 'https://economictimes.indiatimes.com/news/rssfeed.cms', category: 'economy' },
    { name: 'Financial Express', url: 'https://www.financialexpress.com/feed/', category: 'economy' },
    { name: 'NDTV', url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'india' },
];

// Country-specific RSS feeds
const COUNTRY_RSS = {
    'china': [
        { name: 'SCMP', url: 'https://www.scmp.com/rss/feed/0.xml', category: 'china' },
        { name: 'China Daily', url: 'https://www.chinadaily.com.cn/rss/rss.xml', category: 'china' },
    ],
    'usa': [
        { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'usa' },
        { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world', category: 'usa' },
    ],
    'russia': [
        { name: 'RT', url: 'https://www.rt.com/rss/', category: 'russia' },
    ]
};

const CURRENTS_CATEGORIES = ['technology', 'business', 'world', 'science'];

async function fetchRSS(feed, limit = 5) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(feed.url, { 
            signal: controller.signal,
            timeout: 8000 
        });
        clearTimeout(timeout);
        
        const xmlText = await response.text();
        
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        
        while ((match = itemRegex.exec(xmlText)) !== null && items.length < limit) {
            const itemXml = match[1];
            const getTag = (tag) => {
                const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
                const m = itemXml.match(regex);
                return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
            };
            
            items.push({
                title: getTag('title'),
                description: getTag('description'),
                pubDate: getTag('pubDate'),
                link: getTag('link'),
                source: feed.name,
                category: feed.category || 'general',
                type: 'rss'
            });
        }
        
        return items;
    } catch (error) {
        if (error.name !== 'AbortError') {
            LOG('RSS', `Error fetching ${feed.name}:`, error.message);
        }
        return [];
    }
}

export async function fetchCurrentsNews(category = 'world', limit = 10) {
    const cacheKey = CACHE_KEYS.CURRENTS(category);
    
    if (cache.has(cacheKey)) {
        LOG('CURRENTS', `Cache hit for: ${category}`);
        return cache.get(cacheKey);
    }
    
    if (!CURRENTS_API_KEY) {
        LOG('CURRENTS', 'No API key configured');
        return [];
    }
    
    try {
        const response = await fetch(
            `https://api.currentsapi.services/v1/latestnews?category=${category}&language=en&limit=${limit}&apiKey=${CURRENTS_API_KEY}`,
            { timeout: 10000 }
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const results = (data.news || []).map(article => ({
            title: article.title,
            description: article.description,
            pubDate: article.published,
            link: article.url,
            image: article.image,
            source: article.author || article.source?.name || 'Currents',
            category: category,
            type: 'currents'
        }));
        
        cache.set(cacheKey, results, TTL.MEDIUM);
        LOG('CURRENTS', `Cached ${results.length} items for: ${category}`);
        
        return results;
    } catch (error) {
        LOG('CURRENTS', 'Error:', error.message);
        return [];
    }
}

export async function fetchGDELT(query = 'world affairs', maxItems = 20) {
    const cacheKey = CACHE_KEYS.GDELT(query);
    
    if (cache.has(cacheKey)) {
        LOG('GDELT', `Cache hit for: ${query}`);
        return cache.get(cacheKey);
    }
    
    try {
        const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${maxItems}&format=json`;
        
        const response = await fetch(gdeltUrl, { timeout: 15000 });
        
        if (!response.ok) {
            throw new Error(`GDELT HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const results = (data.articles || []).map(article => ({
            title: article.title,
            description: article.seentence,
            pubDate: article.seendate,
            link: article.url,
            source: article.domain,
            category: query,
            type: 'gdelt'
        }));
        
        cache.set(cacheKey, results, TTL.MEDIUM);
        LOG('GDELT', `Cached ${results.length} items for: ${query}`);
        
        return results;
    } catch (error) {
        LOG('GDELT', 'Error:', error.message);
        return [];
    }
}

export async function fetchWorldBankIndicators(country = 'IND') {
    const cacheKey = `worldbank:${country}`;
    
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    const indicators = [
        { code: 'NY.GDP.MKTP.CD', name: 'GDP (current US$)' },
        { code: 'FP.CPI.TOTL.ZG', name: 'Inflation, consumer prices (annual %)' },
        { code: 'SL.UEM.TOTL.ZS', name: 'Unemployment, total (% of labor force)' },
        { code: 'GC.REV.XGRT.GD.ZS', name: 'Revenue, excluding grants (% of GDP)' },
        { code: 'NE.EXP.GNFS.ZS', name: 'Exports of goods and services (% of GDP)' },
        { code: 'NE.IMP.GNFS.ZS', name: 'Imports of goods and services (% of GDP)' },
        { code: 'BX.KLT.DINV.CD.WD', name: 'Foreign Direct Investment (net inflows)' },
        { code: 'SP.POP.TOTL', name: 'Total Population' },
    ];
    
    const results = {};
    
    for (const ind of indicators) {
        try {
            const response = await fetch(
                `https://api.worldbank.org/v2/country/${country}/indicator/${ind.code}?format=json&per_page=1`,
                { timeout: 10000 }
            );
            
            const data = await response.json();
            
            if (data[1] && data[1][0]) {
                results[ind.name] = {
                    value: data[1][0].value,
                    year: data[1][0].date
                };
            }
        } catch (error) {
            LOG('WORLDBANK', `Error for ${ind.code}:`, error.message);
        }
    }
    
    cache.set(cacheKey, results, TTL.LONG);
    
    return results;
}

export async function fetchAllIntelligence(topic = 'India') {
    LOG('INTEL', `Fetching comprehensive intelligence on: ${topic}`);
    
    const cacheKey = CACHE_KEYS.INTELLIGENCE(topic);
    
    if (cache.has(cacheKey)) {
        LOG('INTEL', `Cache hit for: ${topic}`);
        return cache.get(cacheKey);
    }
    
    const topicLower = topic.toLowerCase();
    const countryFeeds = COUNTRY_RSS[topicLower] || [];
    const allFeeds = [...RSS_FEEDS, ...countryFeeds];
    
    const [rssResults, currentsResults, gdeltResults] = await Promise.allSettled([
        Promise.all(allFeeds.map(feed => fetchRSS(feed, 5))),
        fetchCurrentsNews('world', 15),
        fetchGDELT(topic, 20)
    ]);
    
    const allNews = [];
    
    if (rssResults.status === 'fulfilled') {
        rssResults.value.forEach(feedItems => {
            allNews.push(...feedItems);
        });
    }
    
    if (currentsResults.status === 'fulfilled') {
        allNews.push(...currentsResults.value);
    }
    
    if (gdeltResults.status === 'fulfilled') {
        allNews.push(...gdeltResults.value);
    }
    
    const deduplicated = [];
    const seen = new Set();
    
    for (const article of allNews) {
        const key = article.title.toLowerCase().substring(0, 60);
        if (!seen.has(key) && article.title) {
            seen.add(key);
            deduplicated.push(article);
        }
    }
    
    const sorted = deduplicated.sort((a, b) => {
        const dateA = new Date(a.pubDate || 0);
        const dateB = new Date(b.pubDate || 0);
        return dateB - dateA;
    });
    
    const result = {
        topic,
        news: sorted.slice(0, 50),
        sources: {
            rss: rssResults.status === 'fulfilled' ? rssResults.value.reduce((acc, items) => acc + items.length, 0) : 0,
            currents: currentsResults.status === 'fulfilled' ? currentsResults.value.length : 0,
            gdelt: gdeltResults.status === 'fulfilled' ? gdeltResults.value.length : 0
        },
        cacheStats: cache.getStats(),
        timestamp: new Date().toISOString()
    };
    
    cache.set(cacheKey, result, TTL.MEDIUM);
    LOG('INTEL', `Total intelligence gathered: ${sorted.length} items for ${topic}`);
    
    return result;
}

export async function searchIntelligence(query) {
    const cacheKey = CACHE_KEYS.SEARCH(query);
    
    if (cache.has(cacheKey)) {
        LOG('SEARCH', `Cache hit for: ${query}`);
        return cache.get(cacheKey);
    }
    
    const results = await Promise.allSettled([
        fetchCurrentsNews(query, 15),
        fetchGDELT(query, 15)
    ]);
    
    const allResults = [];
    
    if (results[0].status === 'fulfilled') {
        allResults.push(...results[0].value);
    }
    
    if (results[1].status === 'fulfilled') {
        allResults.push(...results[1].value);
    }
    
    const result = allResults.slice(0, 30);
    cache.set(cacheKey, result, TTL.SHORT);
    
    return result;
}

export async function getEconomicDashboard(country = 'IND') {
    const [worldBank, news] = await Promise.allSettled([
        fetchWorldBankIndicators(country),
        fetchCurrentsNews('business', 10)
    ]);
    
    return {
        country,
        indicators: worldBank.status === 'fulfilled' ? worldBank.value : {},
        news: news.status === 'fulfilled' ? news.value.slice(0, 5) : [],
        timestamp: new Date().toISOString()
    };
}

export function getCacheStats() {
    return cache.getStats();
}

export function clearAllCache() {
    cache.clear();
    LOG('CACHE', 'All caches cleared');
}

export function clearTopicCache(topic) {
    cache.clearPattern(topic.toLowerCase());
    LOG('CACHE', `Cleared cache for: ${topic}`);
}
