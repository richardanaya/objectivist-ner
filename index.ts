import { program } from "commander";
import path from "path";
import os from "os";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

const MODELS = {
  fast: "hf:unsloth/Qwen3.5-0.8B-GGUF:Qwen3.5-0.8B-Q8_0.gguf",
  balanced: "hf:unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q8_0.gguf",
  best: "hf:unsloth/Qwen3.5-4B-GGUF:Qwen3.5-4B-Q8_0.gguf",
} as const;

const SYSTEM_PROMPT = `You are a named entity recognition (NER) system. Your task is to extract entities from text.

Rules:
- "text" must be the EXACT substring from the input that refers to the entity. Do NOT paraphrase or include extra words.
- "class" is the entity type (e.g. person, animal, location, organization).
- "attributes" are properties of the entity found in context.
- Return one object per distinct entity mention.
- If no entities are found, return an empty array [].`;

const FEW_SHOT_EXAMPLES = `Example 1:
Input: "the cat is blue and is feeling sad"
Output: [{"class":"animal","text":"cat","attributes":{"color":"blue","emotional_state":"sad"}}]

Example 2:
Input: "John Smith lives in New York City and works at Google"
Output: [{"class":"person","text":"John Smith","attributes":{"location":"New York City","employer":"Google"}},{"class":"location","text":"New York City","attributes":{}},{"class":"organization","text":"Google","attributes":{}}]

Example 3:
Input: "The quick brown fox jumps over the lazy dog near the river"
Output: [{"class":"animal","text":"fox","attributes":{"color":"brown","speed":"quick"}},{"class":"animal","text":"dog","attributes":{"temperament":"lazy"}},{"class":"location","text":"the river","attributes":{}}]

Example 4:
Input: "Researchers at MIT found that the drug Riluzole slows progression of ALS in a trial last March"
Output: [{"class":"organization","text":"MIT","attributes":{}},{"class":"drug","text":"Riluzole","attributes":{}},{"class":"disease","text":"ALS","attributes":{}},{"class":"event","text":"trial last March","attributes":{"date":"last March"}}]`;

program
  .name("fastner")
  .description(
    "Fast LLM-powered named entity recognition with schema constraints",
  )
  .argument("[text]", "Text to extract entities from (omit to read from stdin)")
  .option("-c, --classes <list>", "Comma-separated allowed entity classes")
  .option("-a, --attributes <list>", "Comma-separated allowed attribute keys")
  .option(
    "--attr-values <json>",
    'JSON enum map for attributes e.g. {"color":["blue","red"]}',
  )
  .option(
    "--system-prompt <string>",
    "Replace the built-in system prompt entirely",
  )
  .option(
    "--system-prompt-append <string>",
    "Append to the built-in system prompt",
  )
  .option("-m, --model <uri>", "Model URI or path to GGUF file")
  .option("--fast", "Use smallest model (0.8B) -- quick, simple text only")
  .option(
    "--balanced",
    "Use mid-size model (2B) -- good accuracy/speed tradeoff",
  )
  .option("--best", "Use largest model (4B) -- best accuracy (default)")
  .option("--compact", "Output compact JSON (also auto-enabled for non-TTY)")
  .addHelpText(
    "after",
    `
Examples:
  fastner "the cat is blue"
  fastner "John works at Google" --classes person,organization
  fastner "sky is blue" --attr-values '{"color":["blue","red"]}'
  fastner --fast "simple short text"
  fastner --balanced "moderately complex text"
  echo "the cat is blue" | fastner
`,
  )
  .parse();

const opts = program.opts();

const tierFlags = [opts.fast, opts.balanced, opts.best].filter(Boolean).length;
if (tierFlags > 1) {
  console.error(
    "Error: --fast, --balanced, and --best are mutually exclusive.",
  );
  process.exit(1);
}

