# VTeX Command Reference

## All Available Commands

### Building & Compilation
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Build LaTeX Document` | `Ctrl+Shift+B` | Build the current LaTeX document |
| `VTeX: Clean Auxiliary Files` | - | Remove auxiliary build files (.aux, .log, etc.) |
| `VTeX: Select Build Method (Local/Docker)` | - | Choose between local TeX, Docker, or auto-detect |
| `VTeX: Detect LaTeX Environment` | - | Show detected LaTeX installation info |

### PDF Viewing
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: View PDF` | - | Open PDF preview in VS Code |
| `VTeX: Forward Search (Go to PDF)` | `Ctrl+Alt+J` | Jump from editor position to corresponding PDF location |
| *Ctrl+Click in PDF* | - | Inverse search: Jump from PDF back to source |

### Project Templates
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: New Project from Template` | - | Create a new LaTeX project from templates (Article, Beamer, Book, Thesis, CV, Letter) |

### Visual Editors
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Open Table Editor` | - | Open visual spreadsheet-like editor for tables |
| `VTeX: Insert Table Template` | - | Insert common table layouts |
| `VTeX: Open Equation Editor` | - | Open visual math editor with real-time preview |
| `VTeX: Insert Math Symbol` | - | Open symbol palette |
| `VTeX: Check Grammar` | - | Run grammar check on current document |
| `VTeX: Create Macro` | - | Open wizard to create custom LaTeX macros |

### Figure Management
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Insert Figure` | - | Wizard to finding and inserting images |
| `VTeX: Preview Figure` | - | Show preview of image at cursor |
| `VTeX: Show All Figures` | - | List all images used in the project |
| `VTeX: Toggle Inline Previews` | - | Show/hide image thumbnails in editor |

### TikZ & Plots
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Preview TikZ` | - | Live preview of TikZ code at cursor |
| `VTeX: Compilation TikZ Standalone` | - | Export TikZ figure to SVG/PDF |
| `VTeX: Generate Plot` | - | Wizard to create 2D/3D plots |
| `VTeX: Insert TikZ Template` | - | Insert common diagram templates |

### Bibliography Management
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Insert Citation` | - | Open interactive citation picker |
| `VTeX: Edit BibTeX Entry` | - | Open visual editor for BibTeX entries |
| *Type `\cite{`* | - | Auto-completion shows all available citations |

### Project Management
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Find Root File` | - | Show the detected root file for multi-file projects |
| `VTeX: Analyze Project Structure` | - | Display project statistics (files, bibliography, images) |

### LSP & Language Server
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Install/Update texlab LSP Server` | - | Install or update the texlab language server |

---

## Default Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+B` | Build LaTeX Document |
| `Ctrl+Alt+J` | Forward Search (Editor → PDF) |
| `Ctrl+Click` (in PDF) | Inverse Search (PDF → Editor) |

### PDF Viewer Shortcuts
*When PDF preview is focused:*
| Shortcut | Action |
|----------|--------|
| `←` or `PageUp` | Previous page |
| `→` or `PageDown` | Next page |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit Width |
| `1` | Fit Page |

## Configuration Settings

Common settings you can configure in VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `vtex.buildMethod` | `auto` | Choose build method (`local`, `docker`, `auto`) |
| `vtex.buildOnSave` | `true` | Automatically build when saving |
| `vtex.rootFile` | `""` | Manually specify root file (optional) |
| `vtex.compiler` | `latexmk` | Compiler engine (`pdflatex`, `xelatex`, `lualatex`, `latexmk`) |
| `vtex.preview.synctex` | `true` | Enable SyncTeX |
