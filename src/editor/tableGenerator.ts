/**
 * LaTeX Table Generator
 * Generates LaTeX code from Table AST
 */

import { TableAST, TableRow, TableCell, ColumnSpec, RowRule } from './tableParser';

export class TableGenerator {
    private indentLevel: number = 0;
    private indentString: string = '    ';

    /**
     * Generate LaTeX code from AST
     */
    generate(ast: TableAST, preserveFormatting: boolean = true): string {
        const lines: string[] = [];
        
        // If wrapped in table environment, generate that first
        if (ast.hasTableEnvironment) {
            lines.push('\\begin{table}[htbp]');
            lines.push(this.indentString + '\\centering');
            
            // Caption at top if specified
            if (ast.caption && ast.captionPosition === 'top') {
                lines.push(this.indentString + `\\caption{${ast.caption}}`);
                if (ast.label) {
                    lines.push(this.indentString + `\\label{${ast.label}}`);
                }
            }
            
            // Indent the tabular content
            this.indentLevel = 1;
        }
        
        // Generate \begin line
        lines.push(this.indent() + this.generateBeginEnvironment(ast));
        
        // Generate preamble (for longtable)
        if (ast.preambleLines && ast.preambleLines.length > 0) {
            lines.push(...ast.preambleLines.map(line => this.indent() + line));
        }
        
        // Increase indent for table content
        this.indentLevel++;
        
        // Generate rows
        for (let i = 0; i < ast.rows.length; i++) {
            const row = ast.rows[i];
            
            // Rules above this row (smart conversion of hline to cline)
            const rulesAbove = this.generateSmartRules(row.rulesAbove, row, i, ast.rows);
            for (const rule of rulesAbove) {
                lines.push(this.indent() + rule);
            }
            
            // Row content
            const rowLine = this.generateRow(row, ast.columnSpec);
            lines.push(this.indent() + rowLine);
            
            // Rules below this row (smart conversion of hline to cline)
            const rulesBelow = this.generateSmartRules(row.rulesBelow, row, i + 1, ast.rows);
            for (const rule of rulesBelow) {
                lines.push(this.indent() + rule);
            }
        }
        
        // Decrease indent back
        this.indentLevel--;
        
        // Generate \end line
        lines.push(this.indent() + this.generateEndEnvironment(ast));
        
        // Caption at bottom if specified
        if (ast.hasTableEnvironment) {
            if (ast.caption && ast.captionPosition === 'bottom') {
                lines.push(this.indentString + `\\caption{${ast.caption}}`);
                if (ast.label) {
                    lines.push(this.indentString + `\\label{${ast.label}}`);
                }
            }
            
            // Close table environment
            lines.push('\\end{table}');
            
            // Reset indent
            this.indentLevel = 0;
        }
        
        return lines.join('\n');
    }

    /**
     * Generate \begin{environment} line
     */
    private generateBeginEnvironment(ast: TableAST): string {
        let line = `\\begin{${ast.environment}}`;
        
        // Add options if present
        if (ast.options?.position) {
            line += `[${ast.options.position}]`;
        }
        
        // Add width for tabularx
        if (ast.environment === 'tabularx' && ast.options?.width) {
            line += `{${ast.options.width}}`;
        }
        
        // Add column specification
        const columnSpec = this.generateColumnSpec(ast.columnSpec);
        line += `{${columnSpec}}`;
        
        return line;
    }

    /**
     * Generate \end{environment} line
     */
    private generateEndEnvironment(ast: TableAST): string {
        return `\\end{${ast.environment}}`;
    }

    /**
     * Generate column specification string
     */
    generateColumnSpec(columns: ColumnSpec[]): string {
        let spec = '';
        
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            
            // Add left border if this is the first column and has leftBorder
            if (i === 0 && col.leftBorder) {
                spec += '|';
            }
            
            // Handle separator columns
            if (col.type === '|') {
                spec += '|';
            } else if (col.type === '@') {
                spec += `@{${col.content || ''}}`;
            } else if (col.width) {
                spec += `${col.type}{${col.width}}`;
            } else {
                spec += col.type;
            }
            
            // Add right border for this column
            if (col.rightBorder) {
                spec += '|';
            }
        }
        
