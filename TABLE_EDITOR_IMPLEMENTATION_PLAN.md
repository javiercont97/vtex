# 📋 Table Editor Implementation Plan

## Executive Summary

This document outlines the complete implementation plan for adding advanced table editing and preview capabilities to the vTeX extension. The plan follows proven architectural patterns from the existing figure, equation, and TikZ editors while introducing table-specific innovations.

## Architecture Overview

### Core Layers

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
├─────────────────────────────────────────────────────────┤
│  Commands & UI Registration                              │
│  ├─ Table Editor Command                                │
│  ├─ CodeLens Provider (Open Table Editor)               │
│  └─ Hover Provider (Preview Tables)                     │
├─────────────────────────────────────────────────────────┤
│  TableEditor (Main Orchestrator)                        │
│  ├─ Webview Panel Management                            │
│  ├─ Message Handling                                    │
│  └─ Source Sync & Updates                               │
├─────────────────────────────────────────────────────────┤
│  Parser Layer                                            │
│  ├─ TableParser (LaTeX → AST)                          │
│  ├─ AST Definitions (TableNode, CellNode, etc.)         │
│  └─ Environment Detection (tabular/tabularx/longtable)  │
├─────────────────────────────────────────────────────────┤
│  Grid Model                                              │
│  ├─ TableGrid (2D array of cells)                       │
│  ├─ Cell (content, spans, alignment)                    │
│  └─ Operations (insert/delete/merge/split)              │
├─────────────────────────────────────────────────────────┤
│  Serializer Layer                                        │
│  ├─ TableGenerator (AST → LaTeX)                       │
│  ├─ Format Preservation                                 │
│  └─ Smart Column Spec Generation                        │
├─────────────────────────────────────────────────────────┤
│  Preview & Rendering                                     │
│  ├─ TablePreview (Mini LaTeX compile)                   │
│  ├─ PNG/PDF Generation                                  │
│  └─ Image Resizing & Optimization                       │
├─────────────────────────────────────────────────────────┤
│  Validation & Linting                                    │
│  ├─ Structure Validator                                 │
│  ├─ Column Count Checker                                │
│  └─ Escape Character Detector                           │
└─────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation & Core Table Parsing (Week 1-2)

### 1.1 File Structure Setup

Create the following files:

```
src/
├── editor/
│   ├── tableEditor.ts           # Main editor orchestrator
│   ├── tableParser.ts           # LaTeX → AST parser
│   ├── tableGenerator.ts        # AST → LaTeX serializer
│   ├── tableHoverProvider.ts    # Hover preview provider
│   └── tableValidator.ts        # Structure validation
├── preview/
│   └── tableCodeLens.ts         # CodeLens provider for tables
└── figures/
    └── tablePreview.ts          # Table rendering service
```

### 1.2 AST Definitions (tableParser.ts)

```typescript
// Core table types
export interface TableAST {
    environment: 'tabular' | 'tabularx' | 'longtable' | 'array' | 'tabu';
    columnSpec: ColumnSpec[];
    rows: TableRow[];
    options?: TableOptions;
    originalText: string;
}

export interface ColumnSpec {
    type: 'l' | 'c' | 'r' | 'p' | 'm' | 'b' | 'X';  // X for tabularx
    width?: string;  // for p{}, m{}, b{}
    separator?: boolean;  // | separator
}

export interface TableRow {
    cells: TableCell[];
    rules: RowRule[];  // hlines before/after
    isHeader?: boolean;
}

export interface TableCell {
    content: string;
    colspan?: number;  // multicolumn
    rowspan?: number;  // multirow
    alignment?: 'l' | 'c' | 'r';
    overrideColumnSpec?: string;
    raw?: boolean;  // preserve raw LaTeX
}

export interface RowRule {
    type: 'hline' | 'cline' | 'toprule' | 'midrule' | 'bottomrule';
    columns?: [number, number];  // for cline
}

export interface TableOptions {
    width?: string;  // for tabularx
    position?: string;  // [t], [b], [c]
    verticalAlignment?: string;
}
```

### 1.3 TableParser Implementation

**Key parsing features:**

