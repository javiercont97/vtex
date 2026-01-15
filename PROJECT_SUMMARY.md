# VTeX Project Summary

## Project Overview
VTeX is a modern VS Code extension for LaTeX editing with an Overleaf-like experience. Phase 1 (MVP) is now complete with a hybrid build system, PDF preview, and auto-compilation features.

## What's Been Built

### ✅ Phase 1 Complete - Build System & Preview

#### Core Features Implemented
1. **Hybrid Build System**
   - Auto-detection of local TeX Live or Docker
   - Manual selection between local/docker/auto modes
   - Graceful fallback between build methods

2. **Build System Components**
   - Local builder using system TeX Live
   - Docker builder with containerization
   - Environment detector for system capabilities
   - Error parser for LaTeX logs
   - Support for latexmk, pdflatex, xelatex, lualatex

3. **User Interface**
   - Editor toolbar buttons for build and view PDF
   - Status bar integration
   - Command palette commands
   - Auto-build on save with debouncing
   - Output channel for detailed logs

4. **PDF Preview**
   - Integration with VS Code's native PDF viewer
   - Side-by-side viewing capability
   - Quick access via toolbar or command

5. **Configuration System**
   - Comprehensive settings for all features
   - Workspace and user-level configuration
   - Docker image customization
   - Build engine selection
   - Output preferences

## Project Structure

```
vtex/
├── src/
│   ├── extension.ts              # Main entry point, command registration
│   ├── buildSystem/
│   │   ├── builder.ts            # Build system orchestrator
│   │   ├── detector.ts           # Environment detection
│   │   ├── localBuilder.ts       # Local TeX Live builds
│   │   ├── dockerBuilder.ts      # Docker containerized builds
│   │   └── errorParser.ts        # LaTeX log parsing
│   ├── preview/
│   │   └── pdfPreview.ts         # PDF preview management
│   └── utils/
│       ├── config.ts             # Configuration management
│       └── logger.ts             # Logging utilities
├── examples/
│   ├── sample.tex                # Full test document
│   └── minimal.tex               # Minimal test document
├── docker/
│   ├── Dockerfile                # Optional custom Docker image
│   └── README.md                 # Docker documentation
├── .vscode/                      # VS Code workspace config
├── ROADMAP.md                    # Development roadmap
├── README.md                     # User documentation
├── DEVELOPMENT.md                # Developer guide
├── CHANGELOG.md                  # Version history
└── package.json                  # Extension manifest
```

## Technology Stack
- **Language**: TypeScript 5.3
- **Framework**: VS Code Extension API 1.85+
- **Build Tool**: Webpack 5
- **Linter**: ESLint with TypeScript plugin
- **Runtime**: Node.js 20+

## Available Commands

| Command | Description |
|---------|-------------|
| `VTeX: Build LaTeX Document` | Compile current .tex file |
| `VTeX: View PDF` | Open compiled PDF |
| `VTeX: Clean Auxiliary Files` | Remove build artifacts |
| `VTeX: Select Build Method` | Choose local/docker/auto |
| `VTeX: Detect Environment` | Show system information |

## Configuration Options

Key settings available in VS Code settings:

- `vtex.buildMethod`: Build system selection (auto/local/docker)
- `vtex.buildEngine`: LaTeX engine (latexmk/pdflatex/xelatex/lualatex)
- `vtex.buildOnSave`: Auto-compile on save (default: true)
- `vtex.docker.image`: Docker image to use
- `vtex.docker.enableCache`: Enable package caching
- `vtex.latexmk.options`: Custom latexmk flags
- `vtex.showOutputChannel`: Output display behavior

## How to Test

### Prerequisites
- Option 1: Install TeX Live locally
- Option 2: Install Docker (no TeX Live needed)
- Option 3: Both (extension will auto-detect)

### Testing Steps
1. Open this workspace in VS Code
2. Press `F5` to launch Extension Development Host
3. Open `examples/sample.tex` or `examples/minimal.tex`
4. Save the file (auto-builds) or use Command Palette: "VTeX: Build"
5. View the generated PDF with "VTeX: View PDF"

### Testing Build Methods
```bash
# Test local build (requires TeX Live)
# Set in VS Code: "vtex.buildMethod": "local"

# Test Docker build (requires Docker)
# Set in VS Code: "vtex.buildMethod": "docker"

# Test auto-detection
# Set in VS Code: "vtex.buildMethod": "auto"
```

## Next Steps (Phase 2)

When ready to continue development:

1. **LSP Integration**
   - Bundle or download texlab binary
   - Configure LSP client
   - Enable auto-completion and hover

2. **Enhanced Navigation**
   - Forward search (source → PDF)
   - Inverse search (PDF → source)
   - Document outline view

3. **Snippets**
   - Common LaTeX environments
   - Math symbols
   - Document templates

See [ROADMAP.md](ROADMAP.md) for complete development plan.

## Development Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile)
npm run watch

# Build production bundle
npm run package

# Lint code
npm run lint

# Run extension
# Press F5 in VS Code
```

## Key Design Decisions

1. **Hybrid Build System**: Flexibility for users with different setups
2. **Docker Isolation**: Clean, reproducible builds without system pollution
3. **Auto-detection**: Zero configuration for most users
4. **texlab LSP**: Leverage mature existing tool (Phase 2)
5. **Native PDF Viewer**: Simple, works out of the box (can enhance later)

## Performance Notes

- Build times depend on document complexity and build method
- Docker builds: ~5-30s (first run slower, cached runs faster)
- Local builds: ~1-10s (generally faster than Docker)
- Volume caching significantly improves Docker performance

## Known Limitations (MVP)

- No LSP features yet (coming in Phase 2)
- Basic error display (no inline diagnostics yet)
- No forward/inverse search yet
- No project templates yet
- Single file compilation only (multi-file support planned)

## Success Metrics (Phase 1)

✅ Extension compiles without errors
✅ Auto-detects build environment
✅ Successfully builds LaTeX documents
✅ Displays PDF output
✅ Parses and logs errors
✅ Works with both local and Docker builds
✅ Auto-builds on save
✅ Clean command removes auxiliary files

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for developer documentation.

---

**Status**: Phase 1 Complete ✅
**Next**: Phase 2 - LSP Integration & Enhanced Editing
**Last Updated**: 2026-01-15
