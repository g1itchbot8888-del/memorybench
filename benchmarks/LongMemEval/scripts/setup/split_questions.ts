
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const datasetFile = join(__dirname, '../../datasets/longmemeval_s_cleaned.json');
const questionsDir = join(__dirname, '../../datasets/questions');

if (!existsSync(questionsDir)) {
    mkdirSync(questionsDir, { recursive: true });
}

console.log(`Reading dataset from ${datasetFile}`);

if (!existsSync(datasetFile)) {
    console.error("Dataset file not found!");
    process.exit(1);
}

const dataset = JSON.parse(readFileSync(datasetFile, 'utf8'));
console.log(`Found ${dataset.length} items in dataset.`);

let count = 0;
for (const item of dataset) {
    const filename = item._original_filename;
    if (!filename) {
        console.error("Item missing _original_filename, skipping...", item);
        continue;
    }

    // Skip test.json
    if (filename === 'test.json') {
        console.log("Skipping test.json");
        continue;
    }

    // Remove the metadata field we added
    const { _original_filename, ...questionData } = item;

    // Remove has_answer from haystack sessions
    if (questionData.haystack_sessions && Array.isArray(questionData.haystack_sessions)) {
        questionData.haystack_sessions.forEach((session: any[]) => {
            if (Array.isArray(session)) {
                session.forEach((message: any) => {
                    if (message && typeof message === 'object') {
                        delete message.has_answer;
                    }
                });
            }
        });
    }

    writeFileSync(join(questionsDir, filename), JSON.stringify(questionData, null, 2));
    count++;
}

console.log(`Successfully split ${count} questions into ${questionsDir}`);

