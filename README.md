# objectivist-ner

Most Named Entity Recognition tools treat language as a bag of words to be statistically tagged.

This tool takes a different approach.

It is built on the Objectivist recognition that concepts are not arbitrary labels — they are integrations of observed reality, formed by identifying essential characteristics and omitting measurements. A valid concept must be grounded in percepts, organized hierarchically, and maintain identity across contexts.

That is why `objectivist-ner` emphasizes:

- **Exact entity spans** — because a concept must refer to something specific in reality, not a loose paraphrase or abstraction
- **Hierarchical classification** — because proper concept formation requires understanding genus and differentia, not flat tag lists
- **Negation detection** — because the relationship of a concept to existence (asserted, denied, or hypothetical) is epistemologically essential
- **Confidence ratings** — because knowledge is hierarchical; some identifications are more certain than others
- **Coreference resolution** — because the law of identity demands we recognize the same existent across multiple descriptions ("Dr. Chen", "she", "the neurologist")

In short, this is an attempt to make the extraction of entities philosophically responsible — to extract knowledge in a way that can later be integrated into principles and actions, rather than producing disconnected fragments.

It runs completely locally using a small language model. No API keys. No data leaves your machine. The CLI is installed as the simple `ner` command.

### A Concrete Example

Consider this sentence:

> "The patient has diabetes but does not have cancer. He might develop hypertension."

**Typical NER is blind to assertion level.**

It will usually return something like this:

```json
[
  { "entity": "diabetes", "type": "DISEASE" },
  { "entity": "cancer", "type": "DISEASE" },
  { "entity": "hypertension", "type": "DISEASE" }
]
```

It sees three diseases — and stops there. It has no understanding that the text is making three completely different claims about reality.

**objectivist-ner** produces output that respects the relationship between concepts and existence:

```json
[
  { "class": "disease", "text": "diabetes", "assertion": "present" },
  { "class": "disease", "text": "cancer", "assertion": "negated" },
  { "class": "disease", "text": "hypertension", "assertion": "hypothetical" }
]
```

The `assertion` field tells you the **relationship to reality** the text is claiming:

- **`present`** — the text says it exists
- **`negated`** — the text explicitly denies it
- **`hypothetical`** — the text is speaking speculatively ("might", "could")

This prevents the philosophical error of treating a denied concept the same as an asserted one.

### Same Entity Recognition

Now consider this sentence:

> "Dr. Chen is a brilliant neurologist. She later admitted her treatment was not as effective as claimed. The neurologist now recommends a different approach."

**Typical NER** sees three separate people:

```json
[
  { "entity": "Dr. Chen", "type": "PERSON" },
  { "entity": "She", "type": "PERSON" },
  { "entity": "The neurologist", "type": "PERSON" }
]
```

**objectivist-ner** with `--resolve` understands they are the same person:

```json
[
  {
    "class": "person",
    "text": "Dr. Chen",
    "attributes": {},
    "entity_id": "e1",
    "is_canonical": true
  },
  {
    "class": "person",
    "text": "She",
    "attributes": {},
    "entity_id": "e1",
    "is_canonical": false
  },
  {
    "class": "person",
    "text": "The neurologist",
    "attributes": {},
    "entity_id": "e1",
    "is_canonical": false
  }
]
```

This is the law of identity applied to language: **A is A**, even when referred to in different ways.

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
bun install -g objectivist-ner
```

After installation, use the `ner` command directly.

## Usage

```bash
# Default mode (best quality)
ner "the cat is blue and is feeling sad"
```

```json
[
  {
    "class": "animal",
    "text": "cat",
    "attributes": { "color": "blue", "emotional_state": "sad" }
  }
]
```

```bash
# Choose quality vs speed
ner --fast "the cat is blue"
ner --balanced "John works at Google in NYC"
ner --best "complex medical research text"
```

### Entity constraints

```bash
# Restrict entity classes
ner "John works at Google" --classes person,organization
```

```json
[
  { "class": "person", "text": "John", "attributes": {} },
  { "class": "organization", "text": "Google", "attributes": {} }
]
```

```bash
# Restrict attribute keys
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

