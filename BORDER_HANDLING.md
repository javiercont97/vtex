# Smart Border Handling for Multirow/Multicolumn Tables

The table generator now intelligently handles borders when multirow and multicolumn cells are present.

## Key Features

### 1. Vertical Borders in Multicolumn

The column specification in `\multicolumn` commands now includes vertical borders from the original column spec.

**Example:**
```latex
% Column spec: {c|c|c} (centered with vertical borders)
\multicolumn{2}{c|}{Merged Cell}  % Includes right border
```

The second parameter of `\multicolumn` preserves:
- **Left border** from the first column being spanned
- **Alignment** (l/c/r) from the cell or first column
- **Right border** from the last column being spanned

### 2. Smart \cline Generation

When `\hline` would draw through a multirow cell, it's automatically converted to `\cline` to avoid the conflict.

**Without multirow:**
```latex
Row 1 \\
\hline              % Full horizontal line
Row 2 \\
```

**With multirow:**
```latex
\multirow{2}{*}{Span} & Cell 1 \\
\cline{2-3}         % Partial line (avoids column 1)
& Cell 2 \\
```

### 3. Example from User

Your example now generates correctly:

**Input table structure:**
- 3 columns: `{c|c|c}`
- Header row with borders
- Regular row: 1, 2, 3
- Merged row: columns 1-2 merged, column 3 spans 2 rows
- Final row: columns 1-2 merged

**Generated LaTeX:**
```latex
\begin{table}[htbp]
    \centering
    \begin{tabular}{c|c|c}
        Header 1 & Header 2 & Header 3 \\
        \hline
        1 & 2 & 3 \\
        \cline{1-3}
        \multicolumn{2}{c|}{4-5} & \multirow{2}{*}{6-9} \\
        \cline{1-2}
        \multicolumn{2}{c|}{7-8} \\
    \end{tabular}
    \caption{Table with numbers}
    \label{tab:table_with_numbers}
\end{table}
```

## How It Works

### inferColumnSpec Method

```typescript
inferColumnSpec(cell, columnSpec, columnIndex, colspan)
```

Builds the column specification for `\multicolumn` by:
1. Checking if the first spanned column has a left border → add `|`
2. Getting alignment from cell or first column
3. Checking if the last spanned column has a right border → add `|`

Result: `|c|`, `c|`, `|c`, or just `c` depending on borders

### generateSmartRules Method

```typescript
generateSmartRules(rules, currentRow, rowIndex, allRows)
```

For each `\hline` rule:
1. Scans all previous rows for multirow cells
2. Checks if any multirow cell spans through the current line position
3. Identifies which columns are blocked by multirow cells
4. Generates `\cline{x-y}` segments for unblocked columns
5. Falls back to `\hline` if no multirow cells present

### Algorithm Details

**Detecting multirow spans:**
- For each row `r` before the current line at position `rowIndex`
- For each non-spanned cell in row `r`
- If `r + cell.rowspan > rowIndex`, the cell spans through this line
- Mark columns `colIndex` through `colIndex + colspan - 1` as blocked

**Generating cline segments:**
- Iterate through all columns (0 to totalColumns - 1)
- Build segments of consecutive unblocked columns
- Convert to 1-indexed LaTeX columns
- Generate `\cline{start-end}` for each segment

## Edge Cases Handled

1. **Multiple multirow cells in same row**: All blocked columns are tracked
2. **Multirow + multicolumn combined**: Blocks all spanned columns
3. **No multirow cells**: Falls back to simple `\hline`
4. **Existing `\cline` rules**: Passed through unchanged
5. **Other rule types** (`\toprule`, `\midrule`, etc.): Passed through unchanged

## Visual Result

The table editor now generates LaTeX that:
- ✅ Preserves vertical borders through merged cells
- ✅ Doesn't draw horizontal lines through multirow cells
- ✅ Properly segments `\cline` around multirow cells
- ✅ Maintains professional table appearance
- ✅ Compiles without errors

## Testing

To test, create a table with:
1. Vertical borders in column spec (e.g., `{|c|c|c|}`)
2. Some cells with colspan > 1
3. Some cells with rowspan > 1
4. Horizontal borders (`\hline`)

The generated code should:
- Use `\multicolumn{n}{|c|}{...}` with appropriate borders
- Use `\cline{x-y}` instead of `\hline` where multirow cells exist
- Render correctly with no border artifacts
