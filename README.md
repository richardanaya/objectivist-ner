# fastner

Fast local LLM-powered Named Entity Recognition (NER) with grammar-constrained JSON output.

Uses [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) to run a small language model locally, enforcing structured output via JSON schema grammars. No API keys, no network calls -- everything runs on your machine.

## Features

- Exact span extraction -- entity `text` is the substring from the input, not a paraphrase
- Schema-constrained output via llama.cpp grammar (guaranteed valid JSON)
- Restrict entity classes, attribute keys, and attribute values via CLI flags
- Custom system prompts for domain-specific extraction
- Three built-in model tiers: `--fast`, `--balanced`, `--best`
- Reads from argument or stdin for pipeline use
- Compact JSON output for non-TTY / piping

## Installation

```bash
bun install
```

## Usage

```bash
# Uses --best by default
bun run index.ts "the cat is blue and is feeling sad"

# Pick a model tier
bun run index.ts --fast "the cat is blue"
bun run index.ts --balanced "John works at Google in NYC"
bun run index.ts --best "complex medical research text"

# Restrict entity classes
bun run index.ts --balanced "John works at Google" --classes person,organization

# Restrict attribute keys
bun run index.ts "Alice is sad in Paris" --attributes emotional_state,location

# Restrict attribute values with enums
bun run index.ts "The sky is blue" --attr-values '{"color":["blue","red","green"]}'

# Append to the built-in system prompt
bun run index.ts "John is happy" --system-prompt-append "Focus only on emotional states"

# Replace the system prompt entirely
bun run index.ts "John is happy" --system-prompt "You are a sentiment classifier. Extract entities with sentiment."

# Read from stdin
echo "the cat is blue" | bun run index.ts

# Compact JSON output
bun run index.ts "the cat is blue" --compact
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
| `--system-prompt <string>`        | Replace the built-in system prompt entirely    |
| `--system-prompt-append <string>` | Append to the built-in system prompt           |
| `--compact`                       | Output compact JSON (auto-enabled for non-TTY) |
| `-m, --model <uri>`               | Use any GGUF model (see below)                 |

## Output Format

```json
[
  {
    "class": "animal",
    "text": "cat",
    "attributes": {
      "color": "blue",
      "emotional_state": "sad"
    }
  }
]
```

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

## Custom models

If the built-in tiers don't fit your needs, you can pass any GGUF model with `--model`. This overrides `--fast`/`--balanced`/`--best`.

```bash
# HuggingFace URI
bun run index.ts "text" --model "hf:unsloth/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf"

# Local file
bun run index.ts "text" --model ./my-custom-model.gguf
```

## License

MIT © Richard Anaya
