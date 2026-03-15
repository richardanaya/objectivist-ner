# objectivist-ner

Most Named Entity Recognition tools treat language as a bag of words to be statistically tagged.

This tool takes a different approach.

It is built on the Objectivist recognition that concepts are not arbitrary labels — they are integrations of observed reality, formed by identifying essential characteristics and omitting measurements. A valid concept must be grounded in percepts, organized hierarchically, and maintain identity across contexts.

That is why `objectivist-ner` emphasizes:

- **Exact entity spans** — because a concept must refer to something specific in reality
- **Hierarchical classification** — because proper concept formation requires understanding genus and differentia
- **Negation detection** — because the relationship of a concept to existence is epistemologically essential
- **Coreference resolution** — because the law of identity demands we recognize the same existent across multiple descriptions
- **Relations** — because concepts do not exist in isolation, they integrate into propositions

It runs completely locally using a small language model. No API keys. No data leaves your machine.

## What Makes This Different

### 1. Assertion vs Negation vs Hypothetical

> "The patient has diabetes but does not have cancer. He might develop hypertension."

**Typical NER** sees three diseases. **objectivist-ner** sees three different relationships to reality:

```bash
ner --detect-negation "The patient has diabetes but does not have cancer. He might develop hypertension."
```

```json
[
  { "class": "disease", "text": "diabetes", "assertion": "present" },
  { "class": "disease", "text": "cancer", "assertion": "negated" },
  { "class": "disease", "text": "hypertension", "assertion": "hypothetical" }
]
```

The `assertion` field tells you whether the text claims something is **present**, **negated**, or **hypothetical**.

### 2. Identity Across References

> "Dr. Chen published a paper. She later won the Nobel Prize. The neurologist was celebrated."

**Typical NER** sees three separate people. **objectivist-ner** knows they are the same person:

```bash
ner --resolve "Dr. Chen published a paper. She later won the Nobel Prize. The neurologist was celebrated."
```

```json
[
  {
    "class": "person",
    "text": "Dr. Chen",
    "entity_id": "e1",
    "is_canonical": true
  },
  {
    "class": "person",
    "text": "She",
    "entity_id": "e1",
    "is_canonical": false
  },
  {
    "class": "person",
    "text": "The neurologist",
    "entity_id": "e1",
    "is_canonical": false
  },
  {
    "class": "event",
    "text": "the Nobel Prize",
    "entity_id": "e2",
    "is_canonical": true
  }
]
```

`entity_id` groups coreferent mentions. `is_canonical` marks the most specific reference.

### 3. Hierarchical Classification

```bash
ner --taxonomy '{"organism":["person",{"animal":["dog","cat"]}],"idea":["dream","principle"]}' \
  "The golden retriever was playing with the child."
```

```json
[
  {
    "class": "dog",
    "text": "golden retriever",
    "taxonomyPath": ["organism", "animal", "dog"]
  },
  {
    "class": "person",
    "text": "child",
    "taxonomyPath": ["organism", "person"]
  }
]
```

The model classifies at the most specific (leaf) level, and `taxonomyPath` preserves the full hierarchy.

### 4. Conceptual Integration (Relations)

```bash
ner --relations "Dr. Chen works at MIT and collaborates with Prof. Wright"
```

```json
{
  "entities": [
    { "class": "person", "text": "Dr. Chen" },
    { "class": "organization", "text": "MIT" },
    { "class": "person", "text": "Prof. Wright" }
  ],
  "relations": [
    { "source": "Dr. Chen", "target": "MIT", "relation": "works at" },
    {
      "source": "Dr. Chen",
      "target": "Prof. Wright",
      "relation": "collaborates with"
    }
  ]
}
```

Relations show how entities connect — extracting the "connective tissue" between concepts.

## Installation

```bash
bun install -g objectivist-ner
```

## Quick Start

```bash
# Basic extraction
ner "the cat is blue and is feeling sad"

# Choose quality vs speed
ner --fast "simple text"
er --balanced "moderate text"
er --best "complex text"
```

## Usage Examples

### Constrain entity classes

```bash
ner "John works at Google" --classes person,organization
```

```json
[
  { "class": "person", "text": "John" },
  { "class": "organization", "text": "Google" }
]
```

### Constrain attribute keys

```bash
ner "Alice is sad in Paris" --attributes emotional_state,location
```

```json
[
  {
    "class": "person",
    "text": "Alice",
    "attributes": { "emotional_state": "sad", "location": "Paris" }
  }
]
```

