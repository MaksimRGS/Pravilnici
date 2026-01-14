const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

class DocumentService {
    constructor() {
        this.documentsCache = null;
    }

    async loadDocuments() {
        try {
            const dataPath = path.join(__dirname, config.dataFolder);
            const files = await fs.readdir(dataPath);

            const documents = [];

            for (const file of files) {
                const filePath = path.join(dataPath, file);
                const stats = await fs.stat(filePath);

                if (!stats.isFile()) continue;

                let content = '';
                const fileLower = file.toLowerCase();

                try {
                    if (fileLower.endsWith('.txt') || fileLower.endsWith('.md')) {
                        // Plain text files
                        content = await fs.readFile(filePath, 'utf8');
                    } else if (fileLower.endsWith('.pdf')) {
                        // PDF files
                        const dataBuffer = await fs.readFile(filePath);
                        const pdfData = await pdf(dataBuffer);
                        content = pdfData.text;
                    } else if (fileLower.endsWith('.docx')) {
                        // DOCX files
                        const result = await mammoth.extractRawText({ path: filePath });
                        content = result.value;
                    } else {
                        // Skip unsupported file types
                        continue;
                    }

                    if (content && content.trim()) {
                        documents.push({
                            filename: file,
                            content: content.trim(),
                            path: filePath,
                            type: fileLower.endsWith('.pdf') ? 'PDF' :
                                fileLower.endsWith('.docx') ? 'DOCX' : 'TEXT'
                        });
                        console.log(`✓ Loaded: ${file} (${content.length} characters)`);
                    } else {
                        console.log(`⚠ Skipped empty: ${file}`);
                    }
                } catch (fileError) {
                    console.error(`✗ Error loading ${file}:`, fileError.message);
                }
            }

            this.documentsCache = documents;
            console.log(`\nTotal loaded: ${documents.length} regulation documents`);
            return documents;
        } catch (error) {
            console.error('Error loading documents:', error.message);
            return [];
        }
    }

    async getDocuments() {
        if (!this.documentsCache) {
            await this.loadDocuments();
        }
        return this.documentsCache;
    }

    async reloadDocuments() {
        this.documentsCache = null;
        return await this.loadDocuments();
    }

    formatDocumentsForAI() {
        if (!this.documentsCache || this.documentsCache.length === 0) {
            return 'Nema dostupnih dokumenata o pravilnicima.';
        }

        return this.documentsCache.map((doc, index) => {
            return `=== DOKUMENT ${index + 1}: ${doc.filename} ===\n${doc.content}\n`;
        }).join('\n\n');
    }

    async listDocuments() {
        const docs = await this.getDocuments();
        return docs.map(doc => doc.filename);
    }
}

module.exports = new DocumentService();