if (opts.systemPrompt && opts.systemPromptAppend) {
  console.error(
    "Error: --system-prompt and --system-prompt-append are mutually exclusive.",
  );
  process.exit(1);
}

// === READ INPUT (argument or stdin) ===
let text = program.args[0];
if (!text) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  text = Buffer.concat(chunks).toString().trim();
}
if (!text) {
  console.error(
    "Error: No input text provided. Pass as argument or via stdin.",
  );
  process.exit(1);
}

// === RESOLVE MODEL ===
const modelUri = opts.model
  ? opts.model
  : opts.fast
    ? MODELS.fast
    : opts.balanced
      ? MODELS.balanced
      : MODELS.best;

const modelsDir = path.join(os.homedir(), ".fastner", "models");
const modelPath = await resolveModelFile(modelUri, modelsDir);

const llama = await getLlama();
const model = await llama.loadModel({ modelPath });
const context = await model.createContext();
const session = new LlamaChatSession({
  contextSequence: context.getSequence(),
  systemPrompt: opts.systemPrompt
    ? opts.systemPrompt
    : opts.systemPromptAppend
      ? `${SYSTEM_PROMPT}\n\n${FEW_SHOT_EXAMPLES}\n\n${opts.systemPromptAppend}`
      : `${SYSTEM_PROMPT}\n\n${FEW_SHOT_EXAMPLES}`,
});

// === DYNAMIC SCHEMA ===
const allowedClasses = opts.classes
  ? opts.classes.split(",").map((s: string) => s.trim())
  : undefined;
const allowedAttrs = opts.attributes
  ? opts.attributes.split(",").map((s: string) => s.trim())
  : undefined;

// Grammar can't express optional properties or enum subsets without perf issues.
// Attribute constraints (--attributes, --attr-values) are enforced via prompt instead.
const attributesSchema: any = {
  type: "object",
  additionalProperties: { type: "string" },
};

let attrValuesMap: Record<string, string[]> | undefined;
if (opts.attrValues) {
  try {
    attrValuesMap = JSON.parse(opts.attrValues);
  } catch (e) {
    console.error(
      `Error: Invalid JSON for --attr-values: ${(e as Error).message}`,
    );
    process.exit(1);
  }
}

const schema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      class: {
        type: "string",
        ...(allowedClasses && { enum: allowedClasses }),
      },
      text: { type: "string" },
      attributes: attributesSchema,
    },
    required: ["class", "text"],
    additionalProperties: false,
  },
} as const;

const grammar = await llama.createGrammarForJsonSchema(schema);

// === PROMPT ===
let constraints = "";
if (allowedClasses) {
  constraints += `\nAllowed entity classes: ${allowedClasses.join(", ")}. Only use these classes.`;
}
if (attrValuesMap) {
  const desc = Object.entries(attrValuesMap)
    .map(([k, v]) => `${k}: ${v.join(", ")}`)
    .join("; ");
  constraints += `\nOnly use these attribute keys and values: ${desc}. Omit attributes that don't apply to an entity.`;
} else if (allowedAttrs) {
  constraints += `\nOnly use these attribute keys: ${allowedAttrs.join(", ")}. Omit attributes that don't apply to an entity.`;
}

const prompt = `Extract all named entities from the following text.${constraints}\n\nText: ${text}`;

const res = await session.prompt(prompt, { grammar });

let parsed: any[] = [];
try {
  parsed = grammar.parse(res);
} catch {
  try {
    parsed = JSON.parse(res.trim());
  } catch {
    console.error("Warning: Failed to parse model output. Raw response:", res);
  }
}

// === OUTPUT ===
const compact = opts.compact || !process.stdout.isTTY;
console.log(JSON.stringify(parsed, null, compact ? 0 : 2));

// === CLEANUP ===
// Bun segfaults if process.exit() triggers synchronous native addon unloading.
// Setting exitCode lets the event loop drain naturally, avoiding the crash.
process.exitCode = 0;
