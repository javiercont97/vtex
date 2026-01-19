/**
 * LaTeX Table Validator
 * Validates table structure and detects common issues
 */

import { TableAST, TableRow, TableCell } from './tableParser';

export interface ValidationError {
    row?: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code: string;
    fix?: () => TableAST;
}

export class TableValidator {
    /**
     * Validate table structure
     */
    validate(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        
        // Check column count consistency
        errors.push(...this.checkColumnCount(ast));
        
        // Check unescaped special characters
        errors.push(...this.checkUnescapedChars(ast));
        
        // Check multirow/multicolumn overlaps
        errors.push(...this.checkSpanOverlaps(ast));
        
        // Check missing packages
        errors.push(...this.checkMissingPackages(ast));
        
        // Check empty cells
        errors.push(...this.checkEmptyCells(ast));
        
        return errors;
    }

    /**
     * Check if all rows have consistent column count
     */
    private checkColumnCount(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        const expectedColumns = ast.columnSpec.filter(c => !c.isSeparator).length;
        
        ast.rows.forEach((row, rowIndex) => {
            let actualColumns = 0;
            
            row.cells.forEach(cell => {
                if (!cell.isSpanned) {
                    actualColumns += cell.colspan || 1;
                }
            });
            
            if (actualColumns !== expectedColumns) {
                errors.push({
                    row: rowIndex,
                    message: `Row has ${actualColumns} columns but table expects ${expectedColumns}`,
                    severity: 'error',
                    code: 'column-count-mismatch'
                });
            }
        });
        
        return errors;
    }

    /**
     * Check for unescaped special characters
     */
    private checkUnescapedChars(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        const specialChars = ['%', '_', '&', '#', '$'];
        
        ast.rows.forEach((row, rowIndex) => {
            row.cells.forEach((cell, colIndex) => {
                for (const char of specialChars) {
                    // Check if character appears without backslash
                    const regex = new RegExp(`(?<!\\\\)${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
                    if (regex.test(cell.content)) {
                        errors.push({
                            row: rowIndex,
                            column: colIndex,
                            message: `Unescaped special character '${char}' found. Use '\\${char}' instead.`,
                            severity: 'warning',
                            code: 'unescaped-char'
                        });
                    }
                }
            });
        });
        
        return errors;
    }

    /**
     * Check for multirow/multicolumn overlaps
     */
    private checkSpanOverlaps(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        const expectedColumns = ast.columnSpec.filter(c => !c.isSeparator).length;
        
        // Create a grid to track which cells are occupied
        const occupied: boolean[][] = [];
        for (let i = 0; i < ast.rows.length; i++) {
            occupied[i] = new Array(expectedColumns).fill(false);
        }
        
        // Mark occupied cells
        ast.rows.forEach((row, rowIndex) => {
            let colIndex = 0;
            
            row.cells.forEach(cell => {
                // Skip already occupied cells
                while (colIndex < expectedColumns && occupied[rowIndex][colIndex]) {
                    colIndex++;
                }
                
                if (colIndex >= expectedColumns) {
                    return;
                }
                
                // Mark cells as occupied
                const colspan = cell.colspan || 1;
                const rowspan = cell.rowspan || 1;
                
                for (let r = 0; r < rowspan; r++) {
                    for (let c = 0; c < colspan; c++) {
                        const targetRow = rowIndex + r;
                        const targetCol = colIndex + c;
                        
                        if (targetRow < ast.rows.length && targetCol < expectedColumns) {
                            if (occupied[targetRow][targetCol] && (r > 0 || c > 0)) {
                                errors.push({
                                    row: targetRow,
                                    column: targetCol,
                                    message: 'Cell overlap detected from multirow/multicolumn',
                                    severity: 'error',
                                    code: 'cell-overlap'
                                });
                            }
                            occupied[targetRow][targetCol] = true;
                        }
                    }
                }
                
                colIndex += colspan;
            });
        });
        
        return errors;
    }

    /**
     * Check for required packages based on table features
     */
    private checkMissingPackages(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        const requiredPackages: Set<string> = new Set();
        
        // Check for features requiring specific packages
        let hasMultirow = false;
        let hasBootabs = false;
        
        ast.rows.forEach(row => {
            // Check for booktabs rules
            if (row.rulesAbove.some(r => ['toprule', 'midrule', 'bottomrule', 'cmidrule'].includes(r.type))) {
                hasBootabs = true;
            }
            if (row.rulesBelow.some(r => ['toprule', 'midrule', 'bottomrule', 'cmidrule'].includes(r.type))) {
                hasBootabs = true;
            }
            
            // Check for multirow
            row.cells.forEach(cell => {
                if (cell.rowspan && cell.rowspan > 1) {
                    hasMultirow = true;
                }
            });
        });
        
        // Check environment-specific packages
        if (ast.environment === 'tabularx') {
            requiredPackages.add('tabularx');
        }
        if (ast.environment === 'longtable') {
            requiredPackages.add('longtable');
        }
        if (ast.environment === 'tabu') {
            requiredPackages.add('tabu');
        }
        
        if (hasMultirow) {
            requiredPackages.add('multirow');
        }
        if (hasBootabs) {
            requiredPackages.add('booktabs');
        }
        
        // Add info messages about required packages
        requiredPackages.forEach(pkg => {
            errors.push({
                message: `Table requires \\usepackage{${pkg}}`,
                severity: 'info',
                code: 'required-package'
            });
        });
        
        return errors;
    }

    /**
     * Check for empty cells that might be intentional or errors
     */
    private checkEmptyCells(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        
        ast.rows.forEach((row, rowIndex) => {
            row.cells.forEach((cell, colIndex) => {
                if (!cell.content.trim() && !cell.isSpanned) {
                    // Empty cell - this might be intentional, so just info
                    errors.push({
                        row: rowIndex,
                        column: colIndex,
                        message: 'Empty cell',
                        severity: 'info',
                        code: 'empty-cell'
                    });
                }
            });
        });
        
        return errors;
    }

    /**
     * Check if table is too wide (more than 10 columns)
     */
    checkTableWidth(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        const columnCount = ast.columnSpec.filter(c => !c.isSeparator).length;
        
        if (columnCount > 10) {
            errors.push({
                message: `Table has ${columnCount} columns which may be too wide for the page`,
                severity: 'warning',
                code: 'table-too-wide'
            });
        }
        
        return errors;
    }

    /**
     * Check if table is too long (more than 50 rows)
     */
    checkTableLength(ast: TableAST): ValidationError[] {
        const errors: ValidationError[] = [];
        
        if (ast.rows.length > 50 && ast.environment !== 'longtable') {
            errors.push({
                message: `Table has ${ast.rows.length} rows. Consider using 'longtable' environment for multi-page tables`,
                severity: 'warning',
                code: 'table-too-long'
            });
        }
        
        return errors;
    }
}
