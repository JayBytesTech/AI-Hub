# Obsidian Plugin Design for AI Hub

## Purpose

Create an Obsidian plugin that connects the vault to the AI Hub.

## Plugin Features

### Send Selection to AI

Right-click menu:

"Ask AI Hub"

Selected text → Hub → Response returned to editor.

### Commands

Example commands:

/summarize /explain /expand /rewrite

### Create AI Notes

Generate structured notes automatically.

Example:

"Generate summary note"

### Chat Panel

Sidebar panel allowing conversation with AI while referencing vault
notes.

## Architecture

Obsidian Plugin ↓ Local API Request ↓ AI Hub ↓ Provider Router ↓ LLM
Provider

## Advantages

-   Fast local integration
-   Keeps data inside vault
-   Seamless workflow
