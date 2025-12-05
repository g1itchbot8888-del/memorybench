/*
LoCoMo Evaluation Script
Evaluates a single conversation's QA pairs with LLM judge.

Usage: bun run evaluate.ts <conversationId> <runId> [waitSeconds]
*/

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config, validateConfig } from '../utils/config.ts';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to get model instance based on model name
function getModel(modelName: string) {
    if (modelName.startsWith('gpt') || modelName.startsWith('o1') || modelName.startsWith('o3')) {
        return openai(modelName);
    } else if (modelName.startsWith('gemini')) {
        return google(modelName);
    } else {
        // Default to OpenAI for unknown models
        return openai(modelName);
    }
}

// Validate config - only require keys for the providers we're using
const requiredKeys: (keyof typeof config)[] = ['apiKey', 'baseUrl'];
if (config.judgeModel.startsWith('gpt') || config.judgeModel.startsWith('o1') || config.generatorModel.startsWith('gpt') || config.generatorModel.startsWith('o1')) {
    requiredKeys.push('openaiApiKey');
}
if (config.judgeModel.startsWith('gemini') || config.generatorModel.startsWith('gemini')) {
    requiredKeys.push('googleApiKey');
}
validateConfig(requiredKeys);

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: bun run evaluate.ts <conversationId> <runId> [waitSeconds]");
    process.exit(1);
}

const conversationId = args[0]!;
const runId = args[1]!;
const waitSeconds = args.length >= 3 ? parseInt(args[2]!) : 0;
const containerTag = `${conversationId}-${runId}`;

// Models - auto-detect provider based on model name
const JUDGE_MODEL = getModel(config.judgeModel);
const GENERATOR_MODEL = getModel(config.generatorModel);

console.log(`\n=== LoCoMo Evaluation ===`);
console.log(`Conversation ID: ${conversationId}`);
console.log(`Container Tag: ${containerTag}`);
console.log(`Generator: ${config.generatorModel}`);
console.log(`Judge: ${config.judgeModel}`);
if (waitSeconds > 0) {
    console.log(`Will wait ${waitSeconds}s for indexing`);
}
console.log('\n');

// Setup paths
const resultsDir = join(__dirname, '../../results');
if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
}

const resultFilePath = join(resultsDir, `result-${conversationId}-${runId}.json`);

// Load conversation data
const locomoDataPath = join(__dirname, '../../locomo10.json');
if (!existsSync(locomoDataPath)) {
    console.error(`Error: locomo10.json not found at ${locomoDataPath}`);
    process.exit(1);
}

const locomoData = JSON.parse(readFileSync(locomoDataPath, 'utf8'));
const conversation = locomoData.find((c: any) => c.sample_id === conversationId);

if (!conversation) {
    console.error(`Error: Conversation ${conversationId} not found`);
    process.exit(1);
}

const qaPairs = conversation.qa || [];
console.log(`Found ${qaPairs.length} QA pairs to evaluate\n`);

