/**
 * LaTeX Table Parser
 * Parses LaTeX table environments into an Abstract Syntax Tree
 */

// ============================================================================
// AST Type Definitions
// ============================================================================

/**
 * Main table AST structure
 */
export interface TableAST {
    environment: 'tabular' | 'tabularx' | 'longtable' | 'array' | 'tabu';
    columnSpec: ColumnSpec[];
    rows: TableRow[];
    options?: TableOptions;
    originalText: string;
    preambleLines: string[];  // Lines before first row (for longtable headers)
    // Table environment wrapper (optional)
    hasTableEnvironment?: boolean;
    caption?: string;
    captionPosition?: 'top' | 'bottom';
    label?: string;
}

/**
 * Column specification (format string)
 */
export interface ColumnSpec {
    type: 'l' | 'c' | 'r' | 'p' | 'm' | 'b' | 'X' | '|' | '@';
    width?: string;  // for p{}, m{}, b{}
    content?: string;  // for @{...}
    isSeparator?: boolean;  // true for | and @
    leftBorder?: boolean;  // track if this column has left border
    rightBorder?: boolean;  // track if this column has right border
}

/**
 * Table row
 */
export interface TableRow {
    cells: TableCell[];
    rulesAbove: RowRule[];  // Rules before this row
    rulesBelow: RowRule[];  // Rules after this row
    isHeader?: boolean;
    originalText?: string;
}

/**
 * Table cell
 */
export interface TableCell {
    content: string;
    colspan?: number;  // multicolumn span
    rowspan?: number;  // multirow span
    alignment?: 'l' | 'c' | 'r';
    verticalAlignment?: 'top' | 'middle' | 'bottom';  // for multirow
    overrideColumnSpec?: string;  // full column spec for multicolumn
    isSpanned?: boolean;  // true if this is a placeholder for a spanning cell
    raw?: boolean;  // preserve raw LaTeX without parsing
}

/**
 * Row rule (horizontal line)
 */
export interface RowRule {
    type: 'hline' | 'cline' | 'toprule' | 'midrule' | 'bottomrule' | 'cmidrule';
    columns?: [number, number];  // for cline/cmidrule: columns affected
    trim?: string;  // for cmidrule: (l), (r), (lr)
}

/**
 * Table options
 */
export interface TableOptions {
    width?: string;  // for tabularx
    position?: string;  // [t], [b], [c]
    verticalAlignment?: string;
}

// ============================================================================
// Parser Implementation
// ============================================================================

export class TableParser {
    /**
     * Parse LaTeX table code into AST
     */
    parse(latex: string): TableAST | null {
        const trimmed = latex.trim();
        
        // Check if wrapped in table environment
        const tableEnvMatch = trimmed.match(/^\\begin\{table\}([\s\S]*?)\\end\{table\}$/);
        let hasTableEnvironment = false;
        let caption: string | undefined;
        let captionPosition: 'top' | 'bottom' | undefined;
        let label: string | undefined;
        let tabularContent = trimmed;
        
        if (tableEnvMatch) {
            hasTableEnvironment = true;
            const tableContent = tableEnvMatch[1];
            
            // Extract caption
            const captionMatch = tableContent.match(/\\caption\{([^}]*)\}/);
            if (captionMatch) {
                caption = captionMatch[1];
                
                // Determine caption position (check if it appears before tabular)
                const tabularIndex = tableContent.indexOf('\\begin{tabular');
                const captionIndex = tableContent.indexOf('\\caption');
                captionPosition = captionIndex < tabularIndex ? 'top' : 'bottom';
            }
            
            // Extract label
            const labelMatch = tableContent.match(/\\label\{([^}]*)\}/);
            if (labelMatch) {
                label = labelMatch[1];
            }
            
