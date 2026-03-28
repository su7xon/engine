import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import http from 'http';
import { initializeVectorStore, findSimilarChunks } from './rag.js';
import runMigrations, { getAppliedMigrations } from './database_migrations.js';
import { createBackup, listBackups, restoreBackup, deleteBackup, cleanupOldBackups, startAutoBackup } from './database_backup.js';
import { analyzeSentiment, trackSentimentTrend } from './sentiment_analysis.js';
import { initializeCrawler, runCrawlSession, getCrawlerStatus, searchCrawledContent, getCrawledContentByDomain, getCrawler } from './web_crawler.js';
import {
    fetchAllIntelligence,
    searchIntelligence,
    getEconomicDashboard,
    getCacheStats,
    clearAllCache,
    clearTopicCache
} from './intelligence.js';
import {
    autoUpdateKnowledgeBase,
    searchEntities,
    getFacts,
    getIntelligence,
    getExtractedEntities,
    getEntityNodes,
    getEntityRelationships
} from './kb_updater.js';
import {
    default as db,
    getStats,
    getSessionMessages,
    getFullGraph,
    getRecentIntelligence,
    getAllNodes,
    getAllRelationships,
    addNode,
    addRelationship
} from './database.js';
import { getDashboardStats, analyzeNewsBatch, enrichGraphFromNews, analyzeSourceFusion } from './analyzer.js';
import { calculateRiskPropagation } from './markov_model.js';
import { getRuntimeConfig, getPublicRuntimeConfig } from './runtime_config.js';
import { initAuth, authenticateUser, verifySessionToken, requireRole, listRoles } from './auth.js';
import { predictStrategicRisk } from './predictive_analytics.js';
import { initRealtime, emitAlert } from './realtime.js';
import { generateReportNow, startScheduledReports } from './scheduled_reports.js';
import { getCountryNews, getSupportedCountries, getCountryYouTubeUrl } from './news_fetcher.js';
import {
    fetchClimateData,
    fetchClimateEvents,
    calculateClimateRiskScore,
    assessAgriculturalImpact,
    fetchEnvironmentalPolicies
} from './climate.js';

dotenv.config();

/* global process */
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'indra-internal-key';

const operationalLogsByCountry = new Map();
const LOG_LIMIT_PER_COUNTRY = 120;

const COUNTRY_ALIASES = {
    'United States of America': 'USA',
    'United States': 'USA',
    US: 'USA',
    'U.S.A.': 'USA',
    'Russian Federation': 'Russia',
    'Iran, Islamic Republic of': 'Iran',
    'Islamic Republic of Iran': 'Iran',
    UAE: 'Gulf States',
    'United Arab Emirates': 'Gulf States',
    'Saudi Arabia': 'Gulf States',
    Qatar: 'Gulf States',
    Kuwait: 'Gulf States',
    Bahrain: 'Gulf States',
    Oman: 'Gulf States',
    'European Union': 'EU',
    UK: 'EU',
    'United Kingdom': 'EU',
    Britain: 'EU'
};

function normalizeCountryLabel(country) {
    if (!country || typeof country !== 'string') return 'GLOBAL';
    const trimmed = country.trim();
    if (!trimmed) return 'GLOBAL';
    return COUNTRY_ALIASES[trimmed] || trimmed;
}

function writeOperationalLog(country, type, message) {
    const normalized = normalizeCountryLabel(country);
    const row = {
        timestamp: new Date().toISOString(),
        type,
        message
    };
    const existing = operationalLogsByCountry.get(normalized) || [];
    existing.unshift(row);
    if (existing.length > LOG_LIMIT_PER_COUNTRY) {
        existing.length = LOG_LIMIT_PER_COUNTRY;
    }
    operationalLogsByCountry.set(normalized, existing);
    return row;
}

