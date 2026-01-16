# VTeX - Modern LaTeX Extension for VS Code
## Project Roadmap

### Vision
Create a modern, Overleaf-like LaTeX editing experience for VS Code with local-first approach, supporting both native and containerized builds.

---

## Design Decisions

### Build System
- **Hybrid Approach**: Detect local TeX Live installation, fall back to Docker if unavailable
- **User Choice**: Allow users to manually select build method via settings
- **Docker Strategy**: Use official TeXLive images with volume caching for packages
- **Local Strategy**: Execute latexmk or pdflatex directly when TeX Live detected

### Technology Stack
- **Language**: TypeScript
- **LSP**: texlab (external, well-maintained)
- **PDF Viewer**: VS Code native PDF viewer (may enhance later)
- **Build Orchestration**: Node.js child processes
- **Package Manager**: Custom implementation for on-demand package installation

### Target Audience
- **Primary**: Students and academics
- **Platform Priority**: Linux first, then Windows/Mac
- **Competitor**: LaTeX Workshop (with improvements: no dev containers, better templates, auto package installation)

---

## Phase 1: MVP - Build System & Preview ✅ COMPLETE
**Goal**: Basic editing, compilation, and preview functionality

### Features
- [x] Extension scaffolding
- [x] Build system detection (local TeX vs Docker)
- [x] Configuration system for build preferences
- [x] LaTeX file compilation (latexmk/pdflatex/xelatex/lualatex)
- [x] Docker build integration with volume caching
- [x] Error log parsing
- [x] Basic error diagnostics display
- [x] PDF preview integration (custom WebView with PDF.js)
- [x] Build on save (with debouncing)
- [x] Status bar indicators
- [x] Output channel for build logs
- [x] WSL compatibility
- [x] Focus management (non-intrusive updates)

### Architecture
```
extension/
├── src/
│   ├── extension.ts           # Entry point, activation
│   ├── buildSystem/
│   │   ├── detector.ts        # Detect local TeX installation
│   │   ├── localBuilder.ts    # Local build execution
│   │   ├── dockerBuilder.ts   # Docker build execution
│   │   ├── builder.ts         # Build orchestrator interface
│   │   └── errorParser.ts     # Parse LaTeX logs
│   ├── preview/
│   │   └── pdfPreview.ts      # PDF preview management
│   └── utils/
│       ├── config.ts          # Configuration management
│       └── logger.ts          # Logging utilities
```

### Key Deliverables
1. Detect LaTeX environment (local/Docker)
2. Compile `.tex` files to PDF
3. Show compilation errors inline
4. Display PDF in VS Code
5. Auto-build on save

---

## Phase 2: LSP Integration & Enhanced Editing (Current)
**Goal**: Professional-grade editing experience

### Features
- [x] Integrate texlab LSP server (optional installer)
- [x] Auto-completion for LaTeX commands (via texlab LSP)
- [x] Snippet library (common environments, math symbols)
- [x] Syntax highlighting enhancements (VS Code native)
- [ ] Forward search (editor → PDF) with SyncTeX
- [ ] Inverse search (PDF → editor) with SyncTeX
- [x] Document outline/structure view (via texlab LSP)
- [x] Reference management (labels, citations) (via texlab LSP)
- [x] Symbol picker UI (via texlab LSP)
- [x] Math preview on hover (via texlab LSP)
- [x] Workspace symbol search (via texlab LSP)
- [x] Diagnostics integration (via texlab LSP)

### Integration Points
- texlab binary bundled or auto-downloaded
- LSP client configuration
- Custom command handlers for navigation

---

## Phase 3: Quality of Life Features
**Goal**: Overleaf-like convenience

### Features
- [ ] Project templates
  - Article, book, beamer, thesis, CV
  - Custom template system
- [ ] Package manager
  - Detect missing packages from logs
  - Install packages via tlmgr (local) or Docker
  - Quick fix suggestions for missing packages
- [ ] Bibliography management
  - BibTeX entry editor
  - Citation picker
  - Integration with Zotero/Mendeley
- [ ] Project management
  - Multi-file project support
  - Main file detection/configuration
  - Subfile compilation
- [ ] Advanced preview
  - Split-pane mode (editor + PDF)
  - Sync scrolling
  - Zoom controls
  - PDF annotations
- [ ] Export options
  - Export to different formats (via pandoc)
  - Arxiv-ready bundles

---

## Phase 4: Advanced Features (Future)
**Goal**: Best-in-class LaTeX environment

### Features
- [ ] Collaborative editing (VS Code Live Share integration)
- [ ] Git integration for LaTeX (conflict resolution)
- [ ] Advanced math input
  - Handwriting recognition
  - LaTeX equation editor UI
- [ ] Figure management
  - Image previews
  - TikZ preview
  - Plot generation helpers
- [ ] Spell checking (LanguageTool integration)
- [ ] Grammar checking
- [ ] Table editor GUI
- [ ] Macro/command creation wizard
- [ ] Performance optimization
  - Incremental compilation
  - Partial builds
- [ ] Cloud sync integration (optional)
- [ ] Web-based preview sharing

---

## Technical Debt & Improvements
- [ ] Comprehensive test suite
- [ ] CI/CD pipeline
- [ ] Performance benchmarking
- [ ] Memory optimization for large projects
- [ ] Better error messages and user guidance
- [ ] Accessibility features
- [ ] Internationalization (i18n)
- [ ] Telemetry (opt-in) for crash reports

---

## Success Metrics
- **Phase 1**: Extension compiles and previews documents reliably
- **Phase 2**: Feature parity with basic LaTeX Workshop functionality
- **Phase 3**: User-reported quality of life improvements over LaTeX Workshop
- **Phase 4**: Recognized as best VS Code LaTeX extension

---

## Non-Goals
- Replace Overleaf entirely (online collaboration platform)
- Support for non-LaTeX document formats (stick to LaTeX)
- Built-in PDF editor (view only)
- WYSIWYG editing (LaTeX is code-first)

---

## Decision Log

### 2026-01-15: Initial Design
- Chose hybrid build system over Docker-only
- Selected texlab for LSP (mature, don't reinvent)
- Using VS Code native PDF viewer initially
- Target Linux first, multi-platform later
- Compete with LaTeX Workshop (better templates, no dev containers)

### 2026-01-16: Phase 1 Complete
- Implemented custom PDF viewer with PDF.js (better than native)
- Solved WSL compatibility with base64 data URIs
- Added focus management for non-intrusive workflow
- All Phase 1 features complete and tested
- Moving to Phase 2: LSP Integration

---

## Resources
- [VS Code Extension API](https://code.visualstudio.com/api)
- [texlab Documentation](https://github.com/latex-lsp/texlab)
- [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) (competitor reference)
- [TeXLive Docker](https://hub.docker.com/r/texlive/texlive)
- [latexmk Documentation](https://www.ctan.org/pkg/latexmk)