1. **Environment Detection**: Identify table type from `\begin{...}`
2. **Column Spec Parsing**: Parse format string (e.g., `|l|c|r|p{3cm}|`)
3. **Row Parsing**: Split on `\\`, handle `\hline`, `\toprule`, etc.
4. **Cell Parsing**: Split on `&`, detect `\multicolumn`, `\multirow`
5. **Nested Table Detection**: Handle tables within cells
6. **Comment Preservation**: Track and preserve `%` comments

**Parser Structure:**
```typescript
export class TableParser {
    parse(latex: string): TableAST | null;
    private parseEnvironment(text: string): string;
    private parseColumnSpec(spec: string): ColumnSpec[];
    private parseRows(body: string): TableRow[];
    private parseCell(cellText: string): TableCell;
    private detectMulticolumn(text: string): {...} | null;
    private detectMultirow(text: string): {...} | null;
}
```

### 1.4 Grid Model (tableEditor.ts - internal)

```typescript
// Internal representation for editing
export class TableGrid {
    private cells: Cell[][];  // 2D array
    
    constructor(ast: TableAST);
    
    // Core operations
    insertRow(index: number, position: 'before' | 'after'): void;
    deleteRow(index: number): void;
    insertColumn(index: number, position: 'before' | 'after'): void;
    deleteColumn(index: number): void;
    
    // Cell operations
    mergeCells(selection: CellRange): void;
    splitCell(row: number, col: number): void;
    setCell(row: number, col: number, content: string): void;
    
    // Conversion
    toAST(): TableAST;
}

interface Cell {
    content: string;
    colspan: number;
    rowspan: number;
    alignment: 'l' | 'c' | 'r';
    isSpanned: boolean;  // part of a merged cell
}
```

## Phase 2: Basic Table Editor UI (Week 3-4)

### 2.1 Webview HTML/CSS/JS

Create spreadsheet-like interface with:

- **Grid rendering** using HTML `<table>` with editable cells
- **Navigation**: Arrow keys, Tab/Shift+Tab
- **Selection**: Click, drag, Shift+click for ranges
- **Toolbar**: Insert/delete row/column, merge/split cells
- **Cell editing**: Inline contentEditable with escape handling

### 2.2 TableEditor Class

```typescript
export class TableEditor {
    private panel: vscode.WebviewPanel | undefined;
    private sourceDocument: vscode.Uri | undefined;
    private tableRange: vscode.Range | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private parser: TableParser;
    private generator: TableGenerator;
    private tablePreview: TablePreview;
    private currentGrid: TableGrid | undefined;

    constructor(context: vscode.ExtensionContext, logger: Logger);
    
    // Main entry points
    async openEditor(tableCode?: string, range?: vscode.Range): Promise<void>;
    private extractTableFromEditor(editor: vscode.TextEditor): string | undefined;
    
    // Message handlers
    private async handleMessage(message: any): Promise<void>;
    private async handleGridUpdate(gridData: any): Promise<void>;
    private async handleInsertRow(data: any): Promise<void>;
    private async handleDeleteRow(data: any): Promise<void>;
    // ... more handlers
    
    // Sync operations
    private async updateSource(tableCode: string, isAutoUpdate: boolean): Promise<void>;
    private async refreshPreview(): Promise<void>;
}
```

### 2.3 Message Protocol

**Extension → Webview:**
- `setTable`: Load table data into grid
- `updatePreview`: Send rendered PNG
- `validationErrors`: Display validation issues

**Webview → Extension:**
- `gridUpdate`: Cell content changed (debounced)
- `insertRow/Column`: Structure modification
- `deleteRow/Column`: Structure modification
- `mergeCells`: Cell merge operation
- `splitCell`: Cell split operation
- `requestPreview`: Trigger preview refresh

## Phase 3: LaTeX Generation & Sync (Week 5)

### 3.1 TableGenerator Implementation

```typescript
export class TableGenerator {
    generate(ast: TableAST): string;
    
    private generateEnvironment(ast: TableAST): string;
    private generateColumnSpec(specs: ColumnSpec[]): string;
    private generateRow(row: TableRow): string;
    private generateCell(cell: TableCell): string;
    private generateRules(rules: RowRule[]): string;
    
    // Smart features
    private autoAlignNumbers(cells: TableCell[]): TableCell[];
    private prettyFormat(latex: string): string;
    private preserveComments(original: string, generated: string): string;
}
```