// Search function
const searchQuestion = async (question: string): Promise<any> => {
    const response = await fetch(`${config.baseUrl}/v4/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            q: question,
            containerTag: containerTag,
            limit: 20,
            threshold: 0.3,
            include: { chunks: true }
        }),
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }

    return response.json();
};

// Generate answer using LLM
const generateAnswer = async (question: string, searchResults: any, questionDate?: string): Promise<string> => {
    const allResults = searchResults.results || [];
    
    if (allResults.length === 0) {
        return "I don't have enough information to answer this question.";
    }

    // Build context from results
    const context = allResults.map((result: any, i: number) => {
        const memory = result.memory || '';
        const chunks = result.chunks || [];
        const chunkText = chunks.map((c: any) => c.content || c.text || '').join('\n');
        return `Result ${i + 1}:\nMemory: ${memory}\nContent:\n${chunkText}`;
    }).join('\n\n---\n\n');

    try {
        const { text } = await generateText({
            model: GENERATOR_MODEL,
            prompt: `You are a question-answering system. Answer based on the context below.

Question: ${question}
Question Date: ${questionDate || 'Not provided'}

Context:
${context}

Instructions:
- Answer concisely (10-15 words max)
- Base your answer ONLY on the provided context
- If you can't find the answer, say "I don't know"

Answer:`,
        });
        return text;
    } catch (error) {
        console.error('Error generating answer:', error);
        return "Error generating answer";
    }
};

// Judge answer
const evaluateAnswer = async (
    question: string,
    groundTruth: string,
    generated: string
): Promise<{ score: number; label: string }> => {
    try {
        const { text } = await generateText({
            model: JUDGE_MODEL,
            prompt: `Judge if the response is correct.

Question: ${question}
Correct Answer: ${groundTruth}
Response: ${generated}

Be generous - if the response captures the same meaning as the correct answer, it's CORRECT.

Return JSON: {"label": "CORRECT" or "WRONG"}`,
        });

        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                score: parsed.label === "CORRECT" ? 1 : 0,
                label: parsed.label
            };
        }
        return { score: 0, label: "WRONG" };
    } catch (error) {
        console.error('Error judging:', error);
        return { score: 0, label: "WRONG" };
    }
};

// Category names
const CATEGORY_NAMES: { [key: number]: string } = {
    1: 'Single-hop',
    2: 'Multi-hop',
    3: 'Temporal',
    4: 'Open-domain',
    5: 'Adversarial'
};

// Main evaluation
const runEvaluation = async () => {
    if (waitSeconds > 0) {
        console.log(`Waiting ${waitSeconds} seconds for indexing...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        console.log('Proceeding with evaluation...\n');
    }

    const results: any[] = [];

    for (let i = 0; i < qaPairs.length; i++) {
        const qa = qaPairs[i];
        const { question, evidence, category } = qa;
        const answer = qa.answer ?? qa.adversarial_answer;

        console.log(`[${i + 1}/${qaPairs.length}] ${CATEGORY_NAMES[category] || 'Unknown'}`);
        console.log(`  Q: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`);

        try {
            const searchResults = await searchQuestion(question);
            const generatedAnswer = await generateAnswer(question, searchResults, qa.question_date);
            const judgement = await evaluateAnswer(question, String(answer), generatedAnswer);

            console.log(`  A: ${generatedAnswer.substring(0, 50)}${generatedAnswer.length > 50 ? '...' : ''}`);
            console.log(`  ${judgement.score ? '✓ CORRECT' : '✗ WRONG'}`);

            results.push({
                conversation_id: conversationId,
                question,
                question_category: category,
                ground_truth_answer: answer,
                evidence,
                generated_answer: generatedAnswer,
                score: judgement.score,
                judge_label: judgement.label,
                search_results: searchResults,
                timestamp: new Date().toISOString(),
            });

            // Save intermediate
            writeFileSync(resultFilePath, JSON.stringify({
                metadata: {
                    conversation_id: conversationId,
                    container_tag: containerTag,
                    run_id: runId,
                    questions_evaluated: results.length,
                    total_questions: qaPairs.length,
                    timestamp: new Date().toISOString(),
                },
                results
            }, null, 2));

        } catch (error) {
            console.error(`  Error: ${error}`);
            results.push({
                conversation_id: conversationId,
                question,
                question_category: category,
                ground_truth_answer: answer,
                evidence,
                generated_answer: "Error",
                score: 0,
                judge_label: "ERROR",
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
            });
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Calculate metrics
    const total = results.length;
    const correct = results.filter(r => r.score === 1).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    // Category breakdown
    const categoryMetrics: any[] = [];
    for (const cat of [1, 2, 3, 4, 5]) {
        const catResults = results.filter(r => r.question_category === cat);
        const catCorrect = catResults.filter(r => r.score === 1).length;
        const catTotal = catResults.length;
        if (catTotal > 0) {
            categoryMetrics.push({
                category: cat,
                name: CATEGORY_NAMES[cat],
                total: catTotal,
                correct: catCorrect,
                accuracy: (catCorrect / catTotal) * 100
            });
        }
    }

    // Weighted accuracy
    const weightedAccuracy = categoryMetrics.length > 0
        ? categoryMetrics.reduce((sum, c) => sum + c.accuracy, 0) / categoryMetrics.length
        : 0;

    // Save final
    writeFileSync(resultFilePath, JSON.stringify({
        metadata: {
            conversation_id: conversationId,
            container_tag: containerTag,
            run_id: runId,
            total_questions: total,
            correct_answers: correct,
            accuracy: accuracy.toFixed(2) + '%',
            weighted_accuracy: weightedAccuracy.toFixed(2) + '%',
            timestamp: new Date().toISOString(),
        },
        category_metrics: categoryMetrics,
        results
    }, null, 2));

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('                    EVALUATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Questions:    ${total}`);
    console.log(`Correct Answers:    ${correct}`);
    console.log(`Accuracy:           ${accuracy.toFixed(2)}%`);
    console.log(`Weighted Accuracy:  ${weightedAccuracy.toFixed(2)}%`);
    console.log('─'.repeat(60));
    for (const cat of categoryMetrics) {
        console.log(`${cat.name.padEnd(12)} | ${cat.correct}/${cat.total} | ${cat.accuracy.toFixed(1)}%`);
    }
    console.log('═'.repeat(60));
    console.log(`\n✓ Results saved to: ${resultFilePath}`);
};

await runEvaluation();

