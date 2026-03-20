import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { initializeVectorStore, findSimilarChunks } from './rag.js';
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
    getExtractedEntities, 
    searchEntities,
    getIntelligence,
    getFacts
} from './kb_updater.js';
import { 
    getStats, 
    getFullGraph,
    getRecentIntelligence,
    getAllNodes,
    getAllRelationships,
    addNode,
    addRelationship,
    addMessage,
    getSessionMessages
} from './database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'indra-internal-key';

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

// Debug endpoint - simple test
app.get('/api/test', (req, res) => {
    res.json({ message: 'test works', time: new Date().toISOString() });
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
    const { system, messages, sessionId = uuidv4(), topic = 'India' } = req.body;

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
        
        // Retrieve relevant chunks from vector store using Gemini Embeddings
        const relevantContextChunks = await findSimilarChunks(lastQuery, 3);
        const dynamicContext = relevantContextChunks.join('\n\n');

        // Get dynamic graph data for context
        const graphData = getFullGraph();

        const enrichedSystem = `${system || ''}\n\n--- KNOWLEDGE BASE ---\n${dynamicContext}\n--- END KNOWLEDGE BASE ---\n\n--- INTELLIGENCE GRAPH ---\nNodes: ${graphData.nodes.map(n => `${n.id} (${n.type})`).join(', ')}\nRelationships: ${graphData.links.map(l => `${l.from} --[${l.label}]--> ${l.to}`).join(', ')}\n--- END GRAPH ---\n\nAlways cite specific numbers and facts from the knowledge base when relevant.`;

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
                    max_tokens: 1200,
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

        // Generate follow-up suggestions
        const suggestions = generateFollowUps(lastQuery);

        const query = lastQuery.substring(0, 80);
        console.log(`[ANALYSIS COMPLETE] "${query}..." — Session: ${sessionId}`);

        res.json({ text, model: data.model, usage: data.usage, suggestions, relevantNodes, sessionId });
    } catch (error) {
        console.error('[SERVER ERROR]', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== INTELLIGENCE API ENDPOINTS ====================

// Fetch comprehensive real-time intelligence (supports any topic)
app.get('/api/intelligence', async (req, res) => {
    try {
        const topic = req.query.topic || 'India';
        const intel = await fetchAllIntelligence(topic);
        res.json(intel);
    } catch (error) {
        console.error('[INTEL ERROR]:', error.message);
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

// ==================== KNOWLEDGE BASE ENDPOINTS ====================

// Auto-update knowledge base with latest intelligence
app.post('/api/kb/update', async (req, res) => {
    try {
        const { topic } = req.body;
        const result = await autoUpdateKnowledgeBase(topic);
        res.json(result);
    } catch (error) {
        console.error('[KB UPDATE ERROR]:', error.message);
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

// ==================== SERVER STARTUP ====================

app.listen(PORT, async () => {
    console.log(`\n  ╔══════════════════════════════════════════════════════════╗`);
    console.log(`  ║  INDRA GLOBAL ONTOLOGY ENGINE v3.2                      ║`);
    console.log(`  ║  Port: ${PORT}                                             ║`);
    console.log(`  ║  Status: OPERATIONAL                                    ║`);
    console.log(`  ║  Model: Llama 3.3 70B (Groq)                          ║`);
    console.log(`  ║  RAG: Gemini v2 Embeddings                            ║`);
    console.log(`  ║  Intelligence: RSS + Currents + GDELT + World Bank   ║`);
    console.log(`  ║  Database: SQLite (Persistent)                        ║`);
    console.log(`  ║  Caching: ENABLED (5-min TTL)                         ║`);
    console.log(`  ║  PDF Export: ENABLED                                   ║`);
    console.log(`  ║  External API: ENABLED                                 ║`);
    console.log(`  ╚══════════════════════════════════════════════════════════╝\n`);
    
    await initializeVectorStore();
    
    console.log('[INIT] INDRA Engine v3.2 initialized and ready');
});
