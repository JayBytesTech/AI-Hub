
# AI Hub – Product Requirements Document (PRD)

## Overview
AI Hub is a desktop AI workstation that integrates multiple AI providers, local developer tools,
and workspace artifacts into one unified environment.

The system enables developers to:
- Interact with multiple AI models
- Analyze logs and files
- Capture terminal output
- Manage tasks and artifacts

Architecture uses:
Desktop (Tauri) → TypeScript Hub → Rust Tools Runner → Local system resources.

## Goals
Primary goals:
- Unified AI interface
- Local file and log analysis
- Embedded terminal workflows
- Workspace-based organization
- Secure execution of file and shell tools

Secondary goals:
- Support local models
- Model comparison
- AI tool execution
- Artifact reuse
- Optional calendar integration

## Core Features
1. Multi-provider AI chat
2. Workspaces mapped to local folders
3. Artifact system for outputs and files
4. Terminal integration
5. Rust tools runner
6. Task management
7. Prompt profiles

## Architecture

Desktop App (Tauri)
    ↓
TS Hub (Node + TypeScript)
    ↓
Rust Tools Runner
    ↓
Filesystem / Shell / Git

TS Hub also communicates with cloud AI providers.

## Security
Workspace folder acts as sandbox.
Rust runner validates all filesystem paths.
Shell commands require confirmation.

## Future Extensions
- Local models (Ollama, LM Studio)
- Model comparison
- Automation workflows
- Calendar integration
