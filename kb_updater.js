import { GoogleGenAI } from '@google/genai';
import { fetchAllIntelligence } from './intelligence.js';
import { runCrawlSession } from './web_crawler.js'; // Imports Swarm
import db, {
    addNode,
    addRelationship,
    getNode,
    getAllNodes,
    getAllRelationships,
    addIntelligenceArticle,
    addFact,
    getFullGraph as dbGetFullGraph,
    getRecentIntelligence,
    getAllFacts,
    updateNode as dbUpdateNode,
    deleteNode as dbDeleteNode,
    deleteRelationship as dbDeleteRelationship
} from './database.js';

let ai;

const MAX_NEWS_ITEMS_FOR_ENTITY_EXTRACTION = 8;
const MAX_NEWS_LINE_CHARS = 260;

function getAI() {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return ai;
}

export async function extractEntitiesFromNews(newsItems) {
    console.log(`[ENTITY EXTRACTION] Processing ${newsItems.length} news items...`);

    if (newsItems.length === 0) {
        console.log('[ENTITY EXTRACTION] No news items to process');
        return null;
    }

    const newsText = newsItems
        .slice(0, MAX_NEWS_ITEMS_FOR_ENTITY_EXTRACTION)
        .map((item, i) => {
            const line = `${item.title || ''}. ${(item.description || '').replace(/\s+/g, ' ')}`.trim();
            return `${i + 1}. ${line.slice(0, MAX_NEWS_LINE_CHARS)}`;
        })
        .join('\n');

    const prompt = `You are an intelligence analyst. Extract compact structured entities from these headlines.

For each piece of news, identify:
1. COUNTRIES involved (e.g., India, China, USA, Russia)
2. SECTORS/TECHNOLOGIES (e.g., Semiconductors, Defense, Energy, AI, Pharma)
3. KEY RELATIONSHIPS between entities
4. IMPORTANT NUMBERS (trade deficits, defense budgets, percentages)

Constraints:
- Return at most 12 nodes, 18 relationships, and 12 facts.
- Keep node descriptions under 90 characters.
- Keep relationship labels under 60 characters.
- Return ONLY JSON.

Return a JSON object with this exact structure:
{
  "nodes": [
    {"id": "Entity Name", "type": "country|sector|tech|resource|economic|conflict", "description": "Brief description"}
  ],
  "relationships": [
    {"from": "Entity A", "to": "Entity B", "label": "Relationship description", "strength": 0.0-1.0}
  ],
  "facts": [
    {"fact": "Specific fact extracted", "confidence": "high|medium|low"}
  ]
}

NEWS:
${newsText}`;

    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: prompt,
            config: {
                temperature: 0.1,
                maxOutputTokens: 900
            }
        });

        const text = response.text;

        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            const newNodes = parsed.nodes || [];
            const newRelationships = parsed.relationships || [];
            const newFacts = parsed.facts || [];

            let addedNodes = 0;
            let addedRels = 0;
            let addedFacts = 0;

            for (const node of newNodes) {
                if (!getNode(node.id)) {
                    addNode(node.id, node.type, node.description);
                    addedNodes++;
                }
            }

            const existingRels = getAllRelationships();
            for (const rel of newRelationships) {
                const exists = existingRels.find(
                    r => r.source === rel.from && r.target === rel.to
                );
                if (!exists) {
                    addRelationship(rel.from, rel.to, rel.label, rel.strength);
                    addedRels++;
                }
            }

            for (const fact of newFacts) {
                addFact(fact.fact, fact.confidence);
                addedFacts++;
            }

            console.log(`[ENTITY EXTRACTION] Added ${addedNodes} nodes, ${addedRels} relationships, ${addedFacts} facts`);

            return {
                nodes: newNodes,
                relationships: newRelationships,
                facts: newFacts,
                totalStored: {
                    nodes: getAllNodes().length,
                    relationships: getAllRelationships().length
                }
            };
        }
    } catch (error) {
        console.error('[ENTITY EXTRACTION ERROR]:', error.message);
    }

    return null;
}

export async function autoUpdateKnowledgeBase(topic = 'India') {
    console.log('[KB AUTO-UPDATE] UNLEASHING SWARM for: ' + topic + '...');
    try {
        const swarmData = await runCrawlSession(15, 'all', 10);

        if (swarmData.error) {
            return { success: false, reason: swarmData.error };
        }

        let swarmNews = (swarmData.results || []).map(r => ({
            title: r.title || r.url,
            description: r.description || r.summary || '',
            url: r.url
        }));

        // If swarm extraction yields nothing, degrade gracefully to RSS intelligence.
        if (swarmNews.length === 0) {
            const fallbackIntel = await fetchAllIntelligence(topic);
            swarmNews = (fallbackIntel || []).map(item => ({
                title: item.title || item.source || topic,
                description: item.description || '',
                url: item.link || item.url || ''
            })).filter(item => item.title || item.description);
        }

        if (!swarmNews || swarmNews.length === 0) return { success: false, reason: 'No valid data extracted' };
        for (const article of swarmNews.slice(0, 20)) {
            addIntelligenceArticle({...article, topic });
        }
        const extractionResult = await extractEntitiesFromNews(swarmNews);
        return {
            success: true,
            newsCount: swarmNews.length,
            agentsDeployed: swarmData.agentsDeployed,
            articlesStored: getRecentIntelligence(20).length,
            entities: extractionResult,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return { success: false, reason: error.message };
    }
}

export function getExtractedEntities() {
    const nodes = getAllNodes();
    const relationships = getAllRelationships();
    const facts = getAllFacts();

    return {
        nodes,
        relationships,
        facts,
        lastUpdated: new Date().toISOString()
    };
}

export function getEntityNodes() {
    return getAllNodes();
}

export function getEntityRelationships() {
    return getAllRelationships();
}

export function searchEntities(query) {
    const q = query.toLowerCase();

    const allNodes = getAllNodes();
    const allRelationships = getAllRelationships();

    const matchingNodes = allNodes.filter(
        n => n.id.toLowerCase().includes(q) || (n.description && n.description.toLowerCase().includes(q))
    );

    const matchingRels = allRelationships.filter(
        r =>
        r.source.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q) ||
        (r.label && r.label.toLowerCase().includes(q))
    );

    return {
        nodes: matchingNodes.slice(0, 10),
        relationships: matchingRels.slice(0, 10)
    };
}

// ==================== GRAPH MANAGEMENT ====================

export function addGraphNode(id, type, description) {
    return addNode(id, type, description);
}

export function addGraphRelationship(from, to, label, strength = 0.5) {
    return addRelationship(from, to, label, strength);
}

export function getFullGraph() {
    // Use database directly for graph data
    return dbGetFullGraph();
}

export function removeGraphNode(id) {
    dbDeleteNode(id);
    console.log(`[GRAPH] Removed node: ${id}`);
}

export function updateNodeDescription(id, description) {
    return dbUpdateNode(id, { description });
}

export function getIntelligence(limit = 50) {
    return getRecentIntelligence(limit);
}

export function getFacts(confidence = null) {
    return getAllFacts(confidence);
}