### 3.2 Bi-directional Sync

1. **Parse** existing LaTeX → Grid
2. **Edit** in visual UI
3. **Generate** Grid → LaTeX
4. **Update** source document with debouncing (800ms like figures/TikZ)

### 3.3 Format Preservation

- Preserve original indentation style
- Maintain comment positions
- Keep custom spacing
- Preserve `%` line continuations

## Phase 4: Preview & Rendering (Week 6)

### 4.1 TablePreview Service

```typescript
export class TablePreview {
    private buildSystem: BuildSystem;
    private logger: Logger;
    
    constructor(context: vscode.ExtensionContext, logger: Logger);
    
    async compileTableToPng(
        tableCode: string, 
        documentUri: vscode.Uri
    ): Promise<string | null>;  // Returns base64 PNG
    
    private async createStandaloneDocument(
        tableCode: string,
        preamble: string
    ): string;
    
    private async extractPreamble(documentUri: vscode.Uri): Promise<string>;
    private async compileToPdf(texContent: string, workDir: string): Promise<string | null>;
    private async convertPdfToPng(pdfPath: string): Promise<string>;
}
```

**Rendering Strategy:**
1. Extract document preamble (packages, custom commands)
2. Create minimal standalone document:
   ```latex
   \documentclass{article}
   % ... preamble ...
   \usepackage{booktabs}
   \usepackage{multirow}
   \usepackage{tabularx}
   \begin{document}
   \pagestyle{empty}
   % ... table code ...
   \end{document}
   ```
3. Compile with existing BuildSystem
4. Convert PDF → PNG (using pdf2svg + svg2png or pdftoppm)
5. Optimize PNG for display

### 4.2 Hover Provider

```typescript
export class TableHoverProvider implements vscode.HoverProvider {
    constructor(
        private context: vscode.ExtensionContext,
        private tablePreview: TablePreview,
        private logger: Logger
    );
    
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined>;
    
    private findTableAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { content: string; range: vscode.Range } | undefined;
    
    private createHoverWithImage(
        pngBase64: string, 
        range: vscode.Range
    ): vscode.Hover;
}
```

**Hover Features:**
- Pixel-perfect rendering
- Smart resizing (max 400px width, 300px height)
- Conditional clipping for tall tables
- "Open in Table Editor" link

### 4.3 CodeLens Provider

```typescript
export class TableCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[];
    
    private findTables(document: vscode.TextDocument): TableLocation[];
}
```

Shows **"✏️ Edit Table"** above each table environment.

## Phase 5: Advanced Features (Week 7-8)

### 5.1 Smart Editing Tools

**Auto-escaping:**
```typescript
export class CellContentProcessor {
    escapeSpecialChars(content: string): string {
        // % → \%
        // _ → \_
        // & → \&
        // # → \#
        // $ → \$
        // But preserve already escaped chars
    }
    
    unescapeForEditing(content: string): string;
}
```

**Column alignment tools:**
```typescript
interface AlignmentTool {
    alignNumbers(column: number): void;  // Align by decimal point
    autoFitWidth(column: number): string;  // Calculate optimal width
    changeAlignment(column: number, align: 'l' | 'c' | 'r'): void;
}
```

### 5.2 Authoring Tools

**CSV Import:**
```typescript
export class TableImporter {
    async importFromCSV(csvPath: string): Promise<TableAST>;
    async importFromClipboard(): Promise<TableAST>;
    
    private parseCSV(content: string): string[][];
    private detectDelimiter(content: string): string;
    private inferColumnAlignment(data: string[][]): ColumnSpec[];
}
```

**Template Generator:**
```typescript
export class TableTemplates {
    generateBootabs(rows: number, cols: number): TableAST;
    generateTabularx(rows: number, cols: number, width: string): TableAST;
    generateLongtable(rows: number, cols: number): TableAST;
    
    // Style presets
    applyJournalStyle(ast: TableAST, journal: 'IEEE' | 'ACM' | 'Elsevier'): TableAST;
}
```

### 5.3 Validation & Linting

