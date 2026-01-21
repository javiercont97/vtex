# Changelog

All notable changes to the VTeX extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-21

### Added
- **Visual Editors**: Interactive editors for Tables, Equations, and Figures with live preview
- **Project Templates**: Start new projects with professional templates (Article, Beamer, Book, Thesis, CV, Letter)
- **Figure Management**: Inline image previews, TikZ live preview, and Plot generation wizard
- **Smart Package Manager**: Automatic detection and one-click installation of missing LaTeX packages
- **LSP Integration**: Full texlab integration for auto-completion, navigation, and refactoring
- **Grammar Checking**: Integrated LanguageTool integration
- **Bibliography Tools**: Visual BibTeX editor and citation picker
- **Performance**: Incremental compilation and partial builds
- **SyncTeX**: Bidirectional synchronization between editor and PDF

### Changed
- Improved PDF viewing experience with custom UI controls
- Enhanced build system reliability
- Updated documentation and command reference

## [0.1.0] - 2026-01-15

### Added
- Initial release with Phase 1 features
- Hybrid build system (auto-detect local TeX Live or Docker)
- Manual build method selection (local/docker/auto)
- Support for multiple LaTeX engines (latexmk, pdflatex, xelatex, lualatex)
- Auto-build on save with debouncing
- LaTeX error and warning parsing
- PDF preview integration using VS Code's native viewer
- Docker volume caching for faster containerized builds
- Clean command to remove auxiliary files
- Status bar integration with build button
- Output channel for detailed build logs
- Environment detection and information display
- Configuration system for all build options

### Build System
- Local builder using system TeX Live installation
- Docker builder using texlive/texlive image
- Automatic environment detection
- Error log parsing with file, line, and message extraction

### Commands
- `VTeX: Build LaTeX Document` - Compile current document
- `VTeX: View PDF` - Open compiled PDF
- `VTeX: Clean Auxiliary Files` - Remove build artifacts
- `VTeX: Select Build Method` - Choose build system
- `VTeX: Detect Environment` - Show environment information

### Configuration Options
- `vtex.buildMethod` - Build method selection
- `vtex.buildEngine` - LaTeX engine selection
- `vtex.buildOnSave` - Auto-build toggle
- `vtex.docker.image` - Docker image configuration
- `vtex.docker.enableCache` - Docker caching toggle
- `vtex.latexmk.options` - latexmk options
- `vtex.showOutputChannel` - Output display preferences

### Documentation
- Comprehensive README with usage instructions
- Detailed ROADMAP with multi-phase development plan
- DEVELOPMENT guide for contributors
- Example LaTeX documents for testing
- Docker configuration documentation

[Unreleased]: https://github.com/yourusername/vtex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/vtex/releases/tag/v0.1.0
