# Multirow and Multicolumn Support

The table editor now fully supports `\multirow` and `\multicolumn` LaTeX commands through an intuitive visual interface.

## Features

### Column Span (Multicolumn)
- **What it does**: Merges cells horizontally across multiple columns
- **LaTeX command**: `\multicolumn{n}{alignment}{content}`
- **How to use**:
  1. Select a cell in the table editor
  2. In the sidebar, use the **Column Span** controls (+ / - buttons or direct input)
  3. The cell will expand horizontally, and spanned cells will be marked
  4. The generated LaTeX will use `\multicolumn` automatically

### Row Span (Multirow)
- **What it does**: Merges cells vertically across multiple rows
- **LaTeX command**: `\multirow{n}{width}{content}`
- **How to use**:
  1. Select a cell in the table editor
  2. In the sidebar, use the **Row Span** controls (+ / - buttons or direct input)
  3. The cell will expand vertically, and spanned cells will be marked
  4. The generated LaTeX will use `\multirow` automatically

### Combined Multirow + Multicolumn
- **What it does**: Creates cells that span both multiple rows AND columns
- **LaTeX command**: `\multicolumn{cols}{align}{\multirow{rows}{width}{content}}`
- **How to use**:
  1. Select a cell
  2. Set both Column Span > 1 and Row Span > 1
  3. The cell will span in both directions
  4. The generated LaTeX will nest both commands properly

### Vertical Alignment (for Multirow)
- **What it does**: Controls vertical positioning within multirow cells
- **Options**: Top, Middle (default), Bottom
- **LaTeX syntax**: `\multirow{n}{width}[t|b]{content}`
- **How to use**:
  1. Select a cell with Row Span > 1
  2. Use the **Vertical Alignment** buttons in the sidebar
  3. The multirow command will include the alignment parameter

### Horizontal Alignment
- **What it does**: Controls text alignment within cells
- **Options**: Left (l), Center (c), Right (r)
- **How to use**:
  1. Select a cell
  2. Use the **Alignment** buttons in the sidebar
  3. For multicolumn cells, this sets the alignment in the column spec

## Required Packages

The table editor automatically ensures these packages are available:

- `\usepackage{array}` - Extended array and tabular
- `\usepackage{multirow}` - Multirow support
- `\usepackage{booktabs}` - Professional table rules

These are included in the preview preamble and should be in your document preamble for compilation.

## Example Usage

### Simple Multicolumn
```latex
\begin{tabular}{|c|c|c|}
\hline
\multicolumn{3}{|c|}{Header spanning 3 columns} \\
\hline
A & B & C \\
\hline
\end{tabular}
```

### Simple Multirow
```latex
\begin{tabular}{|c|c|}
\hline
\multirow{2}{*}{Spanning 2 rows} & Row 1 \\
& Row 2 \\
\hline
\end{tabular}
```

### Combined Multirow + Multicolumn
```latex
\begin{tabular}{|c|c|c|}
\hline
\multicolumn{2}{|c|}{\multirow{2}{*}{Spans 2x2}} & A \\
& B \\
\hline
C & D & E \\
\hline
\end{tabular}
```

### Multirow with Vertical Alignment
```latex
\begin{tabular}{|c|c|}
\hline
\multirow{3}{*}[t]{Top aligned} & Row 1 \\
& Row 2 \\
& Row 3 \\
\hline
\end{tabular}
```

## Tips

1. **Visual Feedback**: Cells that are spanned show up as gray/disabled in the editor
2. **Merge Cells**: You can also use the "Merge Cells" button to select and merge multiple cells at once
3. **Split Cells**: Use "Split Cell" to reset colspan/rowspan back to 1
4. **Hover Preview**: Hover over table code in your LaTeX document to see a rendered preview with multirow/multicolumn applied
5. **Auto-width**: The extension uses `*` for multirow width, which automatically calculates the optimal width

## Supported Table Environments

Multirow and multicolumn work with:
- `tabular`
- `tabularx`
- `longtable`
- `array`
- `tabu`

All these environments are supported by the visual table editor and will generate the appropriate LaTeX code with multirow/multicolumn commands.