```typescript
export class TableValidator {
    validate(ast: TableAST): ValidationError[];
    
    private checkColumnCount(ast: TableAST): ValidationError[];
    private checkMultirowOverlaps(ast: TableAST): ValidationError[];
    private checkUnescapedChars(ast: TableAST): ValidationError[];
    private checkMissingPackages(ast: TableAST): string[];  // booktabs, multirow, etc.
}

interface ValidationError {
    row?: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    fix?: () => TableAST;  // Auto-fix function
}
```

## Phase 6: Power Features (Week 9-10)

### 6.1 Data Operations

```typescript
export class TableDataOperations {
    sortByColumn(grid: TableGrid, column: number, order: 'asc' | 'desc'): TableGrid;
    duplicateRow(grid: TableGrid, rowIndex: number): TableGrid;
    
    // Statistics
    getColumnStatistics(grid: TableGrid, column: number): {
        count: number;
        mean?: number;
        min?: number;
        max?: number;
        type: 'numeric' | 'text' | 'mixed';
    };
    
    // Formulas (lightweight, optional)
    evaluateFormula(formula: string, context: Cell[][]): string;
}
```

### 6.2 Visual Styling

```typescript
export class TableStyling {
    applyBoldToRow(ast: TableAST, rowIndex: number): TableAST;
    applyBoldToColumn(ast: TableAST, columnIndex: number): TableAST;
    
    toggleMathMode(cell: TableCell): TableCell;
    
    // Cell background (requires xcolor package)
    setCellColor(cell: TableCell, color: string): TableCell;  // \cellcolor{...}
    
    // Column width helpers
    wrapColumnInP(columnSpec: ColumnSpec, width: string): ColumnSpec;
}
```

### 6.3 Export & Externalization

```typescript
export class TableExporter {
    async exportToStandalonePDF(ast: TableAST, outputPath: string): Promise<void>;
    async exportToImage(ast: TableAST, format: 'png' | 'svg', outputPath: string): Promise<void>;
    async copyAsMarkdown(grid: TableGrid): Promise<void>;
    async copyAsHTML(grid: TableGrid): Promise<void>;
}
```

## Phase 7: Polish & Integration (Week 11-12)

### 7.1 Performance Optimization

- **Debounced updates** (800ms like existing editors)
- **Incremental parsing** (only re-parse changed rows)
- **Preview caching** (cache rendered PNGs by content hash)
- **Virtual scrolling** for large tables (100+ rows)

### 7.2 User Experience

- **Keyboard shortcuts:**
  - `Ctrl+Enter`: Add row below
  - `Ctrl+Shift+Enter`: Add row above
  - `Ctrl++`: Add column right
  - `Ctrl+Shift++`: Add column left
  - `Delete`: Clear cell content
  - `Ctrl+M`: Merge selected cells
  - `Ctrl+Shift+M`: Split cell

- **Context menus:**
  - Right-click row header: Insert/delete/duplicate
  - Right-click column header: Insert/delete/alignment/width
  - Right-click cell: Merge/split/format

- **Undo/Redo:**
  - Track operation history
  - Support Ctrl+Z / Ctrl+Y

### 7.3 Configuration

```typescript
// settings.json
{
    "vtex.table.enableLivePreview": true,
    "vtex.table.autoUpdateDelay": 800,
    "vtex.table.defaultEnvironment": "tabular",
    "vtex.table.enableBootabs": true,
    "vtex.table.enableAutoEscape": true,
    "vtex.table.maxPreviewWidth": 400,
    "vtex.table.maxPreviewHeight": 300
}
```

## Integration Points

### Extension Registration (extension.ts)

```typescript
// In activate()
const tableEditor = new TableEditor(context, logger);
const tablePreview = new TablePreview(context, logger);
const tableHoverProvider = new TableHoverProvider(context, tablePreview, logger);
const tableCodeLensProvider = new TableCodeLensProvider(logger);
const tableValidator = new TableValidator();

// Register commands
context.subscriptions.push(
    vscode.commands.registerCommand('vtex.openTableEditor', (code, range) => 
        tableEditor.openEditor(code, range)),
    vscode.commands.registerCommand('vtex.insertTable', () => 
        tableEditor.insertNewTable()),
    vscode.commands.registerCommand('vtex.importTableFromCSV', () => 
        tableEditor.importFromCSV())
);

// Register providers
context.subscriptions.push(
    vscode.languages.registerHoverProvider('latex', tableHoverProvider),
    vscode.languages.registerCodeLensProvider('latex', tableCodeLensProvider)
);
```

