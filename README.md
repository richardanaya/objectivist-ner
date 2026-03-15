# objectivist-ner

Objectivist-inspired Named Entity Recognition with grammar-constrained LLM output.

Uses [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) to run a small language model locally, enforcing structured output via JSON schema grammars. No API keys, no network calls -- everything runs on your machine.

The CLI is installed as the `ner` command.

## Features

- Exact span extraction -- entity `text` is the substring from the input, not a paraphrase
- Schema-constrained output via llama.cpp grammar (guaranteed valid JSON)
- Restrict entity classes, attribute keys, and attribute values
- Hierarchical class taxonomies
- Relation extraction between entities
- Coreference resolution (group mentions of the same entity)
- Negation and modality detection
- Confidence scores
- Schema definition files for reusable ontologies
- Long document chunking with `--file`
- Batch processing with `--batch`
- Three built-in model tiers: `--fast`, `--balanced`, `--best`
- Reads from argument, file, or stdin
- Compact JSON output for non-TTY / piping

## Installation

```bash
# Local development
bun install

# Install globally as the `ner` command
bun install -g objectivist-ner
```

After global install, use the `ner` command directly.

## Usage

```bash
# Uses --best (4B) by default
ner "the cat is blue and is feeling sad"

# Pick a model tier
ner --fast "the cat is blue"
ner --balanced "John works at Google in NYC"
ner --best "complex medical research text"
```

### Entity constraints

```bash
# Restrict entity classes
ner "John works at Google" --classes person,organization

# Restrict attribute keys
ner "Alice is sad in Paris" --attributes emotional_state,location

# Restrict attribute values with enums
ner "The sky is blue" --attr-values '{"color":["blue","red","green"]}'

# Hierarchical class taxonomy
ner "Dr. Chen lives in Boston with her cat" \
  --taxonomy '{"organism":["person","animal"],"place":["city","country"]}'
```

### Relation extraction

```bash
ner --relations "Dr. Chen works at MIT and collaborates with Prof. Wright"
```

Output:

```json
{
  "entities": [
    { "class": "person", "text": "Dr. Chen", "attributes": {} },
    { "class": "organization", "text": "MIT", "attributes": {} },
    { "class": "person", "text": "Prof. Wright", "attributes": {} }
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

### Coreference resolution

```bash
ner --resolve "Dr. Chen published a paper. She later won the Nobel Prize. The neurologist was celebrated."
```

Output:

```json
[
  {
    "class": "person",
    "text": "Dr. Chen",
    "attributes": {},
    "entity_id": "e1"
  },
  { "class": "person", "text": "She", "attributes": {}, "entity_id": "e1" },
  {
    "class": "person",
    "text": "The neurologist",
    "attributes": {},
    "entity_id": "e1"
  },
  {
    "class": "event",
    "text": "the Nobel Prize",
    "attributes": {},
    "entity_id": "e2"
  }
]
```

`entity_id` is a grammar-enforced top-level field, not inside `attributes`.

### Negation detection

```bash
ner --detect-negation "The patient has diabetes but does not have cancer. He might develop hypertension."
```

### Confidence scores

```bash
ner --include-confidence "Dr. Maria Chen works at MIT. Someone named Bob might be there too."
```

### Schema definition files

Define your ontology in a JSON file and reuse it:

```json
{
  "taxonomy": {
    "organism": ["person", "animal"],
    "place": ["city", "country", "building"],
    "institution": ["company", "university", "government_agency"]
  },
  "attributes": ["role", "age", "location", "affiliation"],
  "relations": ["works_at", "located_in", "affiliated_with"]
}
```

```bash
ner --schema schema.json "Dr. Chen works at MIT in Boston"
```

Schema files support `taxonomy`, `classes`, `attributes`, `attrValues`, and `relations`. CLI flags override schema file values.

### File and batch processing

```bash
# Process a long document (auto-chunked)
ner --file document.txt

# Process a JSONL file (one text per line, outputs JSONL)
ner --batch inputs.jsonl

# Process a directory of .txt files
ner --batch ./documents/
```

### Other options

```bash
# Append to the built-in system prompt
ner "text" --system-prompt-append "Focus only on emotions"

# Replace the system prompt entirely
ner "text" --system-prompt "You are a custom extractor."

# Read from stdin
echo "the cat is blue" | ner

