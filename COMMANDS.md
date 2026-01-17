# VTeX Command Reference - Phase 3

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

### LSP & Language Server
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Install/Update texlab LSP Server` | - | Install or update the texlab language server |

### Phase 3: Project Templates ✨ NEW
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: New Project from Template` | - | Create a new LaTeX project from templates (Article, Beamer, Book, Thesis, CV, Letter) |

### Phase 3: Bibliography Management ✨ NEW
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Insert Citation` | - | Open interactive citation picker to insert a citation |
| *Type `\cite{`* | - | Auto-completion shows all available citations from .bib files |

### Phase 3: Project Management ✨ NEW
| Command | Shortcut | Description |
|---------|----------|-------------|
| `VTeX: Find Root File` | - | Show the detected root file for multi-file projects |
| `VTeX: Analyze Project Structure` | - | Display project statistics (files, bibliography, images) |

---

## Command Details

### VTeX: New Project from Template
**What it does:**
- Shows picker with 6 professional templates
- Creates complete project structure
- Opens main file automatically

**Templates:**
1. **Article** - Academic paper (sections, references)
2. **Beamer** - Presentation slides
3. **Book** - Multi-chapter book
4. **Thesis** - PhD/Master thesis (chapters, abstract, bibliography folders)
5. **CV** - Curriculum vitae
6. **Letter** - Formal letter

**Usage:**
```
1. Open command palette (Ctrl+Shift+P)
2. Type "VTeX: New Project from Template"
3. Select template
4. Choose destination folder
5. Start editing!
```

---

### VTeX: Insert Citation
**What it does:**
- Searches all .bib files in workspace
- Shows interactive picker with search
- Displays: citation key, author (year), and title
- Inserts `\cite{key}` at cursor

**Alternative: Auto-completion**
- Type `\cite{` in your document
- Completion list appears automatically
- Shows same information as picker
- Works with `\citep{`, `\citet{`, etc.

**Usage:**
```
Method 1 (Command):
1. Place cursor where you want citation
2. Ctrl+Shift+P → "VTeX: Insert Citation"
3. Search or select citation
4. Citation inserted!

Method 2 (Auto-complete):
1. Type \cite{
2. Browse or search completions
3. Press Enter to insert
```

---

### VTeX: Find Root File
**What it does:**
- Detects the main/root LaTeX file for your project
- Shows relative path to root file
- Uses smart detection algorithm

**Detection Order:**
1. Check `vtex.rootFile` setting (if configured)
2. Check if current file has `\documentclass`
3. Search same directory for file that includes current file
4. Search parent directories recursively
5. Default to current file

**Usage:**
```
1. Open any .tex file in your project
2. Ctrl+Shift+P → "VTeX: Find Root File"
3. See detected root file path
```

---

### VTeX: Analyze Project Structure
**What it does:**
- Finds root file
- Recursively analyzes all included files
- Detects bibliography files (.bib)
- Finds referenced images
- Shows comprehensive statistics

**Usage:**
```
1. Open any .tex file in your project
2. Ctrl+Shift+P → "VTeX: Analyze Project"
3. See project statistics:
   - Root file location
   - Number of included files
   - Number of bibliography files
   - Number of images
```

---

## Configuration Settings

### Phase 3 Settings ✨ NEW

#### `vtex.rootFile`
**Type:** `string`  
**Default:** `""` (empty)  
**Description:** Manually specify the main LaTeX file for multi-file projects

**Example:**
```json
{
  "vtex.rootFile": "main.tex"
}
```

**When to use:**
- Multi-file projects with complex structure
- When automatic detection doesn't work
- To override auto-detection

---

## Keyboard Shortcuts

### Default Shortcuts
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

---

## Context Menus

### Editor Title Bar
*When editing a .tex file:*
- 🔧 **Build** button
- 📄 **View PDF** button

### Command Palette
Type "VTeX" to see all commands:
- Building & compilation commands
- PDF viewing commands
- LSP commands
- Template commands ✨ NEW
- Bibliography commands ✨ NEW
- Project management commands ✨ NEW

---

## Quick Reference Card

### Most Common Workflow
```
1. Create project:    VTeX: New Project from Template
2. Edit files:        (auto-build on save)
3. View PDF:          VTeX: View PDF (or auto-opens)
4. Navigate:          Ctrl+Alt+J (editor → PDF)
5. Add citation:      Type \cite{ (auto-complete)
```

### Multi-File Projects
```
1. Configure root:    Set vtex.rootFile in settings (optional)
2. Edit any file:     Build uses root automatically
3. Check structure:   VTeX: Analyze Project Structure
```

### Troubleshooting
```
Missing package?      → VTeX auto-detects and offers to install
Build from wrong file? → VTeX: Find Root File (check detection)
Need citation?        → VTeX: Insert Citation or type \cite{
```

---

## Command Summary by Phase

### Phase 1 (MVP) ✅
- Build, Clean, View PDF
- Select Build Method
- Detect Environment

### Phase 2 (LSP Integration) ✅
- Install texlab
- Forward Search
- Inverse Search (Ctrl+Click)

### Phase 3 (Quality of Life) ✅ 80% Complete
- **New Project from Template** ✨
- **Insert Citation** ✨
- **Find Root File** ✨
- **Analyze Project Structure** ✨
- Citation Auto-completion ✨

---

## Tips & Tricks

### Power User Tips
1. **Quick Template Access**: Pin "New Project from Template" in command history
2. **Fast Citations**: Use `\cite{` auto-complete for speed
3. **Project Stats**: Run "Analyze Project" to verify all files detected
4. **Auto-Build**: Keep `vtex.buildOnSave` enabled for instant feedback

### Performance Tips
1. **Root File Config**: Set `vtex.rootFile` to avoid detection overhead
2. **Bibliography**: Keep .bib files in project (faster than external)
3. **Cache**: VTeX caches project structure for speed

### Workflow Optimization
1. **Start with Template**: Faster than manual setup
2. **Use Multi-File**: Split large documents for better organization
3. **Let VTeX Handle Packages**: Click "Install" instead of manual tlmgr
4. **Leverage SyncTeX**: Use Ctrl+Alt+J and Ctrl+Click for navigation

---

*For more details, see PHASE3_COMPLETE.md*