            // Extract the tabular content
            const tabularMatch = tableContent.match(/(\\begin\{(?:tabular\*?|tabularx|longtable|array|tabu)\}[\s\S]*?\\end\{(?:tabular\*?|tabularx|longtable|array|tabu)\})/);
            if (tabularMatch) {
                tabularContent = tabularMatch[1];
            }
        }
        
        // Detect environment
        const envMatch = tabularContent.match(/\\begin\{(tabular\*?|tabularx|longtable|array|tabu)\}/);
        if (!envMatch) {
            return null;
        }

        const environment = this.normalizeEnvironment(envMatch[1]);
        
        // Extract options and column spec
        const { options, columnSpec, bodyStart } = this.parseHeader(tabularContent, environment);
        
        // Extract body (between \begin and \end)
        const bodyMatch = tabularContent.match(
            new RegExp(`\\\\begin\\{${envMatch[1]}\\}.*?\\n([\\s\\S]*?)\\\\end\\{${envMatch[1]}\\}`)
        );
        
        if (!bodyMatch) {
            return null;
        }

        const bodyText = bodyMatch[1];
        
        // Parse rows
        const { rows, preambleLines } = this.parseRows(bodyText, columnSpec.filter(c => !c.isSeparator).length);

        return {
            environment,
            columnSpec,
            rows,
            options,
            originalText: latex,
            preambleLines,
            hasTableEnvironment,
            caption,
            captionPosition,
            label
        };
    }

    /**
     * Normalize environment name
     */
    private normalizeEnvironment(env: string): TableAST['environment'] {
        if (env === 'tabular*' || env === 'tabular') return 'tabular';
        if (env === 'tabularx') return 'tabularx';
        if (env === 'longtable') return 'longtable';
        if (env === 'array') return 'array';
        if (env === 'tabu') return 'tabu';
        return 'tabular';
    }

    /**
     * Parse table header (options and column spec)
     */
    private parseHeader(latex: string, environment: string): {
        options?: TableOptions;
        columnSpec: ColumnSpec[];
        bodyStart: number;
    } {
        let options: TableOptions | undefined;
        let columnSpec: ColumnSpec[] = [];
        
        // Pattern: \begin{env}[options]{columnspec} or \begin{env}{width}{columnspec} for tabularx
        let pattern: RegExp;
        
        if (environment === 'tabularx') {
            // tabularx: \begin{tabularx}{width}{columnspec}
            pattern = /\\begin\{tabularx\}\{([^}]+)\}\{([^}]+)\}/;
            const match = latex.match(pattern);
            if (match) {
                options = { width: match[1] };
                columnSpec = this.parseColumnSpec(match[2]);
            }
        } else {
            // Other environments: \begin{env}[options]{columnspec}
            pattern = /\\begin\{[^}]+\}(\[[^\]]*\])?\{([^}]+)\}/;
            const match = latex.match(pattern);
            if (match) {
                if (match[1]) {
                    options = { position: match[1].slice(1, -1) };
                }
                columnSpec = this.parseColumnSpec(match[2]);
            }
        }

        return { options, columnSpec, bodyStart: 0 };
    }

    /**
     * Parse column specification string
     */
    parseColumnSpec(spec: string): ColumnSpec[] {
        const columns: ColumnSpec[] = [];
        let i = 0;
        let pendingLeftBorder = false;

        while (i < spec.length) {
            const char = spec[i];

            // Simple column types
            if (['l', 'c', 'r', 'X'].includes(char)) {
                columns.push({ 
                    type: char as any, 
                    isSeparator: false,
                    leftBorder: pendingLeftBorder
                });
                pendingLeftBorder = false;
                i++;
            }
            // Separator - mark as border for next column
            else if (char === '|') {
                if (columns.length === 0) {
                    // Border before first column
                    pendingLeftBorder = true;
                } else {
                    // Border after previous column
                    columns[columns.length - 1].rightBorder = true;
                }
                i++;
            }
            // Width-based columns: p{width}, m{width}, b{width}
            else if (['p', 'm', 'b'].includes(char) && spec[i + 1] === '{') {
                const widthStart = i + 2;
                let braceCount = 1;
                let widthEnd = widthStart;
                
                while (widthEnd < spec.length && braceCount > 0) {
                    if (spec[widthEnd] === '{') braceCount++;
                    if (spec[widthEnd] === '}') braceCount--;
                    widthEnd++;
                }
                
                const width = spec.substring(widthStart, widthEnd - 1);
                columns.push({
                    type: char as any,
                    width,
                    isSeparator: false,
                    leftBorder: pendingLeftBorder
                });
                pendingLeftBorder = false;
                i = widthEnd;
            }
            // @{content} - custom separator (skip these for now)
            else if (char === '@' && spec[i + 1] === '{') {
                const contentStart = i + 2;
                let braceCount = 1;
                let contentEnd = contentStart;
                
                while (contentEnd < spec.length && braceCount > 0) {
                    if (spec[contentEnd] === '{') braceCount++;
                    if (spec[contentEnd] === '}') braceCount--;
                    contentEnd++;
                }
                i = contentEnd;
            }
            // Skip whitespace
            else if (char === ' ' || char === '\t' || char === '\n') {
                i++;
            }
            // Unknown character - skip
            else {
                i++;
            }
        }

        return columns;
    }

    /**
     * Parse table rows
     */
    private parseRows(bodyText: string, expectedColumns: number): {
        rows: TableRow[];
        preambleLines: string[];
    } {
        const rows: TableRow[] = [];
        const preambleLines: string[] = [];
        
        // Split by \\ but be careful about escaped backslashes
        // First, split by lines and process
        const lines = bodyText.split('\n');
        let currentRowText = '';
        let rulesAbove: RowRule[] = [];
        let inPreamble = true;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) {
                continue;
            }
            
            // Check for horizontal rules
            const rule = this.parseRule(line);
            if (rule) {
                if (currentRowText.trim()) {
                    // Rule after content - add as rulesBelow of previous row
                    if (rows.length > 0) {
                        rows[rows.length - 1].rulesBelow.push(rule);
                    }
                } else {
                    // Rule before content - add to rulesAbove
                    rulesAbove.push(rule);
                }
                continue;
            }
            
            // Check for longtable-specific commands
            if (line.match(/\\(endhead|endfirsthead|endfoot|endlastfoot)/)) {
                preambleLines.push(line);
                inPreamble = false;
                continue;
            }
            
            // Regular content line
            currentRowText += (currentRowText ? ' ' : '') + line;
            
            // Check if row is complete (ends with \\)
            if (line.match(/\\\\(\s*\[[^\]]*\])?\s*$/)) {
                // Remove the \\ and parse row
                const rowContent = currentRowText.replace(/\\\\(\s*\[[^\]]*\])?\s*$/, '');
                const cells = this.parseCells(rowContent, expectedColumns);
                
                rows.push({
                    cells,
                    rulesAbove,
                    rulesBelow: [],
                    originalText: currentRowText
                });
                
                currentRowText = '';
                rulesAbove = [];
                inPreamble = false;
            }
        }
        
        // Handle last row if it doesn't end with \\
        if (currentRowText.trim()) {
            const cells = this.parseCells(currentRowText, expectedColumns);
            rows.push({
                cells,
                rulesAbove,
                rulesBelow: [],
                originalText: currentRowText
            });
        }

        return { rows, preambleLines };
    }

    /**
     * Parse a horizontal rule command
     */
    private parseRule(line: string): RowRule | null {
        // \hline
        if (line.match(/^\\hline\s*$/)) {
            return { type: 'hline' };
        }
        
        // \cline{start-end}
        const clineMatch = line.match(/^\\cline\{(\d+)-(\d+)\}\s*$/);
        if (clineMatch) {
            return {
                type: 'cline',
                columns: [parseInt(clineMatch[1]), parseInt(clineMatch[2])]
            };
        }
        
        // \toprule, \midrule, \bottomrule (booktabs)
        if (line.match(/^\\(toprule|midrule|bottomrule)\s*$/)) {
            const type = line.match(/\\(toprule|midrule|bottomrule)/)![1] as RowRule['type'];
            return { type };
        }
        
        // \cmidrule[trim]{start-end}
        const cmidruleMatch = line.match(/^\\cmidrule(\([lr]+\))?\{(\d+)-(\d+)\}\s*$/);
        if (cmidruleMatch) {
            return {
                type: 'cmidrule',
                trim: cmidruleMatch[1] || undefined,
                columns: [parseInt(cmidruleMatch[2]), parseInt(cmidruleMatch[3])]
            };
        }
        
        return null;
    }

    /**
     * Parse cells from a row
     */
    private parseCells(rowText: string, expectedColumns: number): TableCell[] {
        const cells: TableCell[] = [];
        
        // Split by & but be careful about escaped & and & inside braces
        const parts = this.splitByUnescapedAmpersand(rowText);
        
        for (const part of parts) {
            const cell = this.parseCell(part.trim());
            cells.push(cell);
        }
        
        // Fill missing columns
        while (cells.length < expectedColumns) {
            cells.push({ content: '' });
        }
        
        return cells;
    }

    /**
     * Parse a single cell
     */
    private parseCell(cellText: string): TableCell {
        // Check for \multicolumn{n}{spec}{content}
        const multicolMatch = cellText.match(/^\\multicolumn\{(\d+)\}\{([^}]*)\}\{(.*)\}$/s);
        if (multicolMatch) {
            const colspan = parseInt(multicolMatch[1]);
            const spec = multicolMatch[2];
            const content = multicolMatch[3];
            
            // Parse alignment from spec
            let alignment: 'l' | 'c' | 'r' | undefined;
            if (spec.includes('l')) alignment = 'l';
            else if (spec.includes('c')) alignment = 'c';
            else if (spec.includes('r')) alignment = 'r';
            
            return {
                content,
                colspan,
                alignment,
                overrideColumnSpec: spec
            };
        }
        
        // Check for \multirow{n}{width}{content}
        const multirowMatch = cellText.match(/^\\multirow\{(\d+)\}\{([^}]*)\}\{(.*)\}$/s);
        if (multirowMatch) {
            const rowspan = parseInt(multirowMatch[1]);
            const width = multirowMatch[2];
            const content = multirowMatch[3];
            
            return {
                content,
                rowspan
            };
        }
        
        // Regular cell
        return {
            content: cellText
        };
    }

    /**
     * Split string by unescaped & (not \&, not inside braces)
     */
    private splitByUnescapedAmpersand(text: string): string[] {
        const parts: string[] = [];
        let current = '';
        let braceDepth = 0;
        let i = 0;
        
        while (i < text.length) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';
            
            if (char === '{') {
                braceDepth++;
                current += char;
                i++;
            } else if (char === '}') {
                braceDepth--;
                current += char;
                i++;
            } else if (char === '&' && prevChar !== '\\' && braceDepth === 0) {
                // Unescaped & at depth 0 - split here
                parts.push(current);
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        // Add last part
        if (current) {
            parts.push(current);
        }
        
        return parts;
    }

    /**
     * Extract table at cursor position
     */
    findTableAtPosition(document: vscode.TextDocument, position: vscode.Position): {
        content: string;
        range: vscode.Range;
        environment: string;
    } | null {
        const text = document.getText();
        const cursorOffset = document.offsetAt(position);
        
        // First, try to find table environment wrapper
        const tableWrapperRegex = /\\begin\{table\}[\s\S]*?\\end\{table\}/g;
        let wrapperMatch: RegExpExecArray | null;
        
        while ((wrapperMatch = tableWrapperRegex.exec(text)) !== null) {
            const startOffset = wrapperMatch.index;
            const endOffset = wrapperMatch.index + wrapperMatch[0].length;
            
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
                const startPos = document.positionAt(startOffset);
                const endPos = document.positionAt(endOffset);
                return {
                    content: wrapperMatch[0],
                    range: new vscode.Range(startPos, endPos),
                    environment: 'table'
                };
            }
        }
        
        // Then find standalone tabular environments
        const tableRegex = /\\begin\{(tabular\*?|tabularx|longtable|array|tabu)\}[\s\S]*?\\end\{\1\}/g;
        let match: RegExpExecArray | null;
        
        while ((match = tableRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
                return {
                    content: match[0],
                    range: new vscode.Range(startPos, endPos),
                    environment: match[1]
                };
            }
        }
        
        return null;
    }
}

/**
 * VS Code import for type checking
 */
import * as vscode from 'vscode';
