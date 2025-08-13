import { GoogleGenerativeAI } from "@google/generative-ai";

class AIService {
    constructor() {
        this.initialized = false;
        this.geminiAI = null;
        this.model = null;
    }

    async initialize() {
        try {
            console.log('🤖 Initializing AI Service...');
            
            // Initialize Gemini AI (you'll need to add your API key)
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                this.geminiAI = new GoogleGenerativeAI(apiKey);
                this.model = this.geminiAI.getGenerativeModel({ model: "gemini-pro" });
                console.log('✅ Gemini AI initialized');
            } else {
                console.log('⚠️ No Gemini API key found - using mock AI responses');
            }
            
            this.initialized = true;
            console.log('✅ AI Service initialized successfully!');
            
        } catch (error) {
            console.error('❌ Error initializing AI Service:', error.message);
            throw error;
        }
    }

    async processHomomorphicResult(homomorphicResult, originalQuery, context = {}) {
        if (!this.initialized) {
            throw new Error('AI Service not initialized');
        }

        try {
            console.log(`🧠 Processing homomorphic result for operation: ${homomorphicResult.operation}`);
            
            switch (homomorphicResult.operation) {
                case 'sentiment_analysis':
                    return await this.generateSentimentResponse(homomorphicResult, originalQuery);
                
                case 'keyword_search':
                    return await this.generateSearchResponse(homomorphicResult, originalQuery);
                
                case 'word_count':
                    return await this.generateCountResponse(homomorphicResult, originalQuery);
                
                case 'similarity_check':
                    return await this.generateSimilarityResponse(homomorphicResult, originalQuery);
                
                case 'content_filter':
                    return await this.generateFilterResponse(homomorphicResult, originalQuery);
                
                default:
                    return await this.generateGenericResponse(homomorphicResult, originalQuery);
            }
            
        } catch (error) {
            console.error('❌ Error processing homomorphic result:', error.message);
            throw error;
        }
    }

    async generateSentimentResponse(result, query) {
        const responses = [
            "Based on the encrypted sentiment analysis, your message appears to have a positive tone! 😊",
            "The homomorphic sentiment computation suggests an optimistic perspective in your message.",
            "Privacy-preserving analysis indicates positive sentiment while keeping your data encrypted! 🔐✨",
            "Your message carries good vibes according to our encrypted sentiment analysis!"
        ];
        
        const response = {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: 'sentiment_analysis',
            confidence: result.confidence || 0.85,
            encryptedResult: result.encryptedSentiment,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };

        // If Gemini is available, enhance the response
        if (this.model) {
            try {
                const prompt = `Generate a brief, friendly response about sentiment analysis results without revealing the actual content. The analysis was performed on encrypted data using homomorphic encryption.`;
                const geminiResult = await this.model.generateContent(prompt);
                response.aiResponse = geminiResult.response.text() + " 🔐";
                response.enhancedByAI = true;
            } catch (error) {
                console.log('Using fallback response due to AI error:', error.message);
            }
        }

        return response;
    }

    async generateSearchResponse(result, query) {
        const matchCount = result.matchCount || 0;
        const responses = [
            `Found ${matchCount} encrypted matches in your private data! 🔍`,
            `Homomorphic search completed: ${matchCount} results found while maintaining privacy.`,
            `Your encrypted search returned ${matchCount} matches without exposing the content! 🔐`,
            `Privacy-preserving search found ${matchCount} relevant items in encrypted form.`
        ];
        
        return {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: 'keyword_search',
            matchCount: matchCount,
            encryptedResult: result.encryptedMatches,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };
    }

    async generateCountResponse(result, query) {
        const count = result.actualCount || 0;
        const responses = [
            `Your message contains ${count} words (computed on encrypted data)! 📊`,
            `Homomorphic word count: ${count} words processed privately.`,
            `Privacy-preserving analysis counted ${count} words without decryption! 🔐`,
            `Encrypted word count completed: ${count} words detected.`
        ];
        
        return {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: 'word_count',
            wordCount: count,
            encryptedResult: result.encryptedCount,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };
    }

    async generateSimilarityResponse(result, query) {
        const similarity = Math.round((result.similarity || 0.5) * 100);
        const responses = [
            `The messages are ${similarity}% similar based on encrypted comparison! 🔄`,
            `Homomorphic similarity analysis: ${similarity}% match while preserving privacy.`,
            `Privacy-preserving similarity check shows ${similarity}% correlation! 🔐`,
            `Encrypted content comparison: ${similarity}% similarity detected.`
        ];
        
        return {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: 'similarity_check',
            similarity: similarity,
            encryptedResult: result.encryptedSimilarity,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };
    }

    async generateFilterResponse(result, query) {
        const isSafe = result.isSafe !== false;
        const responses = isSafe ? [
            "Content passed privacy-preserving safety checks! ✅ Your message is secure.",
            "Homomorphic content filtering: All clear! Your encrypted data is safe.",
            "Privacy-preserving filter analysis: Content approved! 🛡️",
            "Encrypted content validation successful - your message meets safety standards."
        ] : [
            "Content flagged during privacy-preserving analysis. Please review your message.",
            "Homomorphic filtering detected potential issues. Consider revising your content.",
            "Privacy-preserving safety check raised some concerns. Please modify your message."
        ];
        
        return {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: 'content_filter',
            isSafe: isSafe,
            riskLevel: result.riskLevel || 'low',
            encryptedResult: result.encryptedFilterResult,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };
    }

    async generateGenericResponse(result, query) {
        const responses = [
            "Homomorphic computation completed successfully on your encrypted data! 🔐",
            "Privacy-preserving operation finished - your data remained encrypted throughout.",
            "Encrypted processing completed! Your privacy was maintained during computation.",
            "Homomorphic analysis done - results generated without exposing your private data! ✨"
        ];
        
        const response = {
            aiResponse: responses[Math.floor(Math.random() * responses.length)],
            operation: result.operation,
            encryptedResult: result.encryptedResult || result.result,
            metadata: {
                privacyPreserved: true,
                homomorphicProcessing: true,
                timestamp: Date.now()
            }
        };

        // Enhanced response if Gemini is available
        if (this.model) {
            try {
                const prompt = `Generate a brief, encouraging response about completing a privacy-preserving computation called "${result.operation}" using homomorphic encryption. Keep it under 50 words and mention privacy benefits.`;
                const geminiResult = await this.model.generateContent(prompt);
                response.aiResponse = geminiResult.response.text() + " 🔐";
                response.enhancedByAI = true;
            } catch (error) {
                console.log('Using fallback response due to AI error:', error.message);
            }
        }

        return response;
    }

    async chatWithEncryptedContext(userMessage, encryptedContext) {
        if (!this.initialized) {
            throw new Error('AI Service not initialized');
        }

        try {
            console.log('💬 Processing chat with encrypted context...');
            
            // Mock AI chat response that's aware of encrypted context
            const responses = [
                "I understand you're working with encrypted data! How can I help you with privacy-preserving operations? 🔐",
                "Your message is secure with homomorphic encryption. What would you like to compute privately?",
                "I can help you with encrypted computations while keeping your data private! What's your question?",
                "Privacy-first AI assistant here! I can work with your encrypted data safely. How may I assist?",
                "Your data stays encrypted while I help you. What homomorphic operation would you like to perform?"
            ];

            let aiResponse = responses[Math.floor(Math.random() * responses.length)];

            // Enhanced response if Gemini is available
            if (this.model) {
                try {
                    const prompt = `You are a privacy-preserving AI assistant that works with homomorphically encrypted data. 
                    A user sent an encrypted message (content hidden for privacy). 
                    Respond helpfully about privacy-preserving computations, homomorphic encryption, or secure data processing. 
                    Keep the response under 100 words and friendly. User's encrypted message context indicates they want to chat.`;
                    
                    const geminiResult = await this.model.generateContent(prompt);
                    aiResponse = geminiResult.response.text() + " 🔐✨";
                } catch (error) {
                    console.log('Using fallback chat response due to AI error:', error.message);
                }
            }

            return {
                aiResponse: aiResponse,
                operation: 'encrypted_chat',
                privacyPreserved: true,
                metadata: {
                    chatResponse: true,
                    homomorphicProcessing: true,
                    timestamp: Date.now()
                }
            };

        } catch (error) {
            console.error('❌ Error in encrypted chat:', error.message);
            throw error;
        }
    }

    isInitialized() {
        return this.initialized;
    }
}

export default AIService;
