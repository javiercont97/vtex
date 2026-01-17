# VTeX - Modern LaTeX Extension for VS Code

A modern, Overleaf-like LaTeX editing experience for VS Code with hybrid build system, intelligent project management, and comprehensive bibliography tools.

## ✨ What's New in Phase 3

- 🎨 **Project Templates**: Start new projects with professional templates (Article, Beamer, Book, Thesis, CV, Letter)
- 📦 **Smart Package Manager**: Automatic detection and one-click installation of missing LaTeX packages
- 📁 **Multi-File Projects**: Intelligent root file detection and project structure analysis
- 📚 **Bibliography Management**: Citation picker, auto-completion, and BibTeX parsing
- 🔍 **Enhanced PDF Preview**: Zoom controls, keyboard shortcuts, and bidirectional SyncTeX

## Features

### ✅ Phase 1 - MVP (Complete)
- **Hybrid Build System**: Automatically detects local TeX Live or uses Docker
- **Flexible Build Methods**: Choose between local, Docker, or auto-detection
- **Multiple Engines**: Support for latexmk, pdflatex, xelatex, and lualatex
- **Auto-build on Save**: Automatically compile your documents when you save
- **Error Parsing**: Extract and display LaTeX errors and warnings
- **PDF Preview**: View your compiled PDFs directly in VS Code with PDF.js
- **Docker Cache**: Persistent package cache for faster Docker builds
- **Clean Command**: Remove auxiliary files with one click

### ✅ Phase 2 - LSP Integration (Complete)
- **texlab LSP Server**: Auto-completion, go-to-definition, and document symbols
- **Auto-installer**: One-click texlab installation and updates
- **Forward Search**: Jump from editor to PDF location (Ctrl+Alt+J)
- **Inverse Search**: Jump from PDF back to source (Ctrl+Click)
- **Hover Documentation**: Math preview and command documentation
- **Workspace Symbols**: Quick navigation to sections and labels

### ✅ Phase 3 - Quality of Life (80% Complete)
- **Project Templates**: 6 professional templates ready to use
  - Article, Beamer Presentation, Book, Thesis, CV, Letter
  - Multi-file structure with automatic setup
- **Package Manager**: Smart missing package detection
  - Detects missing packages from build errors
  - Suggests packages for undefined commands
  - One-click installation via tlmgr
- **Project Management**: Seamless multi-file support
  - Automatic root file detection
  - Recursive file inclusion analysis
  - Project structure analyzer
- **Bibliography Tools**: Complete citation workflow
  - BibTeX file parsing and validation
  - Citation picker with search
  - Auto-completion after `\cite{`
  - Multi-file .bib support
- **Enhanced Preview**: Professional PDF viewing
  - Zoom in/out/fit/reset controls
  - Page navigation and jumping
  - Keyboard shortcuts
  - Bidirectional SyncTeX

## Requirements

### Local Build
- TeX Live (or MikTeX/MacTeX) installed on your system
- Recommended: `latexmk` for best build experience
- Optional: `tlmgr` for automatic package installation

### Docker Build
- Docker installed and running
- No LaTeX installation required (uses containerized TeXLive)

## Installation

### From Source (Development)
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build
4. Press F5 in VS Code to launch the extension in a new window

### From VSIX (Coming Soon)
- Install from VS Code Marketplace (not yet published)

## Quick Start

### Creating a New Project
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `VTeX: New Project from Template`
3. Select a template (e.g., "Thesis")
4. Choose destination folder
5. Start editing!

### Working with Existing Projects
1. Open a `.tex` file
2. The extension will automatically detect your LaTeX environment and root file
3. Press `Ctrl+S` to save and auto-build
4. PDF preview opens automatically (or use the toolbar button)
5. Use `Ctrl+Alt+J` for forward search, `Ctrl+Click` in PDF for inverse search

### Adding Citations
1. Type `\cite{` and select from auto-complete, OR
2. Use `VTeX: Insert Citation` command for interactive picker
3. Search by author, year, or title
4. Citation inserted automatically

## Commands

### Building & Compilation
- **VTeX: Build LaTeX Document** (`Ctrl+Shift+B`) - Compile the current LaTeX document
- **VTeX: View PDF** - Open the compiled PDF
- **VTeX: Clean Auxiliary Files** - Remove intermediate build files
- **VTeX: Select Build Method** - Choose between local, Docker, or auto-detection
- **VTeX: Detect Environment** - Show information about available LaTeX environments

### Project Templates (Phase 3) 🆕
- **VTeX: New Project from Template** - Create new project from professional templates
  - Article, Beamer, Book, Thesis, CV, Letter

### Bibliography (Phase 3) 🆕
- **VTeX: Insert Citation** - Interactive citation picker
- Auto-completion when typing `\cite{` - Shows all citations from .bib files

### Project Management (Phase 3) 🆕
- **VTeX: Find Root File** - Show detected root file for multi-file projects
- **VTeX: Analyze Project Structure** - Display project statistics

### LSP & Navigation (Phase 2)
- **VTeX: Install/Update texlab** - Install or update the texlab language server
- **VTeX: Forward Search** (`Ctrl+Alt+J`) - Jump from editor to PDF
- **Ctrl+Click in PDF** - Jump from PDF back to source (inverse search)

*See [COMMANDS.md](COMMANDS.md) for complete command reference*

## Configuration

Access settings via VS Code settings (`Ctrl+,`) and search for "VTeX":

### Build Settings
```json
{
  "vtex.buildMethod": "auto",           // auto | local | docker
  "vtex.buildEngine": "latexmk",        // latexmk | pdflatex | xelatex | lualatex
  "vtex.buildOnSave": true,             // Auto-build on save
  "vtex.latexmk.options": [             // Custom latexmk options
    "-pdf",
    "-interaction=nonstopmode",
    "-synctex=1",
    "-file-line-error"
  ]
}
```

### Docker Settings
```json
{
  "vtex.docker.image": "texlive/texlive:latest",
  "vtex.docker.enableCache": true       // Cache packages in Docker volume
}
```

### Project Settings (Phase 3) 🆕
```json
{
  "vtex.rootFile": "main.tex"           // Specify root file for multi-file projects
}
```

### Output & Display
```json
{
  "vtex.outputDirectory": "out",        // Build output directory
  "vtex.showOutputChannel": "onError"   // never | onError | always
}
```

### LSP Settings
```json
{
  "vtex.lsp.enabled": true,             // Enable texlab LSP
  "vtex.texlab.path": ""                // Custom texlab binary path (optional)
}
```

## Project Structure

```
vtex/
├── src/
│   ├── extension.ts               # Main entry point
│   ├── buildSystem/
│   │   ├── builder.ts             # Build system orchestrator
│   │   ├── detector.ts            # Environment detection
│   │   ├── localBuilder.ts        # Local TeX Live builder
│   │   ├── dockerBuilder.ts       # Docker builder
│   │   ├── errorParser.ts         # Parse LaTeX errors
│   │   └── packageManager.ts      # Package detection & installation (Phase 3) 🆕
│   ├── templates/
│   │   └── templateManager.ts     # Project templates (Phase 3) 🆕
│   ├── project/
│   │   └── projectManager.ts      # Multi-file projects (Phase 3) 🆕
│   ├── bibliography/
│   │   └── bibliographyManager.ts # Citation management (Phase 3) 🆕
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
