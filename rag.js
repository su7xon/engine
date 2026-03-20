import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// We initialize this lazily so dotenv in server.js has time to load process.env
let ai;
function getAI() {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return ai;
}
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';

// Simple in-memory vector store
let vectorStore = [];

/**
 * Calculates the cosine similarity between two vectors.
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates an embedding for a given text using Gemini Embedding 2.
 * @param {string} text 
 * @returns {Promise<number[]>} The embedding vector
 */
async function generateEmbedding(text) {
    try {
        const response = await getAI().models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text
        });
        return response.embeddings[0].values;
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error;
    }
}

/**
 * Reads, chunks, and creates embeddings for the knowledge base.
 */
export async function initializeVectorStore() {
    console.log("Initializing vector store...");
    const kbPath = path.join(process.cwd(), 'data', 'knowledge_base.md');
    
    if (!fs.existsSync(kbPath)) {
        console.warn(`Knowledge base not found at ${kbPath}`);
        return;
    }

    const content = fs.readFileSync(kbPath, 'utf8');
    
    // Chunk by heading (###)
    const rawChunks = content.split(/(?=### )/g);
    
    // Filter out empty chunks and clean them up
    const chunks = rawChunks
        .map(chunk => chunk.trim())
        .filter(chunk => chunk.length > 0);
    
    console.log(`Found ${chunks.length} chunks. Generating embeddings...`);
    
    vectorStore = [];
    for (const chunk of chunks) {
        try {
            const vector = await generateEmbedding(chunk);
            vectorStore.push({
                text: chunk,
                embedding: vector
            });
            console.log(`- Embedded chunk: "${chunk.substring(0, 30)}..."`);
        } catch (e) {
            console.error(`Failed to embed chunk: ${chunk.substring(0, 30)}...`);
        }
    }
    
    console.log(`Vector store initialized with ${vectorStore.length} chunks.`);
}

/**
 * Finds the top K most similar chunks for a given query.
 * @param {string} query 
 * @param {number} topK 
 * @returns {Promise<string[]>} Array of the most relevant chunk texts
 */
export async function findSimilarChunks(query, topK = 3) {
    if (vectorStore.length === 0) {
        console.warn("Vector store is empty. Call initializeVectorStore() first.");
        return [];
    }

    try {
        const queryVector = await generateEmbedding(query);
        
        // Calculate similarities
        const similarities = vectorStore.map(item => ({
            text: item.text,
            score: cosineSimilarity(queryVector, item.embedding)
        }));
        
        // Sort by highest score first
        similarities.sort((a, b) => b.score - a.score);
        
        // Return the top K chunk texts
        return similarities.slice(0, topK).map(item => item.text);
    } catch (e) {
        console.error("Error in findSimilarChunks:", e);
        return [];
    }
}
