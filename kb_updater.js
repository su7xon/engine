import { GoogleGenAI } from '@google/genai';
import { fetchAllIntelligence } from './intelligence.js';
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
    
    const newsText = newsItems.slice(0, 10).map((item, i) => 
        `${i + 1}. ${item.title} - ${item.description || ''}`
    ).join('\n\n');

    const prompt = `You are an intelligence analyst. Extract structured entities from these news headlines.

For each piece of news, identify:
1. COUNTRIES involved (e.g., India, China, USA, Russia)
2. SECTORS/TECHNOLOGIES (e.g., Semiconductors, Defense, Energy, AI, Pharma)
3. KEY RELATIONSHIPS between entities
4. IMPORTANT NUMBERS (trade deficits, defense budgets, percentages)

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
            model: 'gemini-1.5-flash',
            contents: prompt
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
    console.log(`[KB AUTO-UPDATE] Starting knowledge base update for: ${topic}...`);
    
    try {
        const intel = await fetchAllIntelligence(topic);
        
        if (!intel.news || intel.news.length === 0) {
            console.log('[KB AUTO-UPDATE] No news available');
            return { success: false, reason: 'No news' };
        }
        
        for (const article of intel.news.slice(0, 20)) {
            addIntelligenceArticle({ ...article, topic });
        }
        
        const extractionResult = await extractEntitiesFromNews(intel.news);
        
        return {
            success: true,
            newsCount: intel.news.length,
            articlesStored: getRecentIntelligence(20).length,
            entities: extractionResult,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('[KB AUTO-UPDATE ERROR]:', error.message);
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
        n => n.id.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q)
    );
    
    const matchingRels = allRelationships.filter(
        r => 
            r.source.toLowerCase().includes(q) ||
            r.target.toLowerCase().includes(q) ||
            r.label?.toLowerCase().includes(q)
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
