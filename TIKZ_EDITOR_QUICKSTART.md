# TikZ Editor - Quick Reference

## ⚠️ Experimental Feature

The TikZ WYSIWYG editor is **experimental** and disabled by default.

**To Enable:**
1. Open Settings (`Ctrl+,`)
2. Search: `vtex.experimental.enableTikZEditor`
3. Check the box
4. Reload VS Code

---

## Opening the Editor

### Via CodeLens (Recommended)
1. Open any `.tex` file
2. Find `\begin{tikzpicture}` environment
3. Click **✏️ Edit TikZ** button above the code

### Via Command Palette
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type: "VTeX: Open TikZ Editor"

## Keyboard Shortcuts

| Key | Tool |
|-----|------|
| `V` | Select mode |
| `L` | Draw line |
| `C` | Draw circle |
| `R` | Draw rectangle |
| `N` | Add text node |
| `A` | Draw arrow (coming soon) |
| `G` | Toggle grid |
| `Del` | Delete selected object |

## Drawing Tools

### Select (V)
- Click objects to select
- Drag to move
- Resize with handles

### Line (L)
- Click starting point
- Drag to endpoint
- Release to finish

### Circle (C)
- Click center point
- Drag to set radius
- Release to finish

### Rectangle (R)
- Click first corner
- Drag to opposite corner
- Release to finish

### Node (N)
- Click to place text
- Starts editing immediately
- Click outside to finish

## Properties Panel

When an object is selected:
- **Stroke Color**: Outline color
- **Fill Color**: Interior color
- **Stroke Width**: Line thickness (1-20)
- **Opacity**: Transparency (0-100%)

## Code Panel Actions

### ⬅️ Load
Parse TikZ code → display on canvas

### ➡️ Generate
Convert canvas objects → TikZ code

### ✓ Apply
Insert/update code in document

## Preview Panel

### 🔄 Compile Preview
Runs `pdflatex` to generate SVG preview

**Requirements:**
- LaTeX distribution installed
- `pdf2svg` or `dvisvgm` tool

## Workflow Examples

### Creating a Simple Diagram
1. Click **Circle** tool (`C`)
2. Draw a circle
3. Click **Node** tool (`N`)
4. Add label inside
5. Click **➡️ Generate**
6. Click **✓ Apply**

### Editing Existing Code
1. Click **✏️ Edit TikZ** on CodeLens
2. Modify on canvas (or in code panel)
3. Changes auto-save after 800ms
4. Or click **✓ Apply** to save immediately

### Styling Objects
1. Select object on canvas
2. Use properties panel to change:
   - Colors
   - Line width
   - Opacity
3. Changes update code automatically

## Tips & Tricks

### Snapping
- Click **🧲 Snap** to enable grid snapping
- Objects snap to 20px grid

### Grid
- Click **⊞ Grid** to toggle grid display
- Helps with alignment

### Undo Drawing
- Press `Del` to delete selected object
- Or click **🗑️ Delete** button

### Clear Canvas
- Click **🧹 Clear** button
- Removes all objects (with confirmation)

## Supported TikZ Features

✅ **Fully Supported:**
- Basic shapes (circles, rectangles)
- Lines and paths
- Nodes with text
- Colors and fills
- Line widths
- Opacity

⚠️ **Partial Support:**
- Arrows (UI present, implementation pending)
- Bézier curves (AST ready, UI pending)

❌ **Not Supported:**
- Loops and macros
- TikZ libraries (calc, decorations)
- Complex coordinate calculations
- Advanced path operations

## Troubleshooting

### "Failed to parse TikZ code"
- Check for syntax errors in code panel
- Try simplifying complex TikZ features
- Manually fix code and click **⬅️ Load**

### Preview not compiling
- Ensure LaTeX is installed: `which pdflatex`
- Install pdf2svg: `sudo apt install pdf2svg`
- Check for TikZ packages in LaTeX distribution

### Canvas not loading code
- Code may contain unsupported features
- Check extension logs: Output → VTeX
- Try manually drawing shapes instead

### Objects not generating code
- Click **➡️ Generate** button explicitly
- Check status bar for object count
- Try deleting and re-drawing object

## Status Bar

Shows:
- **Ready**: Extension active
- **Mode**: Current tool (Select, Line, etc.)
- **Objects**: Number of shapes on canvas
- **Selected**: When object is selected

## Code Panel Syntax

The editor understands basic TikZ syntax:

```latex
\begin{tikzpicture}
  \draw (0,0) circle (1);              % Circle
  \draw (0,0) rectangle (2,1);          % Rectangle
  \draw (0,0) -- (2,0);                 % Line
  \node at (1,1) {Text};                % Node
  \draw[red,thick] (0,0) -- (1,1);     % Styled line
\end{tikzpicture}
```

## Advanced Usage

### Manual Code Editing
1. Edit code directly in code panel
2. Click **⬅️ Load** to update canvas
3. Or let auto-update sync after 800ms

### Exporting
Currently exports to document only. Future:
- Standalone `.tikz` files
- SVG/PDF export
- PNG rasterization

### Performance
- Recommended: < 50 objects per diagram
- Large diagrams: disable auto-update
- Use **✓ Apply** manually instead

## Support

**Documentation**: See [TIKZ_EDITOR_IMPLEMENTATION.md](TIKZ_EDITOR_IMPLEMENTATION.md)  
**Issues**: Report bugs via GitHub issues  
**Logs**: View Output → VTeX for debug info

---

**Version**: 1.0 (Phase 1-4 Complete)  
**Last Updated**: 2026-01-18
