# Quick Reference: New Features

## 1. Opening PDFs from File Explorer

**What**: You can now open PDF files directly from VS Code's file explorer with VTeX's PDF viewer.

**How**:
1. Right-click any `.pdf` file in the explorer panel
2. Select "Open With..."
3. Choose "VTeX PDF Preview"

**Alternative**: Set VTeX as default PDF viewer:
1. Right-click a PDF → "Open With..."
2. Choose "VTeX PDF Preview"
3. Click "Configure default editor for '*.pdf'..."
4. Select "VTeX PDF Preview"

## 2. BibTeX Visual Editor

**What**: Edit BibTeX entries using a graphical form instead of raw text editing.

**How**:
1. Open command palette: `Ctrl+Shift+P` (Linux/Windows) or `Cmd+Shift+P` (Mac)
2. Type: `VTeX: Edit BibTeX Entry`
3. Select a `.bib` file (if you have multiple)
4. Choose an existing entry to edit, or create a new one
5. Fill in the form fields
6. Click "Save Entry"

**Features**:
- Required fields are marked with *
- Fields update automatically when you change the entry type
- Supports 8 entry types: article, book, inproceedings, phdthesis, mastersthesis, techreport, misc, unpublished

## 3. Native PDF Viewer

**What**: Alternative PDF viewer using Chrome's built-in renderer (simpler, but no SyncTeX).

**How to Enable**:
1. Open Settings: `Ctrl+,` (Linux/Windows) or `Cmd+,` (Mac)
2. Search for: `vtex.pdfViewer`
3. Change from `pdfjs` to `native`

**When to Use**:
- ✅ Use **native** if: You want simplicity and don't need forward/inverse search
- ✅ Use **pdfjs** if: You use SyncTeX (Ctrl+Alt+J, Ctrl+Click) or want custom controls

**Comparison**:

| Feature | pdfjs (default) | native |
|---------|-----------------|--------|
| SyncTeX (jump between code & PDF) | ✅ Yes | ❌ No |
| Custom zoom controls | ✅ Yes | ⚠️ Browser default |
| Keyboard shortcuts | ✅ Custom | ⚠️ Browser default |
| Implementation | Complex | Simple |

## Testing the Features

### Test PDF File Association:
```bash
# 1. Build a LaTeX document first
# 2. In file explorer, right-click the generated .pdf
# 3. Select "Open With..." → "VTeX PDF Preview"
```

### Test BibTeX Editor:
```bash
# 1. Create or open a .bib file
# 2. Ctrl+Shift+P → "VTeX: Edit BibTeX Entry"
# 3. Create a new entry or edit existing one
# 4. Save and check the .bib file
```

### Test Native PDF Viewer:
```bash
# 1. Open Settings → vtex.pdfViewer → select "native"
# 2. Build a LaTeX document (Ctrl+Alt+B)
# 3. PDF opens with native Chrome renderer
# 4. Switch back to "pdfjs" to restore SyncTeX
```

## Configuration

Add to `.vscode/settings.json`:

```json
{
  // Use native Chrome PDF viewer instead of PDF.js
  "vtex.pdfViewer": "native",
  
  // Other existing settings...
  "vtex.buildOnSave": true,
  "vtex.buildEngine": "latexmk"
}
```

## Keyboard Shortcuts

- Build: `Ctrl+Alt+B`
- View PDF: `Ctrl+Alt+V`
- Forward Search (SyncTeX): `Ctrl+Alt+J`
- Inverse Search (SyncTeX): `Ctrl+Click` in PDF
- Insert Citation: Via command palette

## Notes

- PDF file association requires VS Code 1.85+
- BibTeX editor works with any .bib file in your workspace
- Native PDF viewer doesn't support SyncTeX features
- All features are backward compatible - existing workflows continue to work

---

# Phase 4 Features Quick Reference

## 📐 Equation Editor (NEW)
**Command**: `VTeX: Open Equation Editor`

**Three Modes**:
- **Inline** ($...$): For inline math
- **Display** (\[...\]): For centered display
- **Equation** (\begin{equation}): For numbered equations

**Click-to-Edit**: Enable inline decorations to see "✏️ Edit Equation" CodeLens above equations

## 🖼️ Figure Management (ENHANCED)
- File extensions now preserved in paths
- Hover previews for images
- Toggle inline decorations: `VTeX: Toggle Inline Previews`

## 📊 Table Editor (NEW)
**Command**: `VTeX: Open Table Editor`
- Visual grid editing
- Add/remove rows and columns
- Column alignment controls
- Live LaTeX preview

## 📈 Plot Generator (NEW)
8 plot types: line, scatter, bar, function, histogram, contour, 3D, polar

## 🎨 TikZ Preview (NEW)
Preview TikZ diagrams as SVG, insert templates, compile standalone

## ✅ Grammar Checker (NEW)
LanguageTool integration for grammar and style checking

## 🔧 Macro Wizard (NEW)
Create custom commands, parametric macros, and environments

## ⚡ Performance Optimizer (NEW)
Incremental builds for faster compilation of large projects

## 🔍 PDF Viewer (ENHANCED)
**Zoom now preserved** across rebuilds - your zoom preference is remembered!

---

*See PHASE4_BUGFIX_SUMMARY.md for detailed feature documentation*