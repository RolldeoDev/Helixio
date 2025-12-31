# Helixio

A web-based comic book library platform for managing and reading digital comic collections. Helixio combines powerful library management with a full-featured reader, tracking your reading progress, achievements, and statistics across your entire collection.

## Support Helixio

If Helixio has helped organize your collection, consider supporting its development. Every contribution helps fuel the developer's ever-growing comic addiction (it's for testing purposes, obviously).

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/helixiodev)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/HelixioDev)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal&logoColor=white)](https://paypal.me/HelixioDev)

## Features at a Glance

- **Read comics** - Full-featured reader with multiple viewing modes, gestures, and progress tracking
- **Manage your library** - Organize collections across multiple libraries with folder navigation
- **Fetch metadata** - Pull series and issue information from ComicVine, Metron, and Grand Comics Database
- **Track progress** - Reading history, bookmarks, continue reading, and session statistics
- **Earn achievements** - 47+ achievements across reading, collection, and discovery categories
- **Analyze stats** - Activity heatmaps, reading insights, and breakdowns by creator/publisher/genre
- **Customize themes** - 14 bundled themes with special visual effects
- **Build collections** - Favorites, Want to Read, and custom collections
- **Sync externally** - AniList and MyAnimeList integration, OPDS feeds for external readers
- **Batch operations** - Apply changes to entire series or libraries at once

## Architecture

Helixio runs as a local Node.js server accessed through your web browser.

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend                          │
│  (Reader, Library Browser, Stats Dashboard, Achievements)   │
└─────────────────────────────────────────────────────────────┘
                              │
                    Authentication + SSE
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend API                       │
│  (31 route groups, background jobs, real-time updates)      │
└─────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐
│  SQLite DB │ │ File System│ │ Metadata   │ │  External    │
│  (Prisma)  │ │ (Archives) │ │ APIs       │ │  Trackers    │
│  70+ models│ │ CBR/CBZ/PDF│ │ CV/Metron  │ │ AniList/MAL  │
└────────────┘ └────────────┘ └────────────┘ └──────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via Prisma (70+ models) |
| Real-time | Server-Sent Events (SSE) |
| Archive Operations | 7zip-bin |

## Features

### Comic Reader

A full-featured reading experience with extensive customization:

- **Reading modes**: Single page, double page (spreads), continuous scroll (webtoon)
- **Reading direction**: Left-to-right, right-to-left (manga), vertical
- **Visual controls**: Zoom, pan, rotation (0°/90°/180°/270°), image splitting
- **Color adjustments**: Brightness, contrast, color correction filters
- **Navigation**: Keyboard shortcuts, touch gestures, thumbnail strip, jump-to-page
- **Progress**: Automatic progress saving, bookmarks, reading queue
- **Adjacent navigation**: Seamlessly continue to next/previous issue

### Reading Progress & History

- Track reading progress at the page level for every comic
- Reading history with session duration tracking
- "Continue Reading" to resume where you left off
- Reading queue for planning sequential reading sessions
- Mark comics as completed/incomplete
- Per-user progress isolation in multi-user setups

### Library Management

- **Multiple libraries**: Separate collections (Comics, Manga, etc.) with different settings
- **Folder navigation**: Tree view with quick stats per folder
- **Library scanning**: Discover new or changed files with background scanning
- **Series detection**: Automatic grouping of issues into series
- **Duplicate handling**: Detect and merge duplicate series

### Metadata Management

- **Multiple sources**: ComicVine (primary), Metron, Grand Comics Database
- **LLM parsing**: Use Claude API to intelligently parse complex filenames
- **Approval workflow**: Review and approve metadata changes before applying
- **ComicInfo.xml**: Standard metadata format embedded in CBZ files
- **Series inheritance**: Metadata cascades from series to all issues
- **Tag autocomplete**: Smart suggestions for characters, teams, genres, creators

### Collections

- **System collections**: Favorites and Want to Read built-in
- **Custom collections**: Create unlimited personal collections
- **Flexible items**: Add entire series or individual issues
- **Notes**: Add personal notes to collection items
- **Quick actions**: Fast collection assignment from any view

### Achievements

Gamification system with 47+ achievements across categories:

- **Collection**: Build your library (first comic, milestones, genres)
- **Reading**: Track progress (pages read, comics completed, streaks)
- **Discovery**: Explore new content (new series, creators, time periods)
- **Mastery**: Demonstrate expertise (complete series, read classics)

Each achievement has a 1-5 star difficulty rating and progress tracking.

### Statistics Dashboard

Comprehensive analytics for your reading habits:

- **Activity heatmap**: Visual calendar of reading activity
- **Reading insights**: Time spent, pages read, completion rates
- **Streak tracking**: Current and longest reading streaks
- **Entity breakdown**: Stats by writer, artist, publisher, genre, year
- **Trend indicators**: Compare current period to historical averages

### Themes

14 bundled themes with light and dark variants:

- **Helix (Default)**: Modern sci-fi aesthetic with DNA strand effects
- **Collector's Archive**: Classic comic collection look
- **DC Comics**: DC branding theme
- **Marvel**: Marvel branding theme
- **Sandman**: Literary/artistic theme with atmospheric effects
- **Synthwave**: Retro-futuristic neon with grid effects
- **Retro**: Classic 80s/90s with CRT scan line effects
- **Manga**: Optimized for manga with paper texture effects

Custom themes can be installed in `~/.helixio/themes/`.

### Multi-User Support

- **Authentication**: User accounts with session management
- **Roles**: Admin, user, and guest access levels
- **Per-user data**: Isolated reading progress, achievements, and statistics
- **Library access**: Control which users can access which libraries

### External Integration

- **AniList/MyAnimeList**: Sync reading progress with external trackers
- **OPDS feeds**: Access your library from external readers (Chunky, Panels, etc.)
- **Shared reading lists**: Create and share reading lists with others via share codes

### Batch Operations

- **Preview changes**: Review before execution
- **Operation types**: Rename, move, convert (CBR→CBZ), metadata update, delete
- **Background processing**: Progress tracking with pause/resume
- **Rollback**: Undo changes with operation history
- **Recovery**: Resume interrupted operations after restart

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

This starts both the backend server (port 3001) and frontend dev server (port 5173). Access Helixio at `http://localhost:5173`.

### First-Time Setup

1. Open Helixio in your browser
2. Create your admin account
3. Add a library pointing to your comics folder
4. Trigger a library scan
5. Start reading!

### Configuration

Helixio stores data in `~/.helixio/`:

```
~/.helixio/
├── config.json        # App settings + API keys
├── helixio.db         # SQLite database
├── logs/              # Application logs
├── themes/            # Custom themes
└── cache/
    └── covers/        # Cached cover images
```

API keys for ComicVine and Anthropic (Claude) can be configured through Settings.

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

## Supported Formats

- **CBZ** (ZIP-based comic archives) - Full read/write support
- **CBR** (RAR-based comic archives) - Read support, can convert to CBZ
- **CB7** (7-Zip archives) - Read support
- **PDF** - Read support

## Development

See [CLAUDE.md](./CLAUDE.md) for development commands, architecture details, and contribution guidelines.

## License

Private project.
