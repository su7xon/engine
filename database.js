import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'indra.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
    console.log('[DB] Initializing database...');

    db.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            description TEXT,
            color TEXT,
            size INTEGER DEFAULT 20,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            label TEXT,
            strength REAL DEFAULT 0.5,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source) REFERENCES nodes(id),
            FOREIGN KEY (target) REFERENCES nodes(id)
        );

        CREATE TABLE IF NOT EXISTS intelligence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            source TEXT,
            url TEXT,
            category TEXT,
            topic TEXT,
            published_at DATETIME,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fact TEXT NOT NULL,
            confidence TEXT,
            source_article_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_article_id) REFERENCES intelligence(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            topic TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT,
            user_id TEXT,
            alert_threshold REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
        CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
        CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source);
        CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target);
        CREATE INDEX IF NOT EXISTS idx_intelligence_topic ON intelligence(topic);
        CREATE INDEX IF NOT EXISTS idx_intelligence_fetched ON intelligence(fetched_at);
        CREATE INDEX IF NOT EXISTS idx_intelligence_category ON intelligence(category);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence);
        CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_nodes_type_created ON nodes(type, created_at);
        CREATE INDEX IF NOT EXISTS idx_intelligence_topic_fetched ON intelligence(topic, fetched_at DESC);
    `);

    console.log('[DB] Database initialized successfully with optimized indexes');
}

export function addNode(id, type, description = '', color = null, size = 20) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO nodes (id, type, description, color, size, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const defaultColors = {
        country: '#FF9933',
        tech: '#00D4FF',
        resource: '#FFD700',
        sector: '#FF4444',
        economic: '#FFB344',
        conflict: '#FF6644',
        global: '#44DDFF'
    };

    stmt.run(id, type, description, color || defaultColors[type] || '#888888', size);
    return getNode(id);
}

export function getNode(id) {
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
}

export function getAllNodes() {
    return db.prepare('SELECT * FROM nodes ORDER BY type, id').all();
}

export function updateNode(id, updates) {
    const fields = [];
    const values = [];

    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
    }
    if (updates.color !== undefined) {
        fields.push('color = ?');
        values.push(updates.color);
    }
    if (updates.size !== undefined) {
        fields.push('size = ?');
        values.push(updates.size);
    }

    if (fields.length === 0) return getNode(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getNode(id);
}

export function deleteNode(id) {
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    db.prepare('DELETE FROM relationships WHERE source = ? OR target = ?').run(id, id);
}

export function addRelationship(source, target, label = '', strength = 0.5) {
    if (!getNode(source)) addNode(source, 'unknown');
    if (!getNode(target)) addNode(target, 'unknown');

    const stmt = db.prepare(`
        INSERT INTO relationships (source, target, label, strength)
        VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(source, target, label, strength);
    return getRelationship(result.lastInsertRowid);
}

export function getRelationship(id) {
    return db.prepare('SELECT * FROM relationships WHERE id = ?').get(id);
}

export function getAllRelationships() {
    return db.prepare('SELECT * FROM relationships').all();
}

export function getRelationshipsForNode(nodeId) {
    return db.prepare(`
        SELECT * FROM relationships 
        WHERE source = ? OR target = ?
    `).all(nodeId, nodeId);
}