### Constrain attribute values

```bash
ner "The sky is blue" --attr-values '{"color":["blue","red","green"]}'
```

```json
[
  {
    "class": "object",
    "text": "sky",
    "attributes": { "color": "blue" }
  }
]
```

### Schema files

Define your ontology once and reuse it:

```json
{
  "taxonomy": {
    "organism": ["person", "animal"],
    "animal": ["dog", "cat"]
  },
  "attributes": ["role", "location"],
  "relations": ["works_at", "collaborates_with"]
}
```

```bash
ner --schema ontology.json "Dr. Chen works at MIT"
```

### File and batch processing

```bash
# Process a long document (auto-chunked)
ner --file document.txt

# Process a JSONL file
ner --batch inputs.jsonl

# Process a directory of .txt files
ner --batch ./documents/
```

### Read from stdin

```bash
echo "the cat is blue" | ner
cat article.txt | ner --detect-negation
```

## Model Tiers

| Flag         | Size   | Download | Best for                        |
| ------------ | ------ | -------- | ------------------------------- |
| `--fast`     | Small  | ~0.9 GB  | Simple text, single entities    |
| `--balanced` | Medium | ~2.3 GB  | Moderate complexity, most tasks |
| `--best`     | Large  | ~4.5 GB  | Dense text, rare entity types   |

`--best` is the default. See [Benchmarks](#benchmarks).

## Options Reference

| Flag                              | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `--fast`                          | Use smallest model                                 |
| `--balanced`                      | Use mid-size model                                 |
| `--best`                          | Use largest model (default)                        |
| `-c, --classes <list>`            | Allowed entity classes                             |
| `-a, --attributes <list>`         | Allowed attribute keys                             |
| `--attr-values <json>`            | Enum map for attribute values                      |
| `--taxonomy <json>`               | Class hierarchy (parent → children)                |
| `--relations`                     | Extract relations between entities                 |
| `--resolve`                       | Resolve coreferences (adds entity_id)              |
| `--detect-negation`               | Add assertion field (present/negated/hypothetical) |
| `--include-confidence`            | Add confidence field (low/medium/high)             |
| `--schema <path>`                 | Load schema from JSON file                         |
| `--file <path>`                   | Read from file (with chunking)                     |
| `--batch <path>`                  | Process JSONL file or directory                    |
| `--system-prompt <string>`        | Replace system prompt                              |
| `--system-prompt-append <string>` | Append to system prompt                            |
| `--compact`                       | Compact JSON output                                |
| `-m, --model <uri>`               | Use custom GGUF model                              |

## Benchmarks

Tested on a complex input with 11 entities across 6 classes:

| Entity             | `--fast` | `--balanced` | `--best`  |
| ------------------ | -------- | ------------ | --------- |
| Dr. Maria Chen     | person   | person       | person    |
| Prof. James Wright | person   | person       | person    |
| MGH                | —        | org          | org       |
| Oxford University  | —        | org          | org       |
| BRCA3-delta        | —        | disease      | disease   |
| Bangladesh         | —        | —            | location  |
| Pfizer             | —        | org          | org       |
| Nexavion           | —        | drug         | drug      |
| WHO                | —        | —            | org       |
| Geneva summit      | —        | event        | location  |
| Boston             | location | —            | location  |
| **Found**          | **3/11** | **8/11**     | **11/11** |

## Integration with objectivist-lattice

This tool is designed to work with **[objectivist-lattice](https://github.com/richardanaya/objectivist-lattice)** — a knowledge management system that enforces the Objectivist hierarchy: percepts → concepts → principles → actions.

**objectivist-ner** extracts the percepts and concepts. **objectivist-lattice** validates and organizes them into principles you can act on.

### Workflow

```bash
# Extract structured observations from text
ner --file chapter1.txt --detect-negation --resolve > percepts.json

# Import into your knowledge lattice
# (See objectivist-lattice documentation for details)
```

## Epistemological Design

Each feature maps to an Objectivist principle:

- **`--resolve`** — The law of identity (A is A)
- **`--taxonomy`** — Hierarchical concept formation (genus and differentia)
- **`--detect-negation`** — Grounding concepts in reality (existence vs non-existence)
- **`--relations`** — Conceptual integration (concepts form connected propositions)
- **Grammar enforcement** — Non-contradiction (structure prevents invalid values)

## Custom Models

Use any GGUF model:

```bash
ner "text" --model "hf:unsloth/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf"
ner "text" --model ./my-model.gguf
```
