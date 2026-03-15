import { program } from "commander";
import path from "path";
import os from "os";
import fs from "fs";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";

// === MODELS ===
const MODELS = {
  fast: "hf:unsloth/Qwen3.5-0.8B-GGUF:Qwen3.5-0.8B-Q8_0.gguf",
  balanced: "hf:unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q8_0.gguf",
  best: "hf:unsloth/Qwen3.5-4B-GGUF:Qwen3.5-4B-Q8_0.gguf",
} as const;

// === SYSTEM PROMPTS ===
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

// === SCHEMA FILE TYPES ===
interface SchemaFile {
  taxonomy?: Record<string, string[]>;
  classes?: string[];
  attributes?: string[];
  attrValues?: Record<string, string[]>;
  relations?: string[];
}

// === TAXONOMY HELPERS ===
function flattenTaxonomy(taxonomy: Record<string, string[]>): string[] {
  const all = new Set<string>();
  for (const [parent, children] of Object.entries(taxonomy)) {
    all.add(parent);
    for (const child of children) all.add(child);
  }
  return [...all];
}

function taxonomyToPrompt(taxonomy: Record<string, string[]>): string {
  const lines = Object.entries(taxonomy)
    .map(([parent, children]) => `  ${parent}: ${children.join(", ")}`)
    .join("\n");
  return `Use the following class hierarchy. Classify at the most specific level.\n${lines}`;
}