```bash
# Restrict attribute values with enums
ner "The sky is blue" --attr-values '{"color":["blue","red","green"]}'
```

```json
[{ "class": "object", "text": "sky", "attributes": { "color": "blue" } }]
```

```bash
# Hierarchical class taxonomy
ner \
  --taxonomy '{"organism":["person","animal"],"animal":["dog","cat"]}' \
  "The golden retriever was playing in the park with the child."
```

```json
[
  {
    "class": "person",
    "text": "child",
    "attributes": {},
    "taxonomyPath": ["organism", "person"]
  },
  {
    "class": "dog",
    "text": "golden retriever",
    "attributes": { "color": "golden" },
    "taxonomyPath": ["organism", "animal", "dog"]
  }
]
```

When using `--taxonomy`, the model is only allowed to choose from the most specific (**leaf**) classes. The `class` field contains the leaf node, and `taxonomyPath` shows the full hierarchy from root to leaf.

This reflects Objectivist concept formation: identify at the proper level of specificity, while preserving the hierarchical structure of knowledge (genus and differentia).

### Relations (Conceptual Integration)

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

Relations show how entities connect—extracting the "connective tissue" between concepts. "Dr. Chen works at MIT" is not a property of Chen or MIT alone; it is a fact about reality that integrates two existents into a proposition.

This demonstrates **conceptual integration**: concepts do not exist in isolation, they form a connected structure of knowledge.

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
    "entity_id": "e1",
    "is_canonical": true
  },
  {
    "class": "person",
    "text": "She",
    "attributes": {},
    "entity_id": "e1",
    "is_canonical": false
  },
  {
    "class": "person",
    "text": "The neurologist",
    "attributes": {},
    "entity_id": "e1",
    "is_canonical": false
  },
  {
    "class": "event",
    "text": "the Nobel Prize",
    "attributes": {},
    "entity_id": "e2",
    "is_canonical": true
  }
]
```

`entity_id` groups coreferent mentions. `is_canonical` marks the most specific reference (proper names over pronouns or descriptions).

### Negation detection

```bash
ner --detect-negation "The patient has diabetes but does not have cancer. He might develop hypertension."
```

```json
[
  {
    "class": "disease",
    "text": "diabetes",
    "attributes": {},
    "assertion": "present"
  },
  {
    "class": "disease",
    "text": "cancer",
    "attributes": {},
    "assertion": "negated"
  },
  {
    "class": "disease",
    "text": "hypertension",
    "attributes": {},
    "assertion": "hypothetical"
  }
]
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

fastner ships with three built-in quality tiers. Pick one with a flag -- the model is downloaded automatically on first use to `~/.fastner/models/`.

| Flag         | Size   | Download | Best for                        |
| ------------ | ------ | -------- | ------------------------------- |
| `--fast`     | Small  | ~0.9 GB  | Simple text, single entities    |
| `--balanced` | Medium | ~2.3 GB  | Moderate complexity, most tasks |
| `--best`     | Large  | ~4.5 GB  | Dense text, rare entity types   |

