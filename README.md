# Helixio

A local web-based application for managing comic book collections. Helixio analyzes files on local or network drives, manages metadata, organizes files, and provides tools for batch operations on comic archives.

## What Helixio Does

Helixio is a **management tool** for digital comic collections. It helps you:

- **Convert formats** - Transform CBR files to the more widely-compatible CBZ format
- **Manage metadata** - Edit and apply ComicInfo.xml metadata to comic files
- **Fetch metadata** - Pull series and issue information from ComicVine and Metron APIs
- **Organize files** - Rename and reorganize comics according to consistent naming conventions
- **Handle duplicates** - Detect and resolve duplicate files in your collection
- **Batch operations** - Apply changes to entire folders, series, or libraries at once
- **Read comics** - Full-featured reader with multiple viewing modes and reading progress tracking

## What Helixio Is Not

- **Not a comic reader app** - While it includes a reader, the primary focus is collection management
- **Not a web service** - Runs locally on your machine, accessed via browser at localhost
- **Not multi-user** - Designed for single-user, personal collection management

## Architecture

Helixio runs as a local Node.js server that you access through your web browser.

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  (File Browser, Grid View, Metadata Editor, Batch UI)   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Node.js Backend API                     │
│  (File ops, metadata parsing, external API integration) │
└─────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│   SQLite DB  │    │  File System │    │  External APIs   │
│   (Prisma)   │    │  (Libraries) │    │ (ComicVine, etc) │
└──────────────┘    └──────────────┘    └──────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript |
| Backend | Node.js + TypeScript |
| Database | SQLite via Prisma |
| Archive Operations | 7zip-bin + node-7z |

## Features

### Library Management
- Support for multiple libraries (Comics, Manga, etc.)
- Folder tree navigation with quick stats
- Manual rescan to discover new or changed files
- Quarantine folder for corrupted files

### Metadata
- Parse folder and filenames to infer metadata using LLM (Claude API)
- Fetch from ComicVine and Metron APIs
- Edit individual files or batch update entire series
- Standard ComicInfo.xml format embedded in CBZ files
- Series-level metadata stored in series.json files

### File Organization
- Consistent naming conventions for series folders and issue files
- Support for issues, volumes, TPBs, and specials
- Event and crossover folder organization
- One-file-per-issue policy (no variant duplicates)

### Batch Operations
- Review pending changes before execution
- Approve, modify, or reject individual items
- Background processing with progress UI
- Crash recovery and resumability
- Rollback capability (10-day history)

### Comic Reader
- Multiple reading modes: single page, double page, continuous scroll
- Reading direction support (LTR, RTL, vertical)
- Image scaling options (fit to height/width/screen, original size)
- Keyboard navigation and touch gestures
- Reading progress tracking with bookmarks
- Reading queue for sequential reading sessions

## Getting Started

### Prerequisites

- Node.js 18 or higher

### Installation

```bash
npm install
```

### Running

```bash
npm run dev
```

This starts both the backend server and frontend dev server. Access Helixio at `http://localhost:3000`.

### Configuration

Helixio stores its configuration and cache in `~/.helixio/`:

```
~/.helixio/
├── config.json     ← App settings + API keys
├── helixio.db      ← SQLite database
├── logs/
└── cache/
    └── covers/     ← Cached cover images
```

API keys for ComicVine and Anthropic (Claude) can be configured through the Settings UI.

## File Naming Conventions

### Series Folders
```
Series Name (StartYear-EndYear)/
Series Name by Author (StartYear-EndYear)/
```

### Issue Files
```
Issue #001 - Title (YYYY-MM-DD).cbz
Volume 01 - Title (YYYY).cbz
Book 01 - Title (YYYY).cbz
```

### Specials
Located in a `specials/` subfolder:
```
Special - Annual YYYY (YYYY).cbz
Special - One Shot Title (YYYY).cbz
```

## License

Private project.