// === CHUNKING ===
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? " " : "") + sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// === CLI ===
program
  .name("ner")
  .description(
    "Objectivist-inspired named entity recognition with grammar constraints",
  )
  .argument("[text]", "Text to extract entities from (omit to read from stdin)")
  .option("-c, --classes <list>", "Comma-separated allowed entity classes")
  .option("-a, --attributes <list>", "Comma-separated allowed attribute keys")
  .option(
    "--attr-values <json>",
    'JSON enum map for attributes e.g. {"color":["blue","red"]}',
  )
  .option(
    "--taxonomy <json>",
    'Class hierarchy JSON e.g. {"organism":["animal","plant"]}',
  )
  .option("--relations", "Extract relations between entities")
  .option("--resolve", "Resolve coreferences (group mentions of same entity)")
  .option("--include-confidence", "Include confidence scores per entity")
  .option("--detect-negation", "Detect negated/hypothetical entities")
  .option("--schema <path>", "Load entity schema definition from a JSON file")
  .option(
    "--file <path>",
    "Read input from a file (with chunking for long docs)",
  )
  .option(
    "--batch <path>",
    "Process JSONL file (one text per line) or directory of .txt files",
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
  fastner --fast "simple short text"
  fastner "John works at Google" --classes person,organization
  fastner "sky is blue" --attr-values '{"color":["blue","red"]}'
  fastner --relations "Dr. Chen works at MIT"
  fastner --resolve "Dr. Chen published a paper. She won an award."
  fastner --detect-negation "The patient does not have diabetes"
  fastner --schema schema.json "complex text"
  fastner --file document.txt
  fastner --batch inputs.jsonl
  echo "the cat is blue" | fastner
`,
  )
  .parse();

const opts = program.opts();

// === VALIDATIONS ===
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

// === LOAD SCHEMA FILE ===
let schemaFile: SchemaFile | undefined;
if (opts.schema) {
  try {
    const raw = fs.readFileSync(opts.schema, "utf-8");
    schemaFile = JSON.parse(raw);
  } catch (e) {
    console.error(`Error: Failed to load schema file: ${(e as Error).message}`);
    process.exit(1);
  }
}

// === MERGE OPTIONS (CLI flags override schema file) ===
const allowedClasses: string[] | undefined = opts.classes
  ? opts.classes.split(",").map((s: string) => s.trim())
  : schemaFile?.classes;

const allowedAttrs: string[] | undefined = opts.attributes
  ? opts.attributes.split(",").map((s: string) => s.trim())
  : schemaFile?.attributes;

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
} else if (schemaFile?.attrValues) {
  attrValuesMap = schemaFile.attrValues;
}

let taxonomy: Record<string, string[]> | undefined;
if (opts.taxonomy) {
  try {
    taxonomy = JSON.parse(opts.taxonomy);
  } catch (e) {
    console.error(
      `Error: Invalid JSON for --taxonomy: ${(e as Error).message}`,
    );
    process.exit(1);
  }
} else if (schemaFile?.taxonomy) {
  taxonomy = schemaFile.taxonomy;
}

const enableRelations = opts.relations || !!schemaFile?.relations;
const relationTypes: string[] | undefined = schemaFile?.relations || undefined;
const enableResolve = !!opts.resolve;
const enableConfidence = !!opts.includeConfidence;
const enableNegation = !!opts.detectNegation;

// === READ INPUT ===
let inputTexts: string[] = [];

if (opts.batch) {
  const batchPath = opts.batch as string;
  const stat = fs.statSync(batchPath);
  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(batchPath)
      .filter((f: string) => f.endsWith(".txt"));
    inputTexts = files.map((f: string) =>
      fs.readFileSync(path.join(batchPath, f), "utf-8").trim(),
    );
  } else {
    const content = fs.readFileSync(batchPath, "utf-8").trim();
    inputTexts = content.split("\n").map((line: string) => {
      try {
        const parsed = JSON.parse(line);
        return typeof parsed === "string" ? parsed : parsed.text || line;
      } catch {
        return line;
      }
    });
  }
} else if (opts.file) {
  const content = fs.readFileSync(opts.file, "utf-8").trim();
  inputTexts = chunkText(content, 2000);
} else {
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
      "Error: No input text provided. Pass as argument, --file, --batch, or stdin.",
    );
    process.exit(1);
  }
  inputTexts = [text];
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

// === BUILD SYSTEM PROMPT ===
function buildSystemPrompt(): string {
  if (opts.systemPrompt) return opts.systemPrompt;

  let base = SYSTEM_PROMPT;

  if (enableNegation) {
    base += `\n- Every entity has a top-level "assertion" field: "present", "negated", or "hypothetical". "negated" means the text explicitly denies it (e.g. "does not have"). "hypothetical" means it is speculative (e.g. "might develop").`;
  }
  if (enableConfidence) {
    base += `\n- Every entity has a top-level "confidence" field: "low", "medium", or "high".`;
  }
  if (enableResolve) {
    base += `\n- Every entity has a top-level "entity_id" field. If multiple text spans refer to the same real-world entity (e.g. "Dr. Chen" and "she"), they share the same entity_id. Use short IDs like "e1", "e2".`;
  }

  let prompt = `${base}\n\n${FEW_SHOT_EXAMPLES}`;

  if (opts.systemPromptAppend) {
    prompt += `\n\n${opts.systemPromptAppend}`;
  }

  return prompt;
}

// === BUILD GRAMMAR SCHEMA ===
function buildGrammarSchema() {
  // Determine allowed classes from taxonomy or explicit list
  const classEnum = taxonomy ? flattenTaxonomy(taxonomy) : allowedClasses;

  const attributesSchema: any = {
    type: "object",
    additionalProperties: { type: "string" },
  };

  const properties: any = {
    class: {
      type: "string",
      ...(classEnum && { enum: classEnum }),
    },
    text: { type: "string" },
    attributes: attributesSchema,
  };
  const required: string[] = ["class", "text"];

  // Grammar-enforced fields for enabled features.
  // These are top-level entity properties (not inside attributes)
  // so the grammar can enforce them as required on every entity.
  if (enableNegation) {
    properties.assertion = {
      type: "string",
      enum: ["present", "negated", "hypothetical"],
    };
    required.push("assertion");
  }
  if (enableConfidence) {
    properties.confidence = {
      type: "string",
      enum: ["low", "medium", "high"],
    };
    required.push("confidence");
  }
  if (enableResolve) {
    properties.entity_id = { type: "string" };
    required.push("entity_id");
  }

  const schema: any = {
    type: "array",
    items: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };

  return schema;
}

// === BUILD RELATIONS SCHEMA ===
function buildRelationsSchema() {
  const relSchema: any = {
    type: "object",
    properties: {
      entities: buildGrammarSchema(),
      relations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            relation: {
              type: "string",
              ...(relationTypes && { enum: relationTypes }),
            },
          },
          required: ["source", "target", "relation"],
          additionalProperties: false,
        },
      },
    },
    required: ["entities", "relations"],
    additionalProperties: false,
  };
  return relSchema;
}

// === BUILD PROMPT CONSTRAINTS ===
function buildConstraints(): string {
  let constraints = "";

  if (taxonomy) {
    constraints += `\n${taxonomyToPrompt(taxonomy)}`;
  } else if (allowedClasses) {
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

  if (enableNegation) {
    constraints += `\nEvery entity has an "assertion" field (not in attributes). Example: [{"class":"disease","text":"diabetes","assertion":"present","attributes":{}},{"class":"disease","text":"cancer","assertion":"negated","attributes":{}}]`;
  }
  if (enableConfidence) {
    constraints += `\nEvery entity has a "confidence" field (not in attributes). Example: [{"class":"person","text":"John","confidence":"high","attributes":{}}]`;
  }
  if (enableResolve) {
    constraints += `\nEvery entity has an "entity_id" field (not in attributes). Coreferent mentions share the same entity_id. Example: [{"class":"person","text":"Dr. Chen","entity_id":"e1","attributes":{}},{"class":"person","text":"She","entity_id":"e1","attributes":{}}]`;
  }
  if (enableRelations) {
    constraints += `\nAlso extract relations between entities. Return {"entities": [...], "relations": [{"source": "entity text", "target": "entity text", "relation": "relation type"}]}.`;
    if (relationTypes) {
      constraints += ` Allowed relation types: ${relationTypes.join(", ")}.`;
    }
  }

  return constraints;
}

// === PROCESS A SINGLE TEXT ===
async function processText(
  inputText: string,
  session: LlamaChatSession,
): Promise<any> {
  const constraints = buildConstraints();
  const prompt = `Extract all named entities from the following text.${constraints}\n\nText: ${inputText}`;

  const schema = enableRelations
    ? buildRelationsSchema()
    : buildGrammarSchema();
  const grammar = await llama.createGrammarForJsonSchema(schema);

  const res = await session.prompt(prompt, { grammar });

  let parsed: any;
  try {
    parsed = grammar.parse(res);
  } catch {
    try {
      parsed = JSON.parse(res.trim());
    } catch {
      console.error(
        "Warning: Failed to parse model output. Raw response:",
        res,
      );
      parsed = enableRelations ? { entities: [], relations: [] } : [];
    }
  }

  return parsed;
}

// === MAIN ===
const systemPrompt = buildSystemPrompt();
const compact = opts.compact || !process.stdout.isTTY;

const contextSequence = context.getSequence();

if (inputTexts.length === 1) {
  const session = new LlamaChatSession({
    contextSequence,
    systemPrompt,
  });
  const result = await processText(inputTexts[0]!, session);
  console.log(JSON.stringify(result, null, compact ? 0 : 2));
} else {
  // Batch / chunked: process each text, collect results
  const allResults: any[] = [];
  for (const inputText of inputTexts) {
    // Erase context and create fresh session for each input
    await contextSequence.eraseContextTokenRanges([
      { start: 0, end: contextSequence.nextTokenIndex },
    ]);
    const session = new LlamaChatSession({
      contextSequence,
      systemPrompt,
    });
    const result = await processText(inputText, session);
    allResults.push(result);
  }

  if (opts.file) {
    // Merge chunked results into one
    if (enableRelations) {
      const merged = {
        entities: allResults.flatMap((r) => r.entities || []),
        relations: allResults.flatMap((r) => r.relations || []),
      };
      console.log(JSON.stringify(merged, null, compact ? 0 : 2));
    } else {
      const merged = allResults.flat();
      console.log(JSON.stringify(merged, null, compact ? 0 : 2));
    }
  } else {
    // Batch: output one result per line (JSONL)
    for (const result of allResults) {
      console.log(JSON.stringify(result));
    }
  }
}

// === CLEANUP ===
// Bun segfaults if process.exit() triggers synchronous native addon unloading.
// Setting exitCode lets the event loop drain naturally, avoiding the crash.
process.exitCode = 0;