function readOperationalLogs(country) {
    const normalized = normalizeCountryLabel(country);
    const logs = operationalLogsByCountry.get(normalized) || [];
    return {
        country: normalized,
        logs,
        count: logs.length,
        lastUpdated: new Date().toISOString()
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

async function fetchYahooSeries(symbol, range = '1mo', interval = '1d') {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const response = await fetch(url, { timeout: 12000 });
    if (!response.ok) {
        throw new Error(`Yahoo chart HTTP ${response.status} for ${symbol}`);
    }

    const payload = await response.json();
    const result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    const quote = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    const closes = (quote && quote.close ? quote.close : []).filter((v) => Number.isFinite(v));

    if (!closes.length) {
        throw new Error(`No close data for ${symbol}`);
    }

    const last = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : last;
    const changePct = prev !== 0 ? ((last - prev) / prev) * 100 : 0;

    return {
        symbol,
        last: Number(last.toFixed(2)),
        changePct: Number(changePct.toFixed(2)),
        series: closes.slice(-14).map((v) => Number(v.toFixed(2)))
    };
}

function calculateStressFromDrivers(drivers) {
    let score = 25;

    for (const d of drivers) {
        if (d.id === 'india' || d.id === 'us') {
            if (d.changePct < 0) score += Math.abs(d.changePct) * 9;
            else score -= Math.abs(d.changePct) * 2;
        }
        if (d.id === 'oil') {
            if (d.changePct > 0) score += Math.abs(d.changePct) * 7;
            else score -= Math.abs(d.changePct) * 2;
        }
        if (d.id === 'gold') {
            if (d.changePct > 0) score += Math.abs(d.changePct) * 4;
        }
    }

    const stressScore = Math.round(clamp(score, 0, 100));
    const stressLevel = stressScore >= 70 ? 'HIGH' : stressScore >= 45 ? 'MEDIUM' : 'LOW';
    return { stressScore, stressLevel };
}

// Test route at the very top
app.get('/api/mark', (req, res) => {
    res.json({ test: 'markov works', scores: calculateRiskPropagation(5, 0.85) });
});

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${req.ip}`);
    }
    next();
});

// API Key middleware for protected endpoints
/* eslint-disable-next-line */
const requireAPIKey = (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.apiKey;
    if (key && key === API_KEY) {
        return next();
    }
    // Allow access without key for now
    next();
};

// Health check with system info
app.get('/api/health', (req, res) => {
    let dbStats;
    try {
        dbStats = getStats();
    } catch (e) {
        dbStats = { error: e.message };
    }
    res.json({
        status: 'OPERATIONAL',
        engine: 'INDRA Global Ontology Engine',
        version: '3.2',
        cache: getCacheStats(),
        database: dbStats,
        timestamp: new Date().toISOString()
    });
});

// Runtime configuration (no hardcoded frontend assumptions)
app.get('/api/config/public', (req, res) => {
    res.json(getPublicRuntimeConfig());
});

app.get('/api/config/runtime', requireAPIKey, (req, res) => {
    res.json(getRuntimeConfig());
});

// Auth & role endpoints (Phase 4)
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }
    const session = authenticateUser(username, password);
    if (!session) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json(session);
});

app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const session = verifySessionToken(token);
    if (!session) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user: session, roles: listRoles() });
});

app.get('/api/roles', (req, res) => {
    res.json({ roles: listRoles() });
});

app.get('/api/role/analyst/dashboard', requireRole(['analyst']), (req, res) => {
    const topic = req.query.topic || 'India';
    const intel = getRecentIntelligence(60, topic);
    const dashboard = getDashboardStats(intel);
    const messages = getSessionMessages(req.query.sessionId || '', 20);
    res.json({ role: 'analyst', dashboard, messages });
});

app.get('/api/role/policy/briefing', requireRole(['policy', 'strategic']), (req, res) => {
    const topic = req.query.topic || 'India';
    const report = generateReportNow(topic);
    res.json({ role: 'policy', report });
});

app.get('/api/role/strategic/ops', requireRole(['strategic']), (req, res) => {
    const topic = req.query.topic || 'India';
    const prediction = predictStrategicRisk(topic);
    res.json({ role: 'strategic', prediction });
});

// Debug endpoint - simple test
app.get('/api/test', (req, res) => {
    res.json({ message: 'test works', time: new Date().toISOString() });
});

// Test dashboard
app.get('/api/test-dashboard', (req, res) => {
    const dashboard = getDashboardStats([{ title: "India signs tech deal", description: "Positive news" }]);
    res.json(dashboard);
});

app.get('/api/predict-risk', (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        const prediction = predictStrategicRisk(topic);
        writeOperationalLog(topic, 'info', `Risk model executed: ${prediction.riskLevel}`);
        if (prediction.riskLevel === 'HIGH') {
            emitAlert({
                level: 'HIGH',
                topic,
                message: `High strategic risk detected for ${topic}`,
                at: new Date().toISOString()
            });
            writeOperationalLog(topic, 'warning', 'Critical alert emitted by risk model');
        }
        res.json(prediction);
    } catch (error) {
        writeOperationalLog(req.query.topic || 'GLOBAL', 'warning', `Risk prediction failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Phase 7: Live News by Country (100% free)
app.get('/api/news/country/:country', async(req, res) => {
    try {
        const country = req.params.country;
        const news = await getCountryNews(country);
        writeOperationalLog(country, 'info', `News feed refreshed (${news.count || 0} articles)`);
        res.json(news);
    } catch (error) {
        writeOperationalLog(req.params.country || 'GLOBAL', 'warning', `News fetch failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Phase 8: Country Intelligence — click a country → 5 headlines + AI risk assessment
app.get('/api/country-intel/:country', async(req, res) => {
    const country = req.params.country;
    const logCountry = normalizeCountryLabel(country);
    writeOperationalLog(logCountry, 'info', 'Intelligence deep-dive requested');

    try {
        // 1. Fetch recent headlines via existing news_fetcher
        const newsData = await getCountryNews(country);
        const headlines = (newsData.articles || []).slice(0, 5);

        if (headlines.length === 0) {
            return res.json({
                country,
                headlines: [],
                riskLevel: 'UNKNOWN',
                assessment: 'No recent news available to assess risk.',
                fetchedAt: new Date().toISOString(),
            });
        }

        // 2. Build a compact summary for the LLM
        const headlineSummary = headlines
            .map((h, i) => `${i + 1}. ${h.title}${h.description ? ' — ' + h.description.slice(0, 120) : ''}`)
            .join('\n');

        // 3. Send to Groq for risk analysis
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            return res.json({
                country,
                headlines,
                riskLevel: 'UNKNOWN',
                assessment: 'LLM key not configured — cannot generate risk assessment.',
                fetchedAt: new Date().toISOString(),
            });
        }

        const systemPrompt = `You are a senior geopolitical intelligence analyst for a state-level intelligence agency.
Given the following 5 most recent headlines about "${country}", perform a rapid risk assessment.

RESPOND STRICTLY in this JSON format (no markdown, no code fences):
{
  "riskLevel": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "assessment": "<2-3 sentence blunt intelligence assessment explaining WHY the risk is at this level>",
  "crisisDetected": true | false,
  "crisisType": "<if crisis detected: WAR / ECONOMIC / POLITICAL / HUMANITARIAN / CYBER / NONE>",
  "keyThreats": ["<threat 1>", "<threat 2>"]
}

THE HEADLINES:
${headlineSummary}`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Analyze now.' },
                ],
                max_tokens: 400,
                temperature: 0.3,
            }),
        });

        let riskLevel = 'UNKNOWN';
        let assessment = '';
        let crisisDetected = false;
        let crisisType = 'NONE';
        let keyThreats = [];

        if (groqRes.ok) {
            const groqData = await groqRes.json();
            const raw = groqData ? .choices ? .[0] ? .message ? .content || '';

            try {
                // Strip markdown fences if present
                const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                const parsed = JSON.parse(cleaned);
                riskLevel = parsed.riskLevel || 'UNKNOWN';
                assessment = parsed.assessment || '';
                crisisDetected = !!parsed.crisisDetected;
                crisisType = parsed.crisisType || 'NONE';
                keyThreats = Array.isArray(parsed.keyThreats) ? parsed.keyThreats : [];
            } catch (parseErr) {
                // LLM didn't return valid JSON — use raw text as assessment
                assessment = raw.slice(0, 500);
                riskLevel = 'MEDIUM';
            }
        } else {
            assessment = 'LLM rate-limited — displaying headlines only.';
        }

        writeOperationalLog(logCountry, crisisDetected ? 'warning' : 'success',
            `Intel assessed: ${riskLevel}${crisisDetected ? ' ⚠ CRISIS: ' + crisisType : ''}`);

        // Log alert threshold breaches
        const riskThresholds = { CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, UNKNOWN: 0 };
        const riskScore = riskThresholds[riskLevel] || 0;

        // Check for escalation (CRITICAL or HIGH with crisis)
        if (riskScore >= 75) {
            const severity = crisisDetected ? 'CRITICAL THRESHOLD' : 'HIGH RISK THRESHOLD';
            writeOperationalLog(logCountry, 'warning', `Alert threshold breached: ${severity} (${riskLevel}${crisisDetected ? ' + ' + crisisType + ' crisis' : ''})`);
        }

        // Validate response data
        if (!Array.isArray(keyThreats) || keyThreats.length === 0) {
            writeOperationalLog(logCountry, 'warning', 'Data validation: key threats list empty or invalid');
        }
        if (!assessment || assessment.length < 10) {
            writeOperationalLog(logCountry, 'warning', 'Data validation: assessment text too short or missing');
        }

        res.json({
            country,
            headlines,
            riskLevel,
            assessment,
            crisisDetected,
            crisisType,
            keyThreats,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        writeOperationalLog(logCountry, 'warning', `Intel deep-dive failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/news/supported', (req, res) => {
    try {
        const countries = getSupportedCountries();
        res.json({ countries });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Operational Logs by Country
app.get('/api/operational-logs/:country', (req, res) => {
    try {
        res.json(readOperationalLogs(req.params.country));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint
app.get('/api/debug/db', (req, res) => {
    try {
        const nodes = getAllNodes();
        const rels = getAllRelationships();
        res.json({ nodes: nodes.length, relationships: rels.length, sample: nodes.slice(0, 3) });
    } catch (e) {
        res.json({ error: e.message, stack: e.stack });
    }
});

// Intelligence analysis endpoint (RAG + multi-turn)
app.post('/api/analyze', async(req, res) => {
            const { system, messages, topic, sessionId = uuidv4() } = req.body;
            const logCountry = normalizeCountryLabel(topic || 'GLOBAL');

            if (!messages || !Array.isArray(messages)) {
                return res.status(400).json({ error: 'Invalid request: messages array required' });
            }

            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
            }

            try {
                const lastMsg = messages[messages.length - 1];
                const lastQuery = (lastMsg && lastMsg.content) || '';
                writeOperationalLog(logCountry, 'info', `Analysis initiated: "${lastQuery.substring(0, 52)}${lastQuery.length > 52 ? '...' : ''}"`);

                // Data validation: log query quality
                const queryQuality = lastQuery.length > 30 ? 'GOOD' : 'SHORT';
                writeOperationalLog(logCountry, 'info', `Query validation: ${queryQuality} (${lastQuery.length} chars)`); // Retrieve relevant chunks from vector store using Gemini Embeddings
                const relevantContextChunks = await findSimilarChunks(lastQuery, 3);
                const dynamicContext = relevantContextChunks.join('\n\n');

                // Get dynamic graph data for context
                const graphData = getFullGraph();

                // Get recent intelligence to inject fresh data
                const recentIntel = getRecentIntelligence(10);
                const recentIntelText = recentIntel.map(a => `- ${a.title}: ${a.description}`).join('\\n');

                const enrichedSystem = `${system || ''}\n\n--- KNOWLEDGE BASE ---\n${dynamicContext}\n\n--- LIVE INTELLIGENCE FEED ---\n${recentIntelText}\n--- END KNOWLEDGE BASE ---\n\n--- INTELLIGENCE GRAPH ---\nNodes: ${graphData.nodes.map(n => `${n.id} (${n.type})`).join(', ')}\nRelationships: ${graphData.links.map(l => `${l.from} --[${l.label}]--> ${l.to}`).join(', ')}\n--- END GRAPH ---\n\nINSTRUCTIONS:\n1. Use the provided KNOWLEDGE BASE and LIVE INTELLIGENCE FEED to answer the query.\n2. If the provided data does not fully cover the answer, seamlessly use your pre-trained knowledge to provide a comprehensive, confident, and professional intelligence assessment.\n3. Never say you don't know or that data is insufficient. Always provide a highly analytical and plausible response that fits the tone of a strategic intelligence engine.\n4. IMPORTANT: After your main response and the [NODES: ...] tag, you MUST include these two additional blocks:\n\n[FOLLOWUPS]\n- A follow-up question that digs deeper into a specific finding from your response\n- A follow-up question exploring a related geopolitical angle not covered in your response\n- A follow-up question about countermeasures or policy options India could take\n[/FOLLOWUPS]\n\n[WHATIF]\n- label: Short 3-5 word title | q: A what-if scenario question that stress-tests the situation (e.g. "What if X gets 2x worse?")\n- label: Short 3-5 word title | q: A what-if scenario exploring an alternate chain of events\n- label: Short 3-5 word title | q: A best-case vs worst-case what-if analysis question\n[/WHATIF]\n\nMake ALL follow-ups and what-if scenarios SPECIFIC to the user query and your response. Never use generic/boilerplate questions. Reference actual entities, numbers, and findings from your analysis.`;

        const groqMessages = [
            { role: 'system', content: enrichedSystem },
            ...messages
        ];

        const fetchGroq = async(retries = 2) => {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: groqMessages,
                    max_tokens: 1800,
                    temperature: 0.7,
                }),
            });

            if (response.status === 429 && retries > 0) {
                const retryAfter = parseInt(response.headers.get('retry-after') || '3', 10);
                console.log(`[RATE LIMITED] Retrying in ${retryAfter}s... (${retries} retries left)`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                return fetchGroq(retries - 1);
            }
            return response;
        };

        const response = await fetchGroq();

        if (!response.ok) {
            const err = await response.text();
            console.error(`[GROQ ERROR] ${response.status}: ${err}`);
            return res.status(response.status).json({ error: `Groq API error: ${response.status}` });
        }

        const data = await response.json();
        let text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'No response generated.';

        // Extract [NODES: ...] tag from LLM response
        let relevantNodes = [];
        const nodesMatch = text.match(/\[NODES:\s*([^\]]+)\]/);
        if (nodesMatch) {
            relevantNodes = nodesMatch[1].split(',').map(n => n.trim()).filter(n => n.length > 0);
            text = text.replace(/\[NODES:\s*[^\]]+\]/, '').trim();
        }

        // Extract AI-generated follow-up questions from [FOLLOWUPS]...[/FOLLOWUPS]
        let suggestions = [];
        const followupMatch = text.match(/\[FOLLOWUPS\]([\s\S]*?)\[\/FOLLOWUPS\]/);
        if (followupMatch) {
            suggestions = followupMatch[1]
                .split('\n')
                .map(line => line.replace(/^\s*-\s*/, '').trim())
                .filter(line => line.length > 10);
            text = text.replace(/\[FOLLOWUPS\][\s\S]*?\[\/FOLLOWUPS\]/, '').trim();
        }
        if (suggestions.length === 0) {
            suggestions = generateFollowUps(lastQuery);
        }

        // Extract AI-generated what-if scenarios from [WHATIF]...[/WHATIF]
        let whatIfScenarios = [];
        const whatifMatch = text.match(/\[WHATIF\]([\s\S]*?)\[\/WHATIF\]/);
        if (whatifMatch) {
            whatIfScenarios = whatifMatch[1]
                .split('\n')
                .map(line => line.replace(/^\s*-\s*/, '').trim())
                .filter(line => line.includes('|'))
                .map(line => {
                    const parts = line.split('|').map(p => p.trim());
                    const labelPart = parts.find(p => p.toLowerCase().startsWith('label:'));
                    const qPart = parts.find(p => p.toLowerCase().startsWith('q:'));
                    return {
                        label: labelPart ? labelPart.replace(/^label:\s*/i, '').trim() : 'Scenario',
                        q: qPart ? qPart.replace(/^q:\s*/i, '').trim() : line
                    };
                })
                .filter(s => s.q.length > 10);
            text = text.replace(/\[WHATIF\][\s\S]*?\[\/WHATIF\]/, '').trim();
        }
        if (whatIfScenarios.length === 0) {
            whatIfScenarios = generateWhatIfScenarios(lastQuery);
        }

        const query = lastQuery.substring(0, 80);
        console.log(`[ANALYSIS COMPLETE] "${query}..." — Session: ${sessionId}`);
        
        // Log response quality for data validation
        const responseQuality = text && text.length > 200 ? 'HIGH' : 'LOW';
        writeOperationalLog(logCountry, 'success', `Analysis completed (session: ${sessionId.slice(0, 8)}, response quality: ${responseQuality})`);

        res.json({ text, model: data.model, usage: data.usage, suggestions, whatIfScenarios, relevantNodes, sessionId });
    } catch (error) {
        console.error('[SERVER ERROR]', error.message);
        writeOperationalLog(logCountry, 'warning', `Analysis failed: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== INTELLIGENCE API ENDPOINTS ====================

// Fetch comprehensive real-time intelligence (supports any topic)
app.get('/api/intelligence', async (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        const intel = await fetchAllIntelligence(topic);
        
        // Add analysis to the response
        const analyzed = analyzeNewsBatch(intel.news || []);
        res.json({
            ...intel,
            articles: analyzed.articles,
            analysis: analyzed.stats
        });
    } catch (error) {
        console.error('[INTEL ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Intelligence Dashboard - Categorized, Sentiment, Alerts
app.get('/api/intelligence/dashboard', async (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        const { autoEnrich } = req.query;
        
        const intel = await fetchAllIntelligence(topic);
        
        // Auto-enrich graph if requested
        let enrichmentResult = null;
        if (autoEnrich === 'true') {
            const existingNodes = getAllNodes();
            const enrichment = enrichGraphFromNews(intel.news || [], existingNodes);
            
            // Add new nodes
            for (const node of enrichment.newNodes) {
                try {
                    const exists = getAllNodes().find(n => n.id.toLowerCase() === node.id.toLowerCase());
                    if (!exists) {
                        addNode(node.id, node.type, node.description);
                    }
                } catch (e) {}
            }
            enrichmentResult = { newNodes: enrichment.newNodes.length, newRels: enrichment.newRelationships.length };
        }
        
        const dashboard = getDashboardStats(intel.news || []);
        
        // Phase 6: Source Fusion Analysis
        const sourceFusion = analyzeSourceFusion(intel.news || []);
        
        res.json({ 
            ...dashboard, 
            graphEnrichment: enrichmentResult,
            sourceFusion: sourceFusion
        });
    } catch (error) {
        console.error('[DASHBOARD ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get critical alerts
app.get('/api/alerts', async (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        const intel = await fetchAllIntelligence(topic);
        
        const alerts = getDashboardStats(intel.news || []).alerts;
        
        res.json({ alerts, count: alerts.length, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[ALERTS ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==================== GRAPH ENRICHMENT ====================

// Auto-enrich graph from news (auto-detect new entities)
app.get('/api/graph/enrich', async (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        console.log('[GRAPH ENRICHMENT] Starting auto-enrichment for:', topic);
        
        // Get current intelligence
        const intel = await fetchAllIntelligence(topic);
        
        // Get existing nodes
        const existingNodes = getAllNodes();
        
        // Analyze and find new entities
        const enrichment = enrichGraphFromNews(intel.news || [], existingNodes);
        
        // Add new nodes to graph
        const addedNodes = [];
        const nodeConfidenceScores = [];
        for (const node of enrichment.newNodes) {
            try {
                const existing = getAllNodes().find(n => n.id.toLowerCase() === node.id.toLowerCase());
                if (!existing) {
                    addNode(node.id, node.type, node.description);
                    addedNodes.push(node.id);
                    
                    // Calculate confidence score based on type and description quality
                    const confidence = node.description && node.description.length > 50 ? 'HIGH' : 'MEDIUM';
                    nodeConfidenceScores.push({ entity: node.id, type: node.type, confidence });
                    
                    // Log entity confidence event
                    writeOperationalLog(topic, 'info', `Entity added: ${node.id} (${node.type}) [${confidence} confidence]`);
                    console.log('[GRAPH] Added node:', node.id);
                }
            } catch (e) {
                console.error('[GRAPH] Error adding node:', e.message);
                writeOperationalLog(topic, 'warning', `Node validation failed: ${e.message}`);
            }
        }
        
        // Add new relationships
        const addedRels = [];
        const allNodes = getAllNodes().map(n => n.id);
        for (const rel of enrichment.newRelationships) {
            try {
                if (allNodes.includes(rel.from) && allNodes.includes(rel.to)) {
                    addRelationship(rel.from, rel.to, rel.label, rel.strength);
                    addedRels.push(`${rel.from} → ${rel.to}`);
                } else {
                    // Data validation event: relationship endpoints don't exist
                    writeOperationalLog(topic, 'warning', `Relationship validation failed: ${rel.from} or ${rel.to} not in graph`);
                }
            } catch (e) {
                console.error('[GRAPH] Error adding relationship:', e.message);
                writeOperationalLog(topic, 'warning', `Relationship validation error: ${e.message}`);
            }
        }
        
        // Log graph enrichment summary
        if (addedNodes.length > 0 || addedRels.length > 0) {
            writeOperationalLog(topic, 'success', `Graph enrichment completed: +${addedNodes.length} entities, +${addedRels.length} relationships`);
        }
        
        res.json({
            success: true,
            newNodes: addedNodes,
            newRelationships: addedRels,
            totalNewsAnalyzed: intel.news?.length || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[GRAPH ENRICHMENT ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Search specific intelligence
app.get('/api/intelligence/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        const results = await searchIntelligence(q);
        res.json({ results, count: results.length, query: q });
    } catch (error) {
        console.error('[INTEL SEARCH ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get economic dashboard with World Bank indicators
app.get('/api/economy', async (req, res) => {
    try {
        const country = req.query.country || 'IND';
        const dashboard = await getEconomicDashboard(country);
        res.json(dashboard);
    } catch (error) {
        console.error('[ECONOMY ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==================== MARKET STRESS (FREE YAHOO FINANCE) ====================

app.get('/api/market/stress', async (req, res) => {
    const topic = req.query.topic || 'India';
    const symbols = [
        { id: 'india', label: 'NIFTY 50', symbol: '^NSEI' },
        { id: 'us', label: 'S&P 500', symbol: '^GSPC' },
        { id: 'oil', label: 'Brent Crude', symbol: 'BZ=F' },
        { id: 'gold', label: 'Gold', symbol: 'GC=F' }
    ];

    try {
        const settled = await Promise.allSettled(symbols.map((s) => fetchYahooSeries(s.symbol)));
        const drivers = settled
            .map((result, idx) => {
                if (result.status !== 'fulfilled') return null;
                return {
                    id: symbols[idx].id,
                    label: symbols[idx].label,
                    symbol: symbols[idx].symbol,
                    last: result.value.last,
                    changePct: result.value.changePct,
                    series: result.value.series
                };
            })
            .filter(Boolean);

        if (!drivers.length) {
            return res.status(502).json({ error: 'Market feeds unavailable right now' });
        }

        const { stressScore, stressLevel } = calculateStressFromDrivers(drivers);
        writeOperationalLog(topic, 'info', `Market stress updated: ${stressLevel} (${stressScore})`);

        res.json({
            topic,
            source: 'Yahoo Finance (free public endpoints)',
            asOf: new Date().toISOString(),
            stressScore,
            stressLevel,
            drivers
        });
    } catch (error) {
        writeOperationalLog(topic, 'warning', `Market stress fetch failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CLIMATE ENDPOINTS (100% FREE APIs) ====================

app.get('/api/climate/data', async (req, res) => {
    try {
        const country = req.query.country || 'India';
        const data = await fetchClimateData(country);
        writeOperationalLog(country, 'info', `Climate data refreshed (${data?.source || 'Open-Meteo'})`);
        res.json({ country, source: 'open-meteo', data });
    } catch (error) {
        writeOperationalLog(req.query.country || 'GLOBAL', 'warning', `Climate data fetch failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/climate/events', async (req, res) => {
    try {
        const region = req.query.region || 'global';
        const limit = parseInt(req.query.limit || '20', 10);
        const events = await fetchClimateEvents(region, limit);
        res.json({ region, count: events.length, events, source: 'gdelt' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/climate/risk-score', async (req, res) => {
    try {
        const country = req.query.country || 'India';
        const risk = await calculateClimateRiskScore(country);
        writeOperationalLog(country, 'info', `Climate risk updated: ${risk.level} (${risk.score})`);
        res.json(risk);
    } catch (error) {
        writeOperationalLog(req.query.country || 'GLOBAL', 'warning', `Climate risk failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/climate/agri-impact', async (req, res) => {
    try {
        const country = req.query.country || 'India';
        const impact = await assessAgriculturalImpact(country);
        res.json(impact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/climate/policies', async (req, res) => {
    try {
        const country = req.query.country || 'India';
        const policies = await fetchEnvironmentalPolicies(country);
        res.json({ country, count: policies.length, policies, source: 'gdelt' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== KNOWLEDGE BASE ENDPOINTS ====================

// Auto-update knowledge base with latest intelligence
app.post('/api/kb/update', async (req, res) => {
    try {
        const { topic } = req.body;
        const result = await autoUpdateKnowledgeBase(topic);
        writeOperationalLog(topic || 'GLOBAL', 'success', 'Knowledge base updated with latest intelligence');
        res.json(result);
    } catch (error) {
        console.error('[KB UPDATE ERROR]:', error.message);
        writeOperationalLog(req.body?.topic || 'GLOBAL', 'warning', `Knowledge base update failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Get all entities
app.get('/api/entities', (req, res) => {
    const nodes = getAllNodes();
    const relationships = getAllRelationships();
    res.json({ nodes, relationships, count: { nodes: nodes.length, relationships: relationships.length } });
});

// Get entity nodes only
app.get('/api/entities/nodes', (req, res) => {
    const nodes = getAllNodes();
    res.json({ nodes, count: nodes.length });
});

// Get relationships only
app.get('/api/entities/relationships', (req, res) => {
    const relationships = getAllRelationships();
    res.json({ relationships, count: relationships.length });
});

// Search entities
app.get('/api/entities/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const results = searchEntities(q);
    res.json(results);
});

// ==================== GRAPH ENDPOINTS ====================

// Get full graph data (nodes + relationships)
app.get('/api/graph', (req, res) => {
    const nodes = getAllNodes();
    const relationships = getAllRelationships();
    const graph = {
        nodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            description: n.description,
            color: n.color,
            size: n.size
        })),
        links: relationships.map(r => ({
            source: r.source,
            target: r.target,
            label: r.label,
            strength: r.strength
        }))
    };
    res.json({
        ...graph,
        stats: {
            totalNodes: graph.nodes.length,
            totalLinks: graph.links.length,
            nodeTypes: [...new Set(graph.nodes.map(n => n.type))]
        }
    });
});

// ==================== MARKOV RISK PROPAGATION ====================

// Get risk propagation scores (like PageRank)
app.get('/api/markov-risk', (req, res) => {
    try {
        const riskScores = calculateRiskPropagation(50, 0.85);
        
        res.json({
            model: "Markov Chain (PageRank-style)",
            iterations: 50,
            dampingFactor: 0.85,
            scores: riskScores,
            highestRisk: riskScores[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[RISK ERROR]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Add new graph node
app.post('/api/graph/nodes', (req, res) => {
    try {
        const { id, type, description, color, size } = req.body;
        if (!id || !type) {
            return res.status(400).json({ error: 'id and type are required' });
        }
        const node = addNode(id, type, description, color, size);
        res.json({ success: true, node });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new graph relationship
app.post('/api/graph/relationships', (req, res) => {
    try {
        const { from, to, label, strength } = req.body;
        if (!from || !to) {
            return res.status(400).json({ error: 'from and to are required' });
        }
        const rel = addRelationship(from, to, label, strength);
        res.json({ success: true, relationship: rel });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== CACHE ENDPOINTS ====================

// Get cache statistics
app.get('/api/cache/stats', (req, res) => {
    res.json(getCacheStats());
});

// Clear all cache
app.post('/api/cache/clear', (req, res) => {
    clearAllCache();
    res.json({ status: 'cleared' });
});

// Clear cache for specific topic
app.post('/api/cache/clear/:topic', (req, res) => {
    const { topic } = req.params;
    clearTopicCache(topic);
    res.json({ status: 'cleared', topic });
});

// ==================== DATABASE STATS ====================

app.get('/api/stats', (req, res) => {
    const stats = getStats();
    res.json(stats);
});

// ==================== SENTIMENT ANALYSIS ====================

app.post('/api/sentiment/analyze', (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        const sentiment = analyzeSentiment(text);
        res.json({ sentiment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sentiment/trend', async (req, res) => {
    try {
        const { entity } = req.query;
        if (!entity) {
            return res.status(400).json({ error: 'entity is required' });
        }
        const trend = await trackSentimentTrend(entity);
        res.json(trend);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== WEB CRAWLER ====================

// Initialize crawler
app.post('/api/crawler/initialize', async (req, res) => {
    try {
        const { domain = 'all' } = req.body;
        const count = await initializeCrawler(domain);
        res.json({ success: true, seedUrlsCount: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run crawl session
app.post('/api/crawler/run', async (req, res) => {
    try {
        const { maxPages = 20, domain = 'all' } = req.body;
        const result = await runCrawlSession(maxPages, domain);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get crawler status
app.get('/api/crawler/status', (req, res) => {
    try {
        const status = getCrawlerStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search crawled content
app.get('/api/crawler/search', (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        const results = searchCrawledContent(q, parseInt(limit));
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get crawled content by domain
app.get('/api/crawler/domain/:domain', (req, res) => {
    try {
        const { domain } = req.params;
        const results = getCrawledContentByDomain(domain);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear crawler data
app.post('/api/crawler/clear', (req, res) => {
    try {
        const crawler = getCrawler();
        crawler.clear();
        res.json({ success: true, message: 'Crawler data cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get backup list
app.get('/api/db/backups', (req, res) => {
    try {
        const backups = listBackups();
        res.json({ backups });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create backup
app.post('/api/db/backup', (req, res) => {
    try {
        const { description } = req.body;
        const result = createBackup(description || 'Manual backup');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restore backup
app.post('/api/db/restore', (req, res) => {
    try {
        const { backupFile } = req.body;
        if (!backupFile) {
            return res.status(400).json({ error: 'backupFile is required' });
        }
        const result = restoreBackup(backupFile);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete backup
app.delete('/api/db/backup/:file', (req, res) => {
    try {
        const { file } = req.params;
        const backupPath = path.join(process.cwd(), 'backups', file);
        const result = deleteBackup(backupPath);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cleanup old backups
app.post('/api/db/cleanup', (req, res) => {
    try {
        const { daysToKeep = 7 } = req.body;
        const result = cleanupOldBackups(parseInt(daysToKeep));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get migration status
app.get('/api/db/migrations', (req, res) => {
    try {
        const applied = getAppliedMigrations(db);
        res.json({ migrations: applied });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== INTELLIGENCE STORE ====================

app.get('/api/intelligence/stored', (req, res) => {
    const { limit = 50, topic } = req.query;
    const intel = getRecentIntelligence(parseInt(limit), topic);
    res.json({ articles: intel, count: intel.length });
});

// ==================== FACTS ====================

app.get('/api/facts', (req, res) => {
    const { confidence } = req.query;
    const facts = getFacts(confidence);
    res.json({ facts, count: facts.length });
});

// ==================== PDF EXPORT ====================

app.get('/api/export/pdf', (req, res) => {
    const { query, response: analysis, topic } = req.query;
    
    const doc = new PDFDocument({ 
        size: 'A4',
        margin: 50,
        info: {
            Title: 'INDRA Strategic Intelligence Briefing',
            Author: 'INDRA Global Ontology Engine',
            Subject: 'Strategic Analysis'
        }
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=INDRA_Briefing_${new Date().toISOString().slice(0,10)}.pdf`);
    
    doc.pipe(res);
    
    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#DE2910');
    doc.fillColor('white')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('INDRA', 50, 25, { align: 'center' })
       .fontSize(12)
       .font('Helvetica')
       .text('GLOBAL ONTOLOGY ENGINE - STRATEGIC INTELLIGENCE BRIEFING', { align: 'center' });
    
    // Classification
    doc.moveDown(2);
    doc.fillColor('#DE2910')
       .fontSize(10)
       .text('CLASSIFICATION: TOP SECRET // NOFORN', { align: 'center' });
    
    // Metadata
    doc.moveDown();
    doc.fillColor('black')
       .fontSize(10)
       .text(`Date: ${new Date().toLocaleString()}`, { align: 'right' })
       .text(`Topic: ${topic || 'India'}`, { align: 'right' });
    
    if (query) {
        doc.moveDown();
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('QUERY:', 50, doc.y)
           .font('Helvetica')
           .fontSize(10)
           .text(query);
    }
    
    doc.moveDown();
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();
    
    if (analysis) {
        doc.moveDown();
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('ANALYSIS:', 50, doc.y);
        
        doc.moveDown(0.5);
        doc.font('Helvetica')
           .fontSize(10)
           .text(analysis.replace(/\n/g, '\n'), { 
               align: 'left',
               lineGap: 4
           });
    }
    
    // Footer
    doc.end();
});

// ==================== EXTERNAL API ACCESS ====================

// External API key validation
app.post('/api/auth/validate', (req, res) => {
    const { apiKey } = req.body;
    if (apiKey === API_KEY) {
        res.json({ valid: true, message: 'API key validated' });
    } else {
        res.status(401).json({ valid: false, message: 'Invalid API key' });
    }
});

// ==================== FOLLOW-UP SUGGESTIONS ====================

function generateFollowUps(query) {
    const q = query.toLowerCase();
    const suggestions = [];
    
    if (q.includes('china')) 
        suggestions.push("What are India's options to reduce the $85B trade deficit with China?");
    if (q.includes('semiconductor') || q.includes('chip')) 
        suggestions.push("Timeline and feasibility of India's semiconductor self-reliance by 2030?");
    if (q.includes('defense') || q.includes('military')) 
        suggestions.push("Compare India's defense modernization with China's PLA reforms.");
    if (q.includes('energy') || q.includes('oil')) 
        suggestions.push("Impact of Russia sanctions on India's energy security strategy?");
    if (q.includes('taiwan'))
        suggestions.push("What would a Taiwan conflict mean for India's supply chains?");
    if (q.includes('usa') || q.includes('united states'))
        suggestions.push("How can India leverage QUAD partnership for strategic advantage?");
    if (q.includes('russia'))
        suggestions.push("Analyze India's defense dependency on Russia amid Ukraine conflict.");
    if (q.includes('climate') || q.includes('monsoon'))
        suggestions.push("Climate risk assessment for India's agricultural sector in 2024-2030.");
    if (q.includes('risk') || q.includes('vulnerab'))
        suggestions.push("Rank India's top 5 strategic vulnerabilities by severity.");
    if (q.includes('economy') || q.includes('gdp'))
        suggestions.push("India's path to $7T economy by 2030: Key growth drivers.");
    if (suggestions.length === 0)
        suggestions.push("What are the second-order effects of this scenario?");
    
    return suggestions.slice(0, 3);
}

function generateWhatIfScenarios(query) {
    const q = (query || '').toLowerCase();
    const scenarios = [];

    if (q.includes('oil') || q.includes('energy') || q.includes('gas')) {
        scenarios.push({
            label: 'Oil Shock Stress Test',
            q: 'What if global oil prices jump 25% in 30 days? Assess cascading impact on India inflation, current account, and fiscal stability.'
        });
        scenarios.push({
            label: 'Supply Route Disruption',
            q: 'What if a key maritime chokepoint is disrupted for 2 weeks? Evaluate India\'s energy security and response options.'
        });
    }

    if (q.includes('china') || q.includes('taiwan') || q.includes('trade') || q.includes('semiconductor') || q.includes('chip')) {
        scenarios.push({
            label: 'Semiconductor Blockade',
            q: 'What if Taiwan semiconductor exports fall 40% for one quarter? Quantify India\'s sector-wise impact and mitigation path.'
        });
        scenarios.push({
            label: 'Trade Retaliation Spiral',
            q: 'What if China imposes targeted export controls on strategic inputs? Model first- and second-order effects on India.'
        });
    }

    if (q.includes('defense') || q.includes('military') || q.includes('border') || q.includes('war')) {
        scenarios.push({
            label: 'Border Escalation 72h',
            q: 'What if a 72-hour border escalation occurs? Map likely diplomatic, economic, and defense ripple effects for India.'
        });
        scenarios.push({
            label: 'Sanctions Blowback',
            q: 'What if a major defense supplier faces sudden sanctions? Assess India\'s readiness and diversification gaps.'
        });
    }

    if (q.includes('climate') || q.includes('monsoon') || q.includes('heat') || q.includes('agri')) {
        scenarios.push({
            label: 'Monsoon Failure Scenario',
            q: 'What if monsoon deficiency is 20% below normal this year? Evaluate food inflation, rural demand, and policy response.'
        });
        scenarios.push({
            label: 'Heatwave Supply Shock',
            q: 'What if extreme heat cuts labor productivity and power reliability for 45 days? Estimate macro and sectoral risks.'
        });
    }

    if (scenarios.length === 0) {
        scenarios.push({
            label: 'Second-Order Effects',
            q: `What if this scenario intensifies by 2x over the next 90 days? Identify second-order effects for India and priority countermeasures.`
        });
        scenarios.push({
            label: 'Best vs Worst Case',
            q: `What are the best-case, base-case, and worst-case trajectories for this topic over the next 6 months?`
        });
        scenarios.push({
            label: 'Strategic Hedge Plan',
            q: `What strategic hedges should India execute immediately for this risk theme? Rank by impact and feasibility.`
        });
    }

    return scenarios.slice(0, 3);
}

// ==================== REALTIME STATUS ====================

app.get('/api/realtime/status', (req, res) => {
    const cfg = getRuntimeConfig();
    res.json({
        enabled: cfg.realtime.enabled,
        reportsEveryMinutes: cfg.realtime.reportsEveryMinutes,
        timestamp: new Date().toISOString()
    });
});

// ==================== SERVER STARTUP ====================

server.listen(PORT, async () => {
    runMigrations();
    initAuth();
    createBackup('Server startup');
    startAutoBackup(24);

    const cfg = getRuntimeConfig();
    if (cfg.realtime.enabled) {
        initRealtime(server, { corsOrigin: process.env.CORS_ORIGIN || '*' });
        startScheduledReports(cfg.realtime.reportsEveryMinutes, process.env.DEFAULT_TOPIC || 'India');
    }

    console.log(`\n  ╔══════════════════════════════════════════════════════════╗`);
    console.log(`  ║  INDRA GLOBAL ONTOLOGY ENGINE v3.2                      ║`);
    console.log(`  ║  Port: ${PORT}                                             ║`);
    console.log(`  ║  Status: OPERATIONAL                                    ║`);
    console.log(`  ║  Model: Llama 3.3 70B (Groq)                          ║`);
    console.log(`  ║  RAG: Gemini v2 Embeddings                            ║`);
    console.log(`  ║  Intelligence: RSS + Currents + GDELT + World Bank   ║`);
    console.log(`  ║  Database: SQLite (Persistent)                         ║`);
    console.log(`  ║  Caching: ENABLED (5-min TTL)                         ║`);
    console.log(`  ║  PDF Export: ENABLED                                   ║`);
    console.log(`  ║  External API: ENABLED                                 ║`);
    console.log(`  ║  News Analysis: ENABLED                                ║`);
    console.log(`  ║  Realtime Alerts: ${cfg.realtime.enabled ? 'ENABLED ' : 'DISABLED'}                               ║`);
    console.log(`  ╚══════════════════════════════════════════════════════════╝\n`);
    
    await initializeVectorStore();
    
    console.log('[INIT] INDRA Engine v3.2 initialized and ready');
});