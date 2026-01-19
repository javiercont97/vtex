# Table Editor Quick Start Guide

## Overview

The vTeX table editor provides advanced editing and preview capabilities for LaTeX tables, similar to the existing figure and TikZ editors.

## Features Implemented

### Phase 1: Core Foundation ✅
- **Table Parser**: Parses LaTeX table environments (tabular, tabularx, longtable, array, tabu) into AST
- **Table Generator**: Converts AST back to properly formatted LaTeX
- **Table Validator**: Detects structural issues, unescaped characters, and missing packages
- **Grid Model**: Internal representation for spreadsheet-like editing

### Phase 2: Visual Editor ✅
- **Webview-based Editor**: Spreadsheet-style interface
- **Basic Operations**: Add/delete rows/columns, edit cells
- **Column Alignment**: Configure left/center/right alignment per column
- **Live Updates**: Changes automatically sync back to source document

### Phase 3: Preview & Integration ✅
- **Table Preview Service**: Compiles tables to PNG using mini LaTeX compilation
- **Hover Provider**: Shows pixel-perfect rendered preview on hover
- **CodeLens Provider**: "✏️ Edit Table" and "👁️ Preview" buttons above tables
- **Smart Preamble Extraction**: Uses document packages and settings

## Usage

### Opening the Table Editor

1. **Via CodeLens**: Hover over a table in your LaTeX document and click "✏️ Edit Table"
2. **Via Command**: 
   - `Ctrl+Shift+P` → "VTeX: Open Table Editor"
   - Place cursor inside a table and run "VTeX: Edit Table at Cursor"
3. **Via Template**: `Ctrl+Shift+P` → "VTeX: Insert Table Template"

### Hover Preview

Simply hover your mouse over any table environment to see a rendered preview:
- Supports: `\begin{tabular}`, `\begin{tabularx}`, `\begin{longtable}`, `\begin{array}`
- Shows actual LaTeX rendering
- Automatically clips tall tables for better preview

### Editor Interface

The table editor provides:
- **Toolbar**: Buttons for adding/deleting rows and columns
- **Grid View**: Spreadsheet-like table editing
- **Live Preview**: Real-time rendered preview of your table
- **Alignment Controls**: Dropdown for each column's alignment

### Keyboard Shortcuts (in editor)

- **Tab**: Move to next cell
- **Shift+Tab**: Move to previous cell
- **Arrow keys**: Navigate between cells (browser default)

### Commands

- `vtex.openTableEditor` - Open table editor
- `vtex.editTableAtCursor` - Edit table at current cursor position
- `vtex.insertTableTemplate` - Insert a table template

## Configuration

Add to your `settings.json`:

```json
{
    "vtex.table.enableLivePreview": true,
    "vtex.table.autoUpdateDelay": 800,
    "vtex.table.maxPreviewWidth": 400,
    "vtex.table.maxPreviewHeight": 300
}
```

## Supported Table Environments

✅ **Fully Supported**:
- `tabular` - Standard tables
- `tabularx` - Tables with auto-width columns
- `longtable` - Multi-page tables
- `array` - Math mode arrays

⚠️ **Partial Support**:
- `tabu` - Legacy package (basic support)
- `multicolumn` - Parsed but visual merge not yet implemented
- `multirow` - Parsed but visual merge not yet implemented

## Table Templates

The editor includes several built-in templates:

### Simple 3x3 Table
```latex
\begin{table}[htbp]
    \centering
    \caption{Caption}
    \label{tab:label}
    \begin{tabular}{lcc}
    \hline
    Header 1 & Header 2 & Header 3 \\
    \hline
    Data 1 & Data 2 & Data 3 \\
    \hline
    \end{tabular}
\end{table}
```

### Booktabs Style
```latex
\begin{table}[htbp]
    \centering
    \caption{Caption}
    \label{tab:label}
    \begin{tabular}{lcc}
    \toprule
    Header 1 & Header 2 & Header 3 \\
    \midrule
    Data 1 & Data 2 & Data 3 \\
    \bottomrule
    \end{tabular}
\end{table}
```

### Multi-column
```latex
\begin{table}[htbp]
    \centering
    \caption{Caption}
    \label{tab:label}
    \begin{tabular}{lccc}
    \hline
    \multicolumn{2}{c}{Group 1} & \multicolumn{2}{c}{Group 2} \\
    \hline
    A & B & C & D \\
    \hline
    \end{tabular}
\end{table}
```

## Technical Details

### Parser Features
- Column specification parsing (l, c, r, p{}, m{}, b{}, X)
- Horizontal rules (hline, toprule, midrule, bottomrule, cline, cmidrule)
- Multi-column and multi-row cells
- Nested table detection
- Comment preservation

### Validator Features
- Column count consistency checking
- Unescaped special character detection (%, _, &, #, $)
- Multirow/multicolumn overlap detection
- Required package detection (booktabs, multirow, tabularx, etc.)
- Empty cell detection

### Preview Features
- Mini LaTeX compilation using existing BuildSystem
- Automatic preamble extraction from source document
- PDF to PNG conversion (supports pdftoppm, ImageMagick, Ghostscript)
- Smart image resizing for hover previews
- Caching for performance

## Known Limitations

Current Phase 1-3 implementation has these limitations:

1. **Cell Merging**: Visual merge/split operations not yet in UI (parsed correctly)
2. **Advanced Formatting**: Bold rows, math mode toggle in progress
3. **CSV Import**: Not yet implemented
4. **Sort Operations**: Not yet implemented
5. **Formula Evaluation**: Not yet implemented

These will be added in Phase 4-7 as outlined in the implementation plan.

## Troubleshooting

### Preview Not Showing
- Ensure you have LaTeX installed (TeX Live or Docker)
- Check that required packages are in your document preamble
- Look at the Output panel (VTeX) for error messages

### Compilation Errors
- Verify column count matches in all rows
- Check for unescaped special characters
- Ensure required packages are loaded:
  - `\usepackage{array}`
  - `\usepackage{booktabs}` (if using toprule/midrule/bottomrule)
  - `\usepackage{multirow}` (if using \multirow)
  - `\usepackage{tabularx}` (if using tabularx environment)

### Editor Not Opening
- Ensure you're in a LaTeX file
- Check that cursor is inside a table environment
- Try using "Insert Table Template" first to create a new table

## Next Steps

See [TABLE_EDITOR_IMPLEMENTATION_PLAN.md](TABLE_EDITOR_IMPLEMENTATION_PLAN.md) for:
- Phase 4-7 features roadmap
- Advanced cell merging/splitting
- CSV import/export
- Data operations (sorting, statistics)
- Styling tools

## Feedback

The table editor is in active development. Found a bug or have a feature request? Please report it!

## Architecture

Files created:
- `src/editor/tableParser.ts` - LaTeX → AST parser
- `src/editor/tableGenerator.ts` - AST → LaTeX generator
- `src/editor/tableValidator.ts` - Structure validation
- `src/editor/tableEditor.ts` - Main editor + webview
- `src/editor/tableHoverProvider.ts` - Hover preview
- `src/preview/tableCodeLens.ts` - CodeLens provider
- `src/figures/tablePreview.ts` - Preview/rendering service
