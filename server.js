import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// STRATEGIC KNOWLEDGE BASE (RAG-lite Context Injection)
// ═══════════════════════════════════════════════════════════════
const KNOWLEDGE_BASE = `
## CLASSIFIED STRATEGIC INTELLIGENCE CONTEXT — INDIA

### ECONOMIC INTELLIGENCE
- India GDP (2024): $3.94 trillion (5th largest). Projected $7T by 2030.
- Trade deficit with China: $85B (2023-24). Primary imports: electronics, machinery, chemicals.
- India-US bilateral trade: $128B. QUAD alliance strengthening tech cooperation.
- UPI transactions: 12B+ monthly. $2T annual throughput. Exported to Singapore, UAE, France.
- Remittances: $125B annually. Top source: UAE ($15B), US ($13B), Saudi Arabia ($7B).

### DEFENSE & SECURITY
- Defense budget FY2024: ₹6.21 lakh crore ($74.7B). 13.04% of central budget.
- Russia supplies 60% of India's defense equipment. Diversifying towards US, France, Israel.
- LAC confrontation: 65,000+ troops deployed. Galwan incident (2020) shifted dynamics permanently.
- Agni-V MIRV tested (2024). INS Arighat nuclear submarine commissioned.
- Make in India defense: Target 70% indigenous by 2030. Tejas Mk2, AMCA in development.

### TECHNOLOGY & SUPPLY CHAIN
- Semiconductor dependency: 100% import. India Semiconductor Mission: $10B allocation.
- TSMC, Samsung, Micron setting up fabs in Gujarat. First chips expected 2026-2027.
- Rare earth dependency on China: 70%+. Deep sea mining exploration initiated.
- ISRO: Chandrayaan-3 success. Gaganyaan human spaceflight by 2025.

### ENERGY SECURITY
- Oil imports: 85% dependent. Russia now #1 supplier (2024) surpassing Saudi Arabia.
- Solar capacity: 73GW installed. Target 500GW renewable by 2030.
- Strategic Petroleum Reserve: 5.33 MT (10 days cover). Expanding to 6.5 MT.

### GEOPOLITICAL RISK FACTORS
- Taiwan contingency: Semiconductor supply disruption could cost India $30B annually.
- Middle East instability: Threatens remittances ($125B), energy supply, and 8.5M diaspora.
- Climate risk: 2023 recorded highest monsoon variability. Agricultural losses: Rs 1.6 lakh crore.
`;

// Multi-turn conversation memory (per-session, in-memory)
const conversationHistory = new Map();

// Request logger
app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${req.ip}`);
    }
    next();
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OPERATIONAL', engine: 'INDRA', timestamp: new Date().toISOString() });
});

// Intelligence analysis endpoint (RAG + multi-turn)
app.post('/api/analyze', async(req, res) => {
    const { system, messages, sessionId = 'default' } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    }

    try {
        const enrichedSystem = `${system || ''}\n\n--- STRATEGIC KNOWLEDGE BASE (USE AS PRIMARY REFERENCE) ---\n${KNOWLEDGE_BASE}\n--- END KNOWLEDGE BASE ---\n\nAlways cite specific numbers and facts from the knowledge base when relevant.`;

        const history = conversationHistory.get(sessionId) || [];
        const groqMessages = [
            { role: 'system', content: enrichedSystem },
            ...history.slice(-6),
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

        // Store conversation history
        const updatedHistory = [...history, ...messages, { role: 'assistant', content: text }];
        conversationHistory.set(sessionId, updatedHistory.slice(-10));

        // Generate follow-up suggestions
        const lastMsg = messages[messages.length - 1];
        const lastQuery = (lastMsg && lastMsg.content) || '';
        const suggestions = generateFollowUps(lastQuery);

        const query = lastQuery.substring(0, 80);
        console.log(`[ANALYSIS COMPLETE] "${query}..." — ${text.length} chars — Session: ${sessionId}`);

        res.json({ text, model: data.model, usage: data.usage, suggestions, relevantNodes });
    } catch (error) {
        console.error('[SERVER ERROR]', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Clear conversation history
app.post('/api/clear-history', (req, res) => {
    const { sessionId = 'default' } = req.body;
    conversationHistory.delete(sessionId);
    res.json({ status: 'cleared' });
});

function generateFollowUps(query) {
    const q = query.toLowerCase();
    const suggestions = [];
    if (q.includes('china') || q.includes('trade'))
        suggestions.push("What are India's options to reduce the $85B trade deficit?");
    if (q.includes('semiconductor') || q.includes('chip'))
        suggestions.push("Timeline and feasibility of India's semiconductor self-reliance?");
    if (q.includes('defense') || q.includes('military'))
        suggestions.push("Compare India's defense modernization with China's PLA reforms.");
    if (q.includes('energy') || q.includes('oil'))
        suggestions.push("Impact of Russia sanctions on India's energy security strategy?");
    if (q.includes('risk') || q.includes('vulnerab'))
        suggestions.push("Rank India's top 5 strategic vulnerabilities by severity.");
    if (suggestions.length === 0)
        suggestions.push("What are the second-order effects of this scenario?");
    return suggestions.slice(0, 3);
}

app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║  INDRA Backend Server v2.0           ║`);
    console.log(`  ║  Port: ${PORT}                          ║`);
    console.log(`  ║  Status: OPERATIONAL                 ║`);
    console.log(`  ║  Model: Llama 3.3 70B (Groq)        ║`);
    console.log(`  ║  RAG: Strategic KB Injected          ║`);
    console.log(`  ║  Multi-Turn: ENABLED                 ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
});