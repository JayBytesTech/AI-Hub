# AI Hub ↔ Obsidian System Architecture

## System Overview

The AI Hub communicates with the Obsidian vault to provide memory and
knowledge retrieval.

User ↓ AI Hub Interface ↓ Agent System ↓ Tool System ↓ Obsidian Vault

## Tool Layer

Example tools available to agents:

obsidian.read_note obsidian.write_note obsidian.search
obsidian.link_notes

## Data Flow Example

User question:

"What do my notes say about Rust async?"

Hub Process:

1.  Vector search vault
2.  Retrieve top notes
3.  Inject into prompt
4.  Generate response

## Future Architecture

Vault Markdown ↓ Embedding Model ↓ Vector Database ↓ AI Hub Retrieval ↓
LLM Response

## Benefits

-   Personal knowledge integration
-   Long-term AI memory
-   Context-aware assistants