# Compact JSON output
ner "the cat is blue" --compact
```

## Models

fastner ships with three built-in model tiers. Pick one with a flag -- the model is downloaded automatically on first use to `~/.fastner/models/`.

| Flag         | Model             | Size | Download | Best for                        |
| ------------ | ----------------- | ---- | -------- | ------------------------------- |
| `--fast`     | Qwen3.5-0.8B Q8_0 | 0.8B | ~0.9 GB  | Simple text, single entities    |
| `--balanced` | Qwen3.5-2B Q8_0   | 2B   | ~2.3 GB  | Moderate complexity, most tasks |
| `--best`     | Qwen3.5-4B Q8_0   | 4B   | ~4.5 GB  | Dense text, rare entity types   |

`--best` is the default. See [Benchmarks](#benchmarks) for why.

## Options

| Flag                              | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `--fast`                          | Use 0.8B model -- quick, simple text only      |
| `--balanced`                      | Use 2B model -- good accuracy/speed tradeoff   |
| `--best`                          | Use 4B model -- best accuracy (default)        |
| `-c, --classes <list>`            | Comma-separated allowed entity classes         |
| `-a, --attributes <list>`         | Comma-separated allowed attribute keys         |
| `--attr-values <json>`            | JSON enum map for attribute values             |
| `--taxonomy <json>`               | Class hierarchy JSON                           |
| `--relations`                     | Extract relations between entities             |
| `--resolve`                       | Resolve coreferences                           |
| `--include-confidence`            | Include confidence scores per entity           |
| `--detect-negation`               | Detect negated/hypothetical entities           |
| `--schema <path>`                 | Load schema definition from JSON file          |
| `--file <path>`                   | Read input from file (with chunking)           |
| `--batch <path>`                  | Process JSONL file or directory of .txt files  |
| `--system-prompt <string>`        | Replace the built-in system prompt entirely    |
| `--system-prompt-append <string>` | Append to the built-in system prompt           |
| `--compact`                       | Output compact JSON (auto-enabled for non-TTY) |
| `-m, --model <uri>`               | Use any GGUF model (see below)                 |

## Benchmarks

We tested all three tiers against a complex input containing 11 entities across 6 classes (person, organization, location, disease, drug, event):

> "Dr. Maria Chen, a 42-year-old neurologist at Massachusetts General Hospital in Boston, published a groundbreaking paper with her colleague Prof. James Wright from Oxford University about a rare genetic mutation called BRCA3-delta found in 12 patients from rural Bangladesh, while simultaneously consulting for Pfizer on their new drug Nexavion priced at 450 dollars per dose, which the WHO classified as a Category A essential medicine last Tuesday during their Geneva summit"

| Entity             | `--fast`   | `--balanced` | `--best` (default)       |
| ------------------ | ---------- | ------------ | ------------------------ |
| Dr. Maria Chen     | person     | person       | person                   |
| Prof. James Wright | person     | person       | person, role: colleague  |
| MGH                | -          | org          | org                      |
| Oxford University  | -          | org          | org                      |
| BRCA3-delta        | -          | disease      | disease                  |
| Bangladesh         | -          | -            | location                 |
| Pfizer             | -          | org          | org                      |
| Nexavion           | -          | drug         | drug, price: 450 dollars |
| WHO                | -          | -            | org, category: Cat A     |
| Geneva summit      | -          | event        | location                 |
| Boston             | location   | -            | location                 |
| **Entities found** | **3 / 11** | **8 / 11**   | **11 / 11**              |

All three tiers produce zero hallucinations with the current prompt design.

## Epistemological design

fastner's feature set is informed by Objectivist epistemology -- the theory that concepts are formed by abstracting essential characteristics from concretes, organized into hierarchical structures, and held in a specific relationship to reality.

### Identity: A is A (`--resolve`)

The law of identity demands that we track _what a thing is_ across all its references. When a text says "Dr. Chen", "she", and "the neurologist", these are three linguistic expressions of one entity. Without coreference resolution, an NER system treats them as three unrelated extractions -- a failure to maintain identity. `--resolve` enforces that A remains A regardless of how it is named.

### Hierarchical concept formation (`--taxonomy`)

Objectivist epistemology holds that concepts are organized hierarchically through a process of abstraction. "Cat" is subsumed under "animal", which is subsumed under "organism". Each level retains the essential characteristics of its parent while adding differentia. The `--taxonomy` flag mirrors this structure directly -- you define genus-species relationships between entity classes, and the model classifies at the most specific level it can justify. This isn't just organization; it's how valid concepts are formed.

### Distinguishing existence from assertion (`--detect-negation`)

A concept must be connected to reality. "The patient has diabetes" and "the patient does not have diabetes" both contain the entity "diabetes", but their relationship to existence is opposite. Naive NER systems that extract "diabetes" from both sentences without distinguishing assertion from negation commit a fundamental error -- they detach the concept from its existential status. `--detect-negation` forces every entity to declare its relationship to reality: present, negated, or hypothetical.

### Certainty and the hierarchy of evidence (`--include-confidence`)

Knowledge exists on a spectrum from certain to speculative. "Dr. Maria Chen" appearing with a full name and title is a high-confidence extraction. "Someone named Bob" is low-confidence. Objectivism rejects both dogmatism (asserting certainty where none exists) and skepticism (denying certainty where it does). `--include-confidence` makes the epistemic status of each extraction explicit, letting downstream systems apply appropriate thresholds.

### Relations as conceptual integration (`--relations`)

Entities don't exist in isolation. The relationship "Dr. Chen works at MIT" is not a property of Chen or of MIT alone -- it's a fact about reality that connects two existents. Extracting entities without their relations is like forming concepts without integrating them into propositions. `--relations` extracts the connective tissue between entities, producing a knowledge graph rather than an isolated list.

### Schema files as objective definitions (`--schema`)

Definitions, in Objectivist epistemology, identify the essential characteristics that distinguish a concept from all others. A schema file serves this function for NER: it defines your ontology once -- the class hierarchy, the valid attributes, the relation types -- and applies it consistently across all extractions. This is the difference between ad-hoc classification and principled concept formation.

### Grammar enforcement as logical constraint

Several fields (`assertion`, `confidence`, `entity_id`, `class` enums) are enforced at the grammar level, not merely prompted. The model literally cannot produce an invalid value. This is the computational equivalent of the principle that contradictions cannot exist -- the system's structure makes certain errors impossible rather than merely unlikely.

## Custom models

If the built-in tiers don't fit your needs, you can pass any GGUF model with `--model`. This overrides `--fast`/`--balanced`/`--best`.

```bash
# HuggingFace URI
ner "text" --model "hf:unsloth/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf"

# Local file
ner "text" --model ./my-custom-model.gguf
```

## License

MIT © Richard Anaya