`--best` is the default. See [Benchmarks](#benchmarks) for why.

## Options

| Flag                              | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `--fast`                          | Use smallest model -- quick, simple text only      |
| `--balanced`                      | Use mid-size model -- good accuracy/speed tradeoff |
| `--best`                          | Use largest model -- best accuracy (default)       |
| `-c, --classes <list>`            | Comma-separated allowed entity classes             |
| `-a, --attributes <list>`         | Comma-separated allowed attribute keys             |
| `--attr-values <json>`            | JSON enum map for attribute values                 |
| `--taxonomy <json>`               | Class hierarchy JSON                               |
| `--relations`                     | Extract relations between entities                 |
| `--resolve`                       | Resolve coreferences                               |
| `--include-confidence`            | Include confidence scores per entity               |
| `--detect-negation`               | Detect negated/hypothetical entities               |
| `--schema <path>`                 | Load schema definition from JSON file              |
| `--file <path>`                   | Read input from file (with chunking)               |
| `--batch <path>`                  | Process JSONL file or directory of .txt files      |
| `--system-prompt <string>`        | Replace the built-in system prompt entirely        |
| `--system-prompt-append <string>` | Append to the built-in system prompt               |
| `--compact`                       | Output compact JSON (auto-enabled for non-TTY)     |
| `-m, --model <uri>`               | Use any GGUF model (see below)                     |

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

## Building Up Knowledge

fastner is designed as a tool for the Objectivist project of building knowledge from percepts through concepts to principles and finally to action — the exact process implemented in the companion project **[objectivist-lattice](https://github.com/richardanaya/objectivist-lattice)**.

### The Epistemological Pipeline

Objectivism holds that all knowledge begins with **percepts** (raw sensory data), which are integrated into **concepts**, which are organized into **principles** (general truths), which are finally applied as **actions** in specific contexts.

`objectivist-lattice` enforces this hierarchy strictly on a filesystem of Markdown files with validation rules:

- **Axioms** and **percepts** are bedrock — they have no `reduces_to` links
- **Principles** must reduce to axioms or percepts
- **Applications** must reduce to principles
- Promotion from `Tentative/Hypothesis` to `Integrated/Validated` can only happen bottom-up

### How NER Helps Build the Lattice

fastner acts as the **percept-to-concept extraction layer** for this system:

1. **Percept Extraction** (`--detect-negation`)
   - Identifies concrete entities from source material (books, articles, personal observations)
   - Distinguishes what is asserted as present, negated, or hypothetical
   - Feeds raw perceptual data into the `02-Percepts/` directory

2. **Concept Formation** (`--classes`, `--taxonomy`, `--resolve`)
   - Groups multiple mentions of the same entity (`entity_id`)
   - Classifies entities into hierarchical taxonomies (`organism > person > neurologist`)
   - Maintains identity across contexts — "Dr. Chen", "she", and "the neurologist" are recognized as the same existent

3. **Principle Discovery** (`--relations`, `--schema`)
   - Extracts relations between entities ("works at", "causes", "implies")
   - Uses schema files to enforce your ontological commitments
   - Surfaces potential principles by showing what consistently reduces to what

4. **Action Guidance** (`--include-confidence`)
   - Rates confidence in each extraction
   - Helps distinguish high-certainty principles (suitable for action) from speculative ones (still tentative)

### Practical Workflow

```bash
# Extract entities from a book chapter
ner --file chapter1.txt --detect-negation --resolve --include-confidence > percepts.json

# Convert to lattice format
cat percepts.json | jq '.[] | {title: .text, level: "percept", proposition: (.text + " was observed")}' > 02-Percepts/20260315-percept-001.md

# Later, when forming principles
ner --relations --schema ontology.json "text from multiple chapters" > principles.json
```

The combination of **objectivist-ner** (extraction) and **objectivist-lattice** (validation and organization) creates a complete pipeline:

**Percepts → Concepts → Principles → Validated Knowledge → Action**

This is not just information extraction. It is epistemological engineering — using computation to enforce the proper hierarchical structure of knowledge, preventing floating abstractions and ensuring every principle is grounded in percepts and axioms.

The grammar-enforced fields (`assertion`, `confidence`, `entity_id`) are not arbitrary features. They are computational implementations of fundamental epistemological requirements: every concept must have a relationship to reality, every claim must have an epistemic status, and identity must be maintained across contexts.

See the [objectivist-lattice](https://github.com/richardanaya/objectivist-lattice) repository for the validation and knowledge management layer that pairs with this tool.

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

```

```