export function updateRelationship(id, updates) {
    const fields = [];
    const values = [];

    if (updates.label !== undefined) {
        fields.push('label = ?');
        values.push(updates.label);
    }
    if (updates.strength !== undefined) {
        fields.push('strength = ?');
        values.push(updates.strength);
    }

    if (fields.length === 0) return getRelationship(id);

    values.push(id);
    db.prepare(`UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getRelationship(id);
}

export function deleteRelationship(id) {
    db.prepare('DELETE FROM relationships WHERE id = ?').run(id);
}

export function addIntelligenceArticle(article) {
    const stmt = db.prepare(`
        INSERT INTO intelligence (title, description, source, url, category, topic, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        article.title,
        article.description || '',
        article.source || '',
        article.url || '',
        article.category || 'general',
        article.topic || 'India',
        article.pubDate || null
    );

    return getIntelligenceArticle(result.lastInsertRowid);
}

export function getIntelligenceArticle(id) {
    return db.prepare('SELECT * FROM intelligence WHERE id = ?').get(id);
}

export function getRecentIntelligence(limit = 50, topic = null) {
    if (topic) {
        return db.prepare(`
            SELECT * FROM intelligence 
            WHERE topic = ? 
            ORDER BY fetched_at DESC 
            LIMIT ?
        `).all(topic, limit);
    }

    return db.prepare(`
        SELECT * FROM intelligence 
        ORDER BY fetched_at DESC 
        LIMIT ?
    `).all(limit);
}

export function searchIntelligence(query) {
    return db.prepare(`
        SELECT * FROM intelligence 
        WHERE title LIKE ? OR description LIKE ?
        ORDER BY fetched_at DESC 
        LIMIT 50
    `).all(`%${query}%`, `%${query}%`);
}

export function addFact(fact, confidence = 'medium', articleId = null) {
    const stmt = db.prepare(`
        INSERT INTO facts (fact, confidence, source_article_id)
        VALUES (?, ?, ?)
    `);

    const result = stmt.run(fact, confidence, articleId);
    return getFact(result.lastInsertRowid);
}

export function getFact(id) {
    return db.prepare('SELECT * FROM facts WHERE id = ?').get(id);
}

export function getAllFacts(confidence = null) {
    if (confidence) {
        return db.prepare('SELECT * FROM facts WHERE confidence = ? ORDER BY created_at DESC').all(confidence);
    }
    return db.prepare('SELECT * FROM facts ORDER BY created_at DESC').all();
}

export function createSession(sessionId, userId = null, topic = 'India') {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO sessions (id, user_id, topic, last_activity)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(sessionId, userId, topic);
    return getSession(sessionId);
}

export function getSession(sessionId) {
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

export function addMessage(sessionId, role, content) {
    const stmt = db.prepare(`
        INSERT INTO messages (session_id, role, content)
        VALUES (?, ?, ?)
    `);

    stmt.run(sessionId, role, content);
    db.prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
}

export function getSessionMessages(sessionId, limit = 20) {
    return db.prepare(`
        SELECT * FROM messages 
        WHERE session_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `).all(sessionId, limit);
}

export function addToWatchlist(nodeId, userId = 'default', alertThreshold = 0.5) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO watchlist (node_id, user_id, alert_threshold)
        VALUES (?, ?, ?)
    `);

    stmt.run(nodeId, userId, alertThreshold);
}

export function removeFromWatchlist(nodeId, userId = 'default') {
    db.prepare('DELETE FROM watchlist WHERE node_id = ? AND user_id = ?').run(nodeId, userId);
}

export function getWatchlist(userId = 'default') {
    return db.prepare('SELECT * FROM watchlist WHERE user_id = ?').all(userId);
}

export function getFullGraph() {
    const nodes = getAllNodes();
    const relationships = getAllRelationships();

    return {
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
}

export function getStats() {
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get().count;
    const relCount = db.prepare('SELECT COUNT(*) as count FROM relationships').get().count;
    const intelCount = db.prepare('SELECT COUNT(*) as count FROM intelligence').get().count;
    const factCount = db.prepare('SELECT COUNT(*) as count FROM facts').get().count;

    const nodeTypes = db.prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type').all();

    return {
        nodes: nodeCount,
        relationships: relCount,
        intelligence: intelCount,
        facts: factCount,
        nodeTypes: nodeTypes.reduce((acc, t) => ({...acc, [t.type]: t.count }), {})
    };
}

export function seedInitialData() {
    const existingNodes = getAllNodes();
    if (existingNodes.length > 0) {
        console.log('[DB] Data already exists, skipping seed');
        return;
    }

    console.log('[DB] Seeding initial data...');

    const nodes = [
        { id: 'India', type: 'country', description: 'Sovereign Republic of India. Core node of the Intelligence Graph.', color: '#FF9933', size: 32 },
        { id: 'China', type: 'country', description: "People's Republic of China. Primary strategic competitor.", color: '#DE2910', size: 26 },
        { id: 'USA', type: 'country', description: 'United States of America. Key technology and security partner.', color: '#4B6BFB', size: 26 },
        { id: 'Russia', type: 'country', description: 'Russian Federation. Critical energy and defense supplier.', color: '#6B7FD7', size: 22 },
        { id: 'Gulf States', type: 'country', description: 'Primary source of energy and diaspora.', color: '#10B981', size: 20 },
        { id: 'EU', type: 'country', description: 'Major trading partner and technology source.', color: '#818CF8', size: 20 },
        { id: 'Semiconductors', type: 'tech', description: '100% import dependency for defense and tech.', color: '#00D4FF', size: 20 },
        { id: 'Oil & Energy', type: 'resource', description: 'Critical for national energy security.', color: '#FFD700', size: 24 },
        { id: 'Defense', type: 'sector', description: 'National defense and aerospace.', color: '#FF4444', size: 22 },
        { id: 'Agriculture', type: 'sector', description: 'Backbone of rural economy.', color: '#44FF88', size: 18 },
        { id: 'Rare Earth', type: 'resource', description: 'Critical minerals. High dependency on China.', color: '#C084FC', size: 18 },
        { id: 'Remittances', type: 'economic', description: '$125B+ annual inflows.', color: '#FFB344', size: 16 },
        { id: 'Border Disputes', type: 'conflict', description: 'Active territorial conflicts (LAC/LoC).', color: '#FF6644', size: 18 },
        { id: 'Climate Risk', type: 'global', description: 'Long-term threat to agriculture.', color: '#44DDFF', size: 16 },
        { id: 'Pharma', type: 'sector', description: 'Pharmaceutical industry.', color: '#34D399', size: 16 },
        { id: 'UPI / Fintech', type: 'tech', description: "India's strategic soft power.", color: '#A78BFA', size: 16 },
        { id: 'Space / ISRO', type: 'tech', description: 'Strategic space capabilities.', color: '#60A5FA', size: 16 },
    ];

    for (const node of nodes) {
        addNode(node.id, node.type, node.description, node.color, node.size);
    }

    const relationships = [
        { source: 'India', target: 'China', label: 'Trade Deficit $85B', strength: 0.9 },
        { source: 'India', target: 'USA', label: 'Strategic Partner', strength: 0.75 },
        { source: 'India', target: 'Russia', label: '60% Defense Imports', strength: 0.7 },
        { source: 'India', target: 'Gulf States', label: 'Oil + Diaspora', strength: 0.8 },
        { source: 'India', target: 'Semiconductors', label: '100% Import Dep.', strength: 0.95 },
        { source: 'India', target: 'Oil & Energy', label: '85% Import', strength: 0.9 },
        { source: 'India', target: 'Defense', label: '₹6.2L Cr Budget', strength: 0.75 },
        { source: 'India', target: 'Agriculture', label: '46% Workforce', strength: 0.85 },
        { source: 'India', target: 'Rare Earth', label: 'China Dependency', strength: 0.8 },
        { source: 'India', target: 'Remittances', label: '$125B Inflow', strength: 0.65 },
        { source: 'India', target: 'Border Disputes', label: 'LAC + LoC', strength: 0.85 },
        { source: 'India', target: 'Climate Risk', label: 'Monsoon Stress', strength: 0.6 },
        { source: 'India', target: 'Pharma', label: 'Pharmacy of World', strength: 0.7 },
        { source: 'India', target: 'UPI / Fintech', label: '10B+ txns/month', strength: 0.7 },
        { source: 'India', target: 'Space / ISRO', label: 'Chandrayaan-3', strength: 0.65 },
        { source: 'China', target: 'Rare Earth', label: '60% Global Supply', strength: 0.95 },
        { source: 'China', target: 'Semiconductors', label: 'SMIC producer', strength: 0.8 },
        { source: 'Russia', target: 'Oil & Energy', label: 'Discounted crude', strength: 0.85 },
        { source: 'USA', target: 'Semiconductors', label: 'Controls TSMC/Nvidia', strength: 0.9 },
        { source: 'China', target: 'Border Disputes', label: 'LAC Incursions', strength: 0.85 },
        { source: 'EU', target: 'India', label: 'FTA Negotiations', strength: 0.45 },
        { source: 'Gulf States', target: 'Remittances', label: '10M+ Workers', strength: 0.85 },
        { source: 'USA', target: 'Defense', label: 'GE F414 Engines', strength: 0.6 },
    ];

    for (const rel of relationships) {
        addRelationship(rel.source, rel.target, rel.label, rel.strength);
    }

    console.log('[DB] Initial data seeded successfully');
}

initializeDatabase();
seedInitialData();

export default db;