        return spec;
    }

    /**
     * Generate a table row
     */
    private generateRow(row: TableRow, columnSpec: ColumnSpec[]): string {
        const cellStrings = row.cells.map((cell, index) => this.generateCell(cell, columnSpec, index));
        return cellStrings.join(' & ') + ' \\\\';
    }

    /**
     * Generate a single cell
     */
    private generateCell(cell: TableCell, columnSpec: ColumnSpec[], columnIndex: number): string {
        // Skip if this is a spanned cell placeholder
        if (cell.isSpanned) {
            return '';
        }
        
        const hasColspan = cell.colspan && cell.colspan > 1;
        const hasRowspan = cell.rowspan && cell.rowspan > 1;
        
        // Handle both multicolumn and multirow
        if (hasColspan && hasRowspan) {
            const spec = this.inferColumnSpec(cell, columnSpec, columnIndex, cell.colspan!);
            const vAlign = this.getVerticalAlignment(cell);
            const width = '*';  // Auto width
            return `\\multicolumn{${cell.colspan}}{${spec}}{\\multirow{${cell.rowspan}}{${width}}${vAlign}{${cell.content}}}`;
        }
        
        // Handle multicolumn only
        if (hasColspan) {
            const spec = this.inferColumnSpec(cell, columnSpec, columnIndex, cell.colspan!);
            return `\\multicolumn{${cell.colspan}}{${spec}}{${cell.content}}`;
        }
        
        // Handle multirow only
        if (hasRowspan) {
            const vAlign = this.getVerticalAlignment(cell);
            const width = '*';  // Auto width
            return `\\multirow{${cell.rowspan}}{${width}}${vAlign}{${cell.content}}`;
        }
        
        // Regular cell
        return cell.content;
    }

    /**
     * Get vertical alignment for multirow
     */
    private getVerticalAlignment(cell: TableCell): string {
        if (!cell.verticalAlignment) {
            return '';  // Default is centered
        }
        
        // Map UI alignment to multirow positioning
        const alignMap: { [key: string]: string } = {
            'top': '[t]',
            'middle': '',  // Default
            'bottom': '[b]'
        };
        
        return alignMap[cell.verticalAlignment] || '';
    }

    /**
     * Infer column specification for multicolumn including borders
     */
    private inferColumnSpec(cell: TableCell, columnSpec: ColumnSpec[], columnIndex: number, colspan: number): string {
        // Use explicit override if provided
        if (cell.overrideColumnSpec) {
            return cell.overrideColumnSpec;
        }
        
        // Build column spec based on the columns being spanned
        const nonSeparatorColumns = columnSpec.filter(c => !c.isSeparator);
        
        // Get alignment (use cell alignment or first column's alignment)
        let alignment = cell.alignment;
        if (!alignment && columnIndex < nonSeparatorColumns.length) {
            const col = nonSeparatorColumns[columnIndex];
            alignment = (col.type === 'l' || col.type === 'c' || col.type === 'r') ? col.type : 'c';
        }
        if (!alignment) {
            alignment = 'c';
        }
        
        // Check for left border (from the first column being spanned)
        let spec = '';
        if (columnIndex < nonSeparatorColumns.length) {
            const firstCol = nonSeparatorColumns[columnIndex];
            if (firstCol.leftBorder) {
                spec += '|';
            }
        }
        
        // Add alignment
        spec += alignment;
        
        // Check for right border (from the last column being spanned)
        const lastColIndex = columnIndex + colspan - 1;
        if (lastColIndex < nonSeparatorColumns.length) {
            const lastCol = nonSeparatorColumns[lastColIndex];
            if (lastCol.rightBorder) {
                spec += '|';
            }
        }
        
        return spec;
    }

    /**
     * Check if a row has multirow cells that span into the next row
     */
    private hasMultirowSpanning(row: TableRow, rowIndex: number, totalRows: number): boolean {
        return row.cells.some(cell => {
            return !cell.isSpanned && cell.rowspan && cell.rowspan > 1;
        });
    }

    /**
     * Generate smart horizontal rules considering multirow cells
     * Converts hline to appropriate cline when multirow cells are present
     */
    private generateSmartRules(rules: RowRule[], currentRow: TableRow, rowIndex: number, allRows: TableRow[]): string[] {
        const result: string[] = [];
        
        for (const rule of rules) {
            if (rule.type === 'hline') {
                // Check if any cells in previous rows are spanning into this position
                const columnsWithMultirow: Set<number> = new Set();
                
                // Check previous rows for multirow cells that span into current position
                for (let r = 0; r < rowIndex; r++) {
                    let colIndex = 0;
                    for (let c = 0; c < allRows[r].cells.length; c++) {
                        const cell = allRows[r].cells[c];
                        
                        // Skip spanned cells - they don't occupy a column position
                        if (cell.isSpanned) {
                            continue;
                        }
                        
                        const rowspan = cell.rowspan || 1;
                        const colspan = cell.colspan || 1;
                        
                        // Check if this cell spans into the current row
                        if (rowspan > 1 && r + rowspan > rowIndex) {
                            // Mark all columns this cell spans
                            for (let span = 0; span < colspan; span++) {
                                columnsWithMultirow.add(colIndex + span);
                            }
                        }
                        
                        // Move to next column position (considering colspan)
                        colIndex += colspan;
                    }
                }
                
                // If there are multirow cells, generate cline segments
                if (columnsWithMultirow.size > 0) {
                    // Calculate total columns from the column spec (non-separator columns)
                    const nonSeparatorColumns = currentRow.cells.filter(c => !c.isSpanned);
                    let totalColumns = 0;
                    for (const cell of nonSeparatorColumns) {
                        totalColumns += (cell.colspan || 1);
                    }
                    
                    const segments: Array<[number, number]> = [];
                    let segmentStart: number | null = null;
                    
                    for (let col = 0; col < totalColumns; col++) {
                        if (!columnsWithMultirow.has(col)) {
                            if (segmentStart === null) {
                                segmentStart = col;
                            }
                        } else {
                            if (segmentStart !== null) {
                                segments.push([segmentStart + 1, col]); // LaTeX columns are 1-indexed
                                segmentStart = null;
                            }
                        }
                    }
                    
                    // Close last segment
                    if (segmentStart !== null) {
                        segments.push([segmentStart + 1, totalColumns]);
                    }
                    
                    // Generate cline for each segment
                    for (const [start, end] of segments) {
                        result.push(`\\cline{${start}-${end}}`);
                    }
                } else {
                    // No multirow cells, use hline
                    result.push('\\hline');
                }
            } else {
                // Other rule types (cline, toprule, etc.) pass through
                result.push(this.generateRule(rule));
            }
        }
        
        return result;
    }

    /**
     * Generate a horizontal rule
     */
    private generateRule(rule: RowRule): string {
        switch (rule.type) {
            case 'hline':
                return '\\hline';
            
            case 'cline':
                if (rule.columns) {
                    return `\\cline{${rule.columns[0]}-${rule.columns[1]}}`;
                }
                return '\\hline';
            
            case 'toprule':
                return '\\toprule';
            
            case 'midrule':
                return '\\midrule';
            
            case 'bottomrule':
                return '\\bottomrule';
            
            case 'cmidrule':
                if (rule.columns) {
                    const trim = rule.trim || '';
                    return `\\cmidrule${trim}{${rule.columns[0]}-${rule.columns[1]}}`;
                }
                return '\\midrule';
            
            default:
                return '';
        }
    }

    /**
     * Get indentation string
     */
    private indent(): string {
        return this.indentString.repeat(this.indentLevel);
    }

    /**
     * Pretty format LaTeX code
     */
    prettyFormat(latex: string): string {
        const lines = latex.split('\n');
        const formatted: string[] = [];
        let indentLevel = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Decrease indent for \end
            if (trimmed.startsWith('\\end{')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            
            // Add indented line
            if (trimmed) {
                formatted.push(this.indentString.repeat(indentLevel) + trimmed);
            } else {
                formatted.push('');
            }
            
            // Increase indent for \begin
            if (trimmed.startsWith('\\begin{')) {
                indentLevel++;
            }
        }
        
        return formatted.join('\n');
    }

    /**
     * Align numbers by decimal point in a column
     */
    alignNumbersByDecimal(cells: TableCell[]): TableCell[] {
        // Find maximum digits before and after decimal
        let maxBefore = 0;
        let maxAfter = 0;
        
        for (const cell of cells) {
            const content = cell.content.trim();
            const match = content.match(/^(-?\d+)\.(\d+)$/);
            if (match) {
                maxBefore = Math.max(maxBefore, match[1].length);
                maxAfter = Math.max(maxAfter, match[2].length);
            }
        }
        
        // Pad cells
        return cells.map(cell => {
            const content = cell.content.trim();
            const match = content.match(/^(-?\d+)\.(\d+)$/);
            if (match) {
                const before = match[1].padStart(maxBefore, ' ');
                const after = match[2].padEnd(maxAfter, '0');
                return {
                    ...cell,
                    content: `${before}.${after}`
                };
            }
            return cell;
        });
    }

    /**
     * Auto-escape special LaTeX characters
     */
    escapeSpecialChars(text: string): string {
        // Don't escape if already escaped or inside commands
        const chars: { [key: string]: string } = {
            '%': '\\%',
            '_': '\\_',
            '&': '\\&',
            '#': '\\#',
            '$': '\\$',
            '{': '\\{',
            '}': '\\}',
            '~': '\\textasciitilde{}',
            '^': '\\textasciicircum{}'
        };
        
        let result = text;
        for (const [char, escaped] of Object.entries(chars)) {
            // Only escape if not already escaped
            const regex = new RegExp(`(?<!\\\\)${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
            result = result.replace(regex, escaped);
        }
        
        return result;
    }

    /**
     * Unescape special characters for editing
     */
    unescapeSpecialChars(text: string): string {
        const replacements: { [key: string]: string } = {
            '\\%': '%',
            '\\_': '_',
            '\\&': '&',
            '\\#': '#',
            '\\$': '$',
            '\\{': '{',
            '\\}': '}',
            '\\textasciitilde{}': '~',
            '\\textasciicircum{}': '^'
        };
        
        let result = text;
        for (const [escaped, char] of Object.entries(replacements)) {
            result = result.replace(new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), char);
        }
        
        return result;
    }
}