## Testing Strategy

### Unit Tests
- Parser: Test all table environments, edge cases
- Generator: Verify round-trip parsing (LaTeX → AST → LaTeX)
- Grid operations: Test insert/delete/merge/split
- Validator: Test all validation rules

### Integration Tests
- End-to-end editing workflow
- Source sync accuracy
- Preview rendering correctness
- Performance benchmarks

### Manual Testing Checklist
- [ ] Parse existing tables from real LaTeX documents
- [ ] Edit complex tables with multirow/multicolumn
- [ ] Test all environments (tabular, tabularx, longtable)
- [ ] Verify hover preview rendering
- [ ] Test CSV import
- [ ] Validate special character escaping
- [ ] Check undo/redo functionality
- [ ] Test performance with large tables

## Risk Mitigation

### Parser Complexity
**Risk:** LaTeX table syntax is highly variable  
**Mitigation:** 
- Start with most common cases (tabular with basic features)
- Graceful degradation: show raw LaTeX for unsupported features
- Incremental feature support

### Preview Performance
**Risk:** Compiling tables is slow  
**Mitigation:**
- Aggressive caching by content hash
- Debounced updates (800ms)
- Show cached preview during compilation
- Optional: Disable auto-preview for large tables

### Synchronization Issues
**Risk:** Grid edits not accurately reflected in LaTeX  
**Mitigation:**
- Comprehensive round-trip tests
- Preserve original formatting where possible
- Clear warning if information loss occurs
- Allow manual LaTeX editing alongside visual editing

## Success Metrics

1. **Parsing Accuracy**: Successfully parse 95%+ of real-world tables
2. **Performance**: Preview updates in <2s for typical tables
3. **User Adoption**: 60%+ of table edits done through visual editor
4. **Reliability**: Zero data loss bugs in production
5. **Compatibility**: Works with all major table packages

## Dependencies

### Required Packages (Detection)
- `array` - Enhanced arrays and tables
- `booktabs` - Professional quality tables
- `multirow` - Cells spanning multiple rows
- `tabularx` - Auto-width tables
- `longtable` - Multi-page tables
- `xcolor` - Cell coloring (optional)

### VS Code APIs
- Webview API (editor UI)
- Hover Provider
- CodeLens Provider
- Commands API
- Document sync

### Internal Dependencies
- BuildSystem (for LaTeX compilation)
- Logger
- Config
- Existing preview infrastructure

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1 | 2 weeks | Parser + AST + Grid model |
| 2 | 2 weeks | Basic editor UI + navigation |
| 3 | 1 week | LaTeX generation + sync |
| 4 | 1 week | Preview + hover + CodeLens |
| 5 | 2 weeks | Smart editing + authoring tools |
| 6 | 2 weeks | Power features + operations |
| 7 | 2 weeks | Polish + testing + integration |
| **Total** | **12 weeks** | **Production-ready table editor** |

## Future Enhancements (Post-MVP)

- **AI-powered features:**
  - Auto-format messy tables
  - Suggest optimal column widths
  - Convert natural language to table structure

- **Collaboration:**
  - Highlight other users' cursors
  - Track who edited which cells

- **Advanced layouts:**
  - Nested tables editor
  - Table-within-table support
  - Custom column types (S for siunitx)

- **Data binding:**
  - Link cells to external data sources
  - Auto-update from CSV/JSON
  - Formula evaluation with references

## Conclusion

This implementation plan provides a comprehensive roadmap for building a production-quality table editor that matches the sophistication of existing figure and TikZ editors. The phased approach allows for:

1. **Early validation** of core concepts (parsing, grid model)
2. **Incremental user value** (basic editor → advanced features)
3. **Risk management** (test each layer before building next)
4. **Flexibility** (can adjust scope based on feedback)

The architecture follows proven patterns from the existing codebase while introducing table-specific innovations that will make vTeX the most powerful LaTeX table editor available.
