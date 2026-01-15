# VTeX - Modern LaTeX Extension for VS Code

A modern, Overleaf-like LaTeX editing experience for VS Code with hybrid build system support.

## Features

### Phase 1 (Current - MVP)
- ✅ **Hybrid Build System**: Automatically detects local TeX Live or uses Docker
- ✅ **Flexible Build Methods**: Choose between local, Docker, or auto-detection
- ✅ **Multiple Engines**: Support for latexmk, pdflatex, xelatex, and lualatex
- ✅ **Auto-build on Save**: Automatically compile your documents when you save
- ✅ **Error Parsing**: Extract and display LaTeX errors and warnings
- ✅ **PDF Preview**: View your compiled PDFs directly in VS Code
- ✅ **Docker Cache**: Persistent package cache for faster Docker builds
- ✅ **Clean Command**: Remove auxiliary files with one click

## Requirements

### Local Build
- TeX Live (or MikTeX/MacTeX) installed on your system
- Recommended: `latexmk` for best build experience

### Docker Build
- Docker installed and running
- No LaTeX installation required (uses containerized TeXLive)

## Installation

### From Source (Development)
1. Clone this repository
2. Run `npm install` to install dependencies
3. Press F5 in VS Code to launch the extension in a new window

### From VSIX (Coming Soon)
- Install from VS Code Marketplace (not yet published)

## Usage

### Quick Start
1. Open a `.tex` file
2. The extension will automatically detect your LaTeX environment
3. Press `Ctrl+S` (or `Cmd+S` on Mac) to save and build
4. Use the status bar button or Command Palette (`VTeX: Build LaTeX Document`) to build manually
5. Click the PDF icon in the editor toolbar to view the compiled PDF

### Commands

- **VTeX: Build LaTeX Document** - Compile the current LaTeX document
- **VTeX: View PDF** - Open the compiled PDF
- **VTeX: Clean Auxiliary Files** - Remove intermediate build files
- **VTeX: Select Build Method** - Choose between local, Docker, or auto-detection
- **VTeX: Detect Environment** - Show information about available LaTeX environments

### Configuration

Access settings via VS Code settings (`Ctrl+,` or `Cmd+,`) and search for "VTeX":

#### Build Method
```json
"vtex.buildMethod": "auto"  // Options: "auto", "local", "docker"
```
- `auto`: Automatically detect and use available system (local first, then Docker)
- `local`: Force use of local TeX Live installation
- `docker`: Force use of Docker containerized build

#### Build Engine
```json
"vtex.buildEngine": "latexmk"  // Options: "latexmk", "pdflatex", "xelatex", "lualatex"
```

#### Docker Settings
```json
"vtex.docker.image": "texlive/texlive:latest",
"vtex.docker.enableCache": true  // Cache packages in Docker volume
```

#### Auto-build
```json
"vtex.buildOnSave": true  // Build automatically when saving .tex files
```

#### Advanced Options
```json
"vtex.latexmk.options": [
    "-pdf",
    "-interaction=nonstopmode",
    "-synctex=1",
    "-file-line-error"
],
"vtex.showOutputChannel": "onError"  // Options: "never", "onError", "always"
```

## Project Structure

```
vtex/
├── src/
│   ├── extension.ts           # Main entry point
│   ├── buildSystem/
│   │   ├── builder.ts         # Build system orchestrator
│   │   ├── detector.ts        # Environment detection
│   │   ├── localBuilder.ts    # Local TeX Live builder
│   │   ├── dockerBuilder.ts   # Docker builder
│   │   └── errorParser.ts     # LaTeX log parser
│   ├── preview/
│   │   └── pdfPreview.ts      # PDF preview management
│   └── utils/
│       ├── config.ts          # Configuration manager
│       └── logger.ts          # Logging utilities
├── ROADMAP.md                 # Project roadmap and plans
└── package.json               # Extension manifest
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for detailed development plans.

### Coming Soon (Phase 2)
- LSP integration with texlab
- Auto-completion and snippets
- Forward/inverse search (SyncTeX)
- Document outline and structure view

### Future (Phase 3+)
- Project templates (article, book, beamer, thesis)
- Automatic package installation
- Bibliography management
- Advanced split-pane preview
- And much more!

## Why VTeX?

VTeX aims to provide a cleaner, more modern alternative to existing LaTeX extensions:

- **No Dev Containers Required**: Unlike LaTeX Workshop with containers, VTeX integrates Docker seamlessly without forcing dev container setup
- **Smart Build System**: Automatically detects and uses the best available method
- **Quality of Life**: Better templates, easier package management, and thoughtful UX
- **Local-First**: Works great with local installations, Docker is optional
- **Modern Design**: Built from the ground up for 2026+ VS Code

## Contributing

Contributions are welcome! This project is in active development.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Inspired by Overleaf's excellent UX
- Built to complement and improve upon LaTeX Workshop
- Thanks to the texlab team for their excellent LSP server

---

**Note**: This extension is in early development (Phase 1). Some features mentioned in the roadmap are not yet implemented.
