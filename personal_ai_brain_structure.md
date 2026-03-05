# Personal AI Brain Vault Design

## Concept

Your vault becomes the **long-term memory system** for your AI Hub.

AI systems read from this structure before generating responses.

## Core Structure

AI/ ├─ Memory/ │ ├─ Preferences.md │ ├─ Skills.md │ └─ Tools.md │ ├─
Projects/ │ └─ Active/ │ ├─ Knowledge/ │ ├─ Programming │ ├─ AI │ └─
Systems Design │ └─ Conversations/

## Memory Files

### Preferences.md

Example:

User prefers: - Rust for backend tooling - TypeScript for
orchestration - Local-first software design

### Skills.md

Tracks areas of expertise.

Example:

Programming: - Rust - TypeScript - Systems architecture

## How AI Uses This

Before answering questions the hub:

1.  Reads memory files
2.  Retrieves relevant notes
3.  Injects them into the prompt

This produces **highly personalized responses**.
