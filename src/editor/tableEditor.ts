/**
 * Table Editor
 * Visual WYSIWYG editor for LaTeX tables
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { TableParser, TableAST, TableCell as ParsedTableCell } from './tableParser';
import { TableGenerator } from './tableGenerator';
import { TablePreview } from '../figures/tablePreview';
import { TableValidator } from './tableValidator';

/**
 * Grid representation for editing
 */
class TableGrid {
    cells: GridCell[][];
    columnSpec: any[];

    constructor(ast: TableAST) {
        this.columnSpec = ast.columnSpec.filter(c => !c.isSeparator);
        this.cells = this.buildGrid(ast);
    }

    private buildGrid(ast: TableAST): GridCell[][] {
        const grid: GridCell[][] = [];
        
        for (let rowIndex = 0; rowIndex < ast.rows.length; rowIndex++) {
            const row = ast.rows[rowIndex];
            const gridRow: GridCell[] = [];
            
            let colIndex = 0;
            for (const cell of row.cells) {
                // Skip cells that are spanned from above
                while (colIndex < this.columnSpec.length && 
                       this.isSpannedFromAbove(grid, rowIndex, colIndex)) {
                    gridRow.push({ content: '', isSpanned: true, spanSource: 'above' });
                    colIndex++;
                }
                
                if (colIndex >= this.columnSpec.length) {break;}
                
                const colspan = cell.colspan || 1;
                const rowspan = cell.rowspan || 1;
                
                // Use cell alignment if specified, otherwise use column alignment from columnSpec
                const columnAlignment = this.columnSpec[colIndex]?.type || 'c';
                
                gridRow.push({
                    content: cell.content,
                    colspan,
                    rowspan,
                    alignment: cell.alignment || columnAlignment,
                    verticalAlignment: cell.verticalAlignment,
                    isSpanned: false
                });
                colIndex++;
                
                // Add spanned cells for colspan
                for (let i = 1; i < colspan; i++) {
                    if (colIndex < this.columnSpec.length) {
                        gridRow.push({ content: '', isSpanned: true, spanSource: 'left' });
                        colIndex++;
                    }
                }
            }
            
            // Fill remaining columns with empty cells that have correct alignment
            while (gridRow.length < this.columnSpec.length) {
                const colIdx = gridRow.length;
                const columnAlignment = this.columnSpec[colIdx]?.type || 'c';
                gridRow.push({ 
                    content: '', 
                    isSpanned: false,
                    alignment: columnAlignment
                });
            }
            
            grid.push(gridRow);
        }
        
        return grid;
    }

    private isSpannedFromAbove(grid: GridCell[][], row: number, col: number): boolean {
        for (let r = row - 1; r >= 0; r--) {
            if (grid[r] && grid[r][col]) {
                const cell = grid[r][col];
                if (cell.rowspan && cell.rowspan > (row - r)) {
                    return true;
                }
            }
        }
        return false;
    }

    toAST(originalAST: TableAST): TableAST {
        // Convert grid back to AST, preserving row rules from original
        const rows = this.cells.map((row, rowIndex) => {
            const cells = row
                .filter(cell => !cell.isSpanned)
                .map(cell => ({
                    content: cell.content,
                    colspan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
                    rowspan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
                    alignment: cell.alignment,
                    verticalAlignment: cell.verticalAlignment
                }));
            
            // Preserve rules from original AST if row exists
            const originalRow = originalAST.rows[rowIndex];
            return {
                cells,
                rulesAbove: originalRow?.rulesAbove || [],
                rulesBelow: originalRow?.rulesBelow || []
            };
        });
        
        return {
            ...originalAST,
            rows
        };
    }
}

interface GridCell {
    content: string;
    colspan?: number;
    rowspan?: number;
    alignment?: 'l' | 'c' | 'r';
    verticalAlignment?: 'top' | 'middle' | 'bottom';
    isSpanned: boolean;
    spanSource?: 'left' | 'above';
}

interface TableCell {
    content: string;
}

interface TableData {
    rows: number;
    cols: number;
    cells: TableCell[][];
    caption: string;
    label: string;
    alignment: string[];
}

export class TableEditor {
    private panel: vscode.WebviewPanel | undefined;
    private sourceDocument: vscode.Uri | undefined;
    private tableRange: vscode.Range | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private parser: TableParser;
    private generator: TableGenerator;
    private tablePreview: TablePreview;
    private validator: TableValidator;
    private currentAST: TableAST | undefined;
    private currentGrid: TableGrid | undefined;
    private isUpdating: boolean = false;
    private currentTable: TableData | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        this.parser = new TableParser();
        this.generator = new TableGenerator();
        this.tablePreview = new TablePreview(context, logger);
        this.validator = new TableValidator();
    }

    /**
     * Set table preview reference
     */
    setTablePreview(tablePreview: TablePreview): void {
        this.tablePreview = tablePreview;
    }

    /**
     * Register table editor commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.openTableEditor', (code?: string, range?: vscode.Range) => 
                this.openEditor(code, range)),
            vscode.commands.registerCommand('vtex.editTableAtCursor', () => this.openEditor()),
            vscode.commands.registerCommand('vtex.insertTableTemplate', () => this.insertTableTemplate())
        ];
    }

    /**
     * Open the table editor
     */
    async openEditor(tableCode?: string, range?: vscode.Range): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.sourceDocument = editor.document.uri;
            this.tableRange = range;
        }

        // If no code provided, extract from cursor position
        if (!tableCode && editor) {
            const tableInfo = this.parser.findTableAtPosition(editor.document, editor.selection.active);
            if (tableInfo) {
                tableCode = tableInfo.content;
                this.tableRange = tableInfo.range;
            }
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'tableEditor',
                '📊 Table Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'resources')
                    ]
                }
            );

            this.panel.webview.html = this.getWebviewContent();
            
            this.panel.webview.onDidReceiveMessage(
                message => this.handleMessage(message),
                undefined,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                }
            });
        }

        // Parse and send initial table
        if (tableCode && this.panel) {
            try {
                const ast = this.parser.parse(tableCode);
                if (ast) {
                    this.currentAST = ast;
                    this.currentGrid = new TableGrid(ast);
                    
                    this.panel.webview.postMessage({
                        type: 'setTable',
                        grid: this.currentGrid.cells,
                        columnSpec: this.currentGrid.columnSpec,
                        environment: ast.environment,
                        rowBorders: this.getRowBorders(),
                        borderState: this.getBorderState(),
                        hasTableEnvironment: ast.hasTableEnvironment || false,
                        caption: ast.caption || '',
                        captionPosition: ast.captionPosition || 'bottom',
                        label: ast.label || ''
                    });
                    
                    // Trigger initial preview
                    this.refreshPreview();
                } else {
                    vscode.window.showErrorMessage('Failed to parse table');
                }
            } catch (error) {
                this.logger.error(`Failed to parse table: ${error}`);
                vscode.window.showErrorMessage(`Failed to parse table: ${error}`);
            }
        } else if (this.panel) {
            // No table code - show empty 3x3 grid
            const emptyAST: TableAST = {
                environment: 'tabular',
                columnSpec: [{ type: 'l' }, { type: 'c' }, { type: 'r' }],
                rows: [
                    { cells: [{ content: '' }, { content: '' }, { content: '' }], rulesAbove: [], rulesBelow: [] },
                    { cells: [{ content: '' }, { content: '' }, { content: '' }], rulesAbove: [], rulesBelow: [] },
                    { cells: [{ content: '' }, { content: '' }, { content: '' }], rulesAbove: [], rulesBelow: [] }
                ],
                originalText: '',
                preambleLines: []
            };
            this.currentAST = emptyAST;
            this.currentGrid = new TableGrid(emptyAST);
            
            this.panel.webview.postMessage({
                type: 'setTable',
                grid: this.currentGrid.cells,
                columnSpec: this.currentGrid.columnSpec,
                environment: emptyAST.environment,
                rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
            });
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        this.logger.info(`Received message: ${message.type}`);
        
        switch (message.type) {
            case 'cellUpdate':
                await this.handleCellUpdate(message);
                break;
            
            case 'insertRow':
                await this.handleInsertRow(message);
                break;
            
            case 'deleteRow':
                await this.handleDeleteRow(message);
                break;
            
            case 'insertColumn':
                await this.handleInsertColumn(message);
                break;
            
            case 'deleteColumn':
                await this.handleDeleteColumn(message);
                break;
            
            case 'mergeCells':
                await this.handleMergeCells(message);
                break;
            
            case 'splitCell':
                await this.handleSplitCell(message);
                break;
            
            case 'changeAlignment':
                await this.handleChangeAlignment(message);
                break;
            
            case 'changeColSpan':
                await this.handleChangeColSpan(message);
                break;
            
            case 'changeRowSpan':
                await this.handleChangeRowSpan(message);
                break;
            
            case 'changeVerticalAlignment':
                await this.handleChangeVerticalAlignment(message);
                break;
            
            case 'toggleBorder':
                await this.handleToggleBorder(message);
                break;
            
            case 'getBorderState':
                // Send border state for specific row/col without re-rendering
                if (this.panel) {
                    this.panel.webview.postMessage({
                        type: 'updateBorderState',
                        borderState: this.getBorderState(message.row, message.col)
                    });
                }
                break;
            
            case 'setBorderPreset':
                await this.handleSetBorderPreset(message);
                break;
            
            case 'updateTableEnvironment':
                await this.handleUpdateTableEnvironment(message);
                break;
            
            case 'updateCaption':
                await this.handleUpdateCaption(message);
                break;
            
            case 'updateCaptionPosition':
                await this.handleUpdateCaptionPosition(message);
                break;
            
            case 'updateLabel':
                await this.handleUpdateLabel(message);
                break;
            
            case 'insertTable':
                await this.insertTableToDocument(false);
                break;
            
            case 'requestPreview':
                await this.refreshPreview();
                break;
        }
    }

    /**
     * Handle cell content update
     */
    private async handleCellUpdate(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, col, content } = message;
        if (row < this.currentGrid.cells.length && col < this.currentGrid.cells[row].length) {
            this.currentGrid.cells[row][col].content = content;
            
            // Debounced update
            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
            }
            this.updateTimeout = setTimeout(async () => {
                await this.updateSource(true);
            }, 800);
        }
    }

    /**
     * Handle insert row
     */
    private async handleInsertRow(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { index, position } = message;
        const insertIndex = position === 'above' ? index : index + 1;
        
        // Create new empty row with correct column alignments
        const newRow: GridCell[] = [];
        for (let i = 0; i < this.currentGrid.columnSpec.length; i++) {
            const columnAlignment = this.currentGrid.columnSpec[i]?.type || 'c';
            newRow.push({ 
                content: '', 
                isSpanned: false,
                alignment: columnAlignment
            });
        }
        
        this.currentGrid.cells.splice(insertIndex, 0, newRow);
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle delete row
     */
    private async handleDeleteRow(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { index } = message;
        if (this.currentGrid.cells.length <= 1) {
            vscode.window.showWarningMessage('Cannot delete the last row');
            return;
        }
        
        this.currentGrid.cells.splice(index, 1);
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle insert column
     */
    private async handleInsertColumn(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { index, position } = message;
        const insertIndex = position === 'left' ? index : index + 1;
        
        // Add column spec (default to center alignment)
        const newColumnAlignment = 'c';
        this.currentGrid.columnSpec.splice(insertIndex, 0, { type: newColumnAlignment });
        
        // Add cells to each row with the new column's alignment
        for (const row of this.currentGrid.cells) {
            row.splice(insertIndex, 0, { 
                content: '', 
                isSpanned: false,
                alignment: newColumnAlignment
            });
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle delete column
     */
    private async handleDeleteColumn(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { index } = message;
        if (this.currentGrid.columnSpec.length <= 1) {
            vscode.window.showWarningMessage('Cannot delete the last column');
            return;
        }
        
        // Remove column spec
        this.currentGrid.columnSpec.splice(index, 1);
        
        // Remove cells from each row
        for (const row of this.currentGrid.cells) {
            row.splice(index, 1);
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle merge cells
     */
    private async handleMergeCells(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { startRow, startCol, endRow, endCol } = message;
        
        // Collect content from all cells
        let mergedContent = '';
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                if (this.currentGrid.cells[r][c].content) {
                    mergedContent += (mergedContent ? ' ' : '') + this.currentGrid.cells[r][c].content;
                }
            }
        }
        
        // Set main cell with spans
        this.currentGrid.cells[startRow][startCol] = {
            content: mergedContent,
            colspan: endCol - startCol + 1,
            rowspan: endRow - startRow + 1,
            isSpanned: false
        };
        
        // Mark other cells as spanned
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                if (r === startRow && c === startCol) {continue;}
                this.currentGrid.cells[r][c] = {
                    content: '',
                    isSpanned: true,
                    spanSource: r === startRow ? 'left' : 'above'
                };
            }
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle split cell
     */
    private async handleSplitCell(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, col } = message;
        const cell = this.currentGrid.cells[row][col];
        
        if (!cell.colspan && !cell.rowspan) {
            vscode.window.showInformationMessage('Cell is not merged');
            return;
        }
        
        const colspan = cell.colspan || 1;
        const rowspan = cell.rowspan || 1;
        
        // Reset main cell
        cell.colspan = undefined;
        cell.rowspan = undefined;
        
        // Unmark spanned cells
        for (let r = row; r < row + rowspan; r++) {
            for (let c = col; c < col + colspan; c++) {
                if (r === row && c === col) {continue;}
                if (r < this.currentGrid.cells.length && c < this.currentGrid.cells[r].length) {
                    this.currentGrid.cells[r][c] = {
                        content: '',
                        isSpanned: false
                    };
                }
            }
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle change colspan
     */
    private async handleChangeColSpan(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, col, span } = message;
        const cell = this.currentGrid.cells[row]?.[col];
        
        if (!cell || cell.isSpanned) {return;}
        
        const oldSpan = cell.colspan || 1;
        const newSpan = Math.max(1, Math.min(span, this.currentGrid.columnSpec.length - col));
        
        if (newSpan === oldSpan) {return;}
        
        // Update cell colspan
        cell.colspan = newSpan > 1 ? newSpan : undefined;
        
        // Update spanned cells
        const rowspan = cell.rowspan || 1;
        for (let r = row; r < row + rowspan && r < this.currentGrid.cells.length; r++) {
            // Clear old spanned cells (horizontal)
            for (let c = col + 1; c < col + oldSpan && c < this.currentGrid.cells[r].length; c++) {
                if (this.currentGrid.cells[r][c].isSpanned) {
                    this.currentGrid.cells[r][c] = { content: '', isSpanned: false };
                }
            }
            
            // Mark new spanned cells (horizontal)
            for (let c = col + 1; c < col + newSpan && c < this.currentGrid.cells[r].length; c++) {
                this.currentGrid.cells[r][c] = { content: '', isSpanned: true, spanSource: 'left' };
            }
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
            rowBorders: this.getRowBorders(),
            borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle change rowspan
     */
    private async handleChangeRowSpan(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, col, span } = message;
        const cell = this.currentGrid.cells[row]?.[col];
        
        if (!cell || cell.isSpanned) {return;}
        
        const oldSpan = cell.rowspan || 1;
        const newSpan = Math.max(1, Math.min(span, this.currentGrid.cells.length - row));
        
        if (newSpan === oldSpan) {return;}
        
        // Update cell rowspan
        cell.rowspan = newSpan > 1 ? newSpan : undefined;
        
        // Update spanned cells
        const colspan = cell.colspan || 1;
        
        // Clear old spanned cells (vertical)
        for (let r = row + 1; r < row + oldSpan && r < this.currentGrid.cells.length; r++) {
            for (let c = col; c < col + colspan && c < this.currentGrid.cells[r].length; c++) {
                if (this.currentGrid.cells[r][c].isSpanned) {
                    this.currentGrid.cells[r][c] = { content: '', isSpanned: false };
                }
            }
        }
        
        // Mark new spanned cells (vertical)
        for (let r = row + 1; r < row + newSpan && r < this.currentGrid.cells.length; r++) {
            for (let c = col; c < col + colspan && c < this.currentGrid.cells[r].length; c++) {
                this.currentGrid.cells[r][c] = { content: '', isSpanned: true, spanSource: 'above' };
            }
        }
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
            rowBorders: this.getRowBorders(),
            borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle change vertical alignment
     */
    private async handleChangeVerticalAlignment(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, column, alignment } = message;
        const cell = this.currentGrid.cells[row]?.[column];
        
        if (!cell || cell.isSpanned) {return;}
        
        // Store vertical alignment in cell
        cell.verticalAlignment = alignment;
        
        await this.updateSource(true);
    }

    /**
     * Handle change alignment
     */
    private async handleChangeAlignment(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { row, column, alignment } = message;
        const cell = this.currentGrid.cells[row]?.[column];
        
        if (!cell || cell.isSpanned) {return;}
        
        // Update cell alignment (not column spec)
        cell.alignment = alignment;
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Get current border state
     */
    /**
     * Get row border information for visual feedback
     */
    private getRowBorders(): any[] {
        if (!this.currentAST) {return [];}
        
        return this.currentAST.rows.map((row, rowIndex) => {
            const borders: any = {
                hasTopBorder: false,
                hasBottomBorder: false,
                topClines: [] as Array<[number, number]>,
                bottomClines: [] as Array<[number, number]>
            };
            
            // Check rules above
            for (const rule of row.rulesAbove) {
                if (rule.type === 'hline') {
                    borders.hasTopBorder = true;
                } else if (rule.type === 'cline' && rule.columns) {
                    borders.topClines.push(rule.columns);
                }
            }
            
            // Check rules below
            for (const rule of row.rulesBelow) {
                if (rule.type === 'hline') {
                    borders.hasBottomBorder = true;
                } else if (rule.type === 'cline' && rule.columns) {
                    borders.bottomClines.push(rule.columns);
                }
            }
            
            return borders;
        });
    }

    private getBorderState(row?: number, col?: number): any {
        if (!this.currentGrid || !this.currentAST) {
            return {
                thisColumnLeft: false,
                thisColumnRight: false,
                thisRowTop: false,
                thisRowBottom: false
            };
        }

        // If no specific row/col provided, return empty state
        if (row === undefined || col === undefined) {
            return {
                thisColumnLeft: false,
                thisColumnRight: false,
                thisRowTop: false,
                thisRowBottom: false
            };
        }

        // Get the cell at this position to check its colspan
        const cell = this.currentGrid.cells[row]?.[col];
        const cellColspan = cell?.colspan || 1;
        
        // Calculate the last column index this cell spans (for right border detection)
        const lastColIndex = col + cellColspan - 1;
        
        // Check borders for specific column accounting for colspan
        // Left border exists if FIRST column has leftBorder OR previous column has rightBorder
        const thisColumnLeft = (this.currentGrid.columnSpec[col]?.leftBorder || false) ||
                               (col > 0 && (this.currentGrid.columnSpec[col - 1]?.rightBorder || false));
        
        // Right border exists if LAST column has rightBorder OR next column has leftBorder
        const thisColumnRight = (this.currentGrid.columnSpec[lastColIndex]?.rightBorder || false) ||
                                (lastColIndex < this.currentGrid.columnSpec.length - 1 && 
                                 (this.currentGrid.columnSpec[lastColIndex + 1]?.leftBorder || false));
        
        // Calculate the actual LaTeX column numbers for this cell
        // We need to count non-spanned cells before this position to get the LaTeX column
        let latexCol = 1;  // LaTeX columns are 1-indexed
        for (let c = 0; c < col && this.currentGrid.cells[row]; c++) {
            if (!this.currentGrid.cells[row][c]?.isSpanned) {
                latexCol++;
            }
        }
        
        const cellStartCol = latexCol;
        const cellEndCol = latexCol + cellColspan - 1;  // End column in LaTeX (inclusive)
        
        // Check borders for specific row considering the cell's column span
        // Top border exists if:
        // 1. This row has hline above, OR
        // 2. This row has cline above that covers this cell's columns, OR
        // 3. Previous row has hline below, OR
        // 4. Previous row has cline below that covers this cell's columns
        let thisRowTop = false;
        
        if (row >= 0 && row < this.currentAST.rows.length) {
            const currentRow = this.currentAST.rows[row];
            // Check for hline
            if (currentRow.rulesAbove.some(r => r.type === 'hline')) {
                thisRowTop = true;
            }
            // Also check for cline covering this cell (independent of hline)
            if (!thisRowTop) {
                for (const rule of currentRow.rulesAbove) {
                    if (rule.type === 'cline' && rule.columns) {
                        const [clineStart, clineEnd] = rule.columns;
                        // Check if cline covers the entire cell span
                        if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                            thisRowTop = true;
                            break;
                        }
                    }
                }
            }
        }
        
        // Check previous row's bottom border
        if (!thisRowTop && row > 0 && row - 1 < this.currentAST.rows.length) {
            const prevRow = this.currentAST.rows[row - 1];
            // Check for hline
            if (prevRow.rulesBelow.some(r => r.type === 'hline')) {
                thisRowTop = true;
            }
            // Also check for cline covering this cell
            if (!thisRowTop) {
                for (const rule of prevRow.rulesBelow) {
                    if (rule.type === 'cline' && rule.columns) {
                        const [clineStart, clineEnd] = rule.columns;
                        // Check if cline covers the entire cell span
                        if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                            thisRowTop = true;
                            break;
                        }
                    }
                }
            }
        }
        
        // Bottom border exists if:
        // 1. This row has hline below, OR
        // 2. This row has cline below that covers this cell's columns, OR
        // 3. Next row has hline above, OR
        // 4. Next row has cline above that covers this cell's columns
        let thisRowBottom = false;
        
        if (row >= 0 && row < this.currentAST.rows.length) {
            const currentRow = this.currentAST.rows[row];
            // Check for hline
            if (currentRow.rulesBelow.some(r => r.type === 'hline')) {
                thisRowBottom = true;
            }
            // Also check for cline covering this cell (independent of hline)
            if (!thisRowBottom) {
                for (const rule of currentRow.rulesBelow) {
                    if (rule.type === 'cline' && rule.columns) {
                        const [clineStart, clineEnd] = rule.columns;
                        // Check if cline covers the entire cell span
                        if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                            thisRowBottom = true;
                            break;
                        }
                    }
                }
            }
        }
        
        // Check next row's top border
        if (!thisRowBottom && row < this.currentAST.rows.length - 1) {
            const nextRow = this.currentAST.rows[row + 1];
            // Check for hline
            if (nextRow.rulesAbove.some(r => r.type === 'hline')) {
                thisRowBottom = true;
            }
            // Also check for cline covering this cell
            if (!thisRowBottom) {
                for (const rule of nextRow.rulesAbove) {
                    if (rule.type === 'cline' && rule.columns) {
                        const [clineStart, clineEnd] = rule.columns;
                        // Check if cline covers the entire cell span
                        if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                            thisRowBottom = true;
                            break;
                        }
                    }
                }
            }
        }
        
        return {
            thisColumnLeft,
            thisColumnRight,
            thisRowTop,
            thisRowBottom,
            row,
            col
        };
    }

    /**
     * Handle toggle border
     */
    private async handleToggleBorder(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { border, enabled, row, col } = message;
        
        // Update column spec for vertical borders
        if (border === 'thisColumnLeft') {
            // Add/remove left border of the column
            // For vertical borders, grid columns map directly to columnSpec indices
            // Also update the rightBorder of the previous column (same physical separator)
            if (col !== undefined && col >= 0 && col < this.currentGrid.columnSpec.length) {
                this.currentGrid.columnSpec[col].leftBorder = enabled;
                // Also update previous column's rightBorder (same separator)
                if (col > 0) {
                    this.currentGrid.columnSpec[col - 1].rightBorder = enabled;
                }
            }
        } else if (border === 'thisColumnRight') {
            // Add/remove right border of the LAST column this cell spans
            // Also update the leftBorder of the next column (same physical separator)
            if (col !== undefined && col >= 0 && col < this.currentGrid.columnSpec.length) {
                const cell = this.currentGrid.cells[row]?.[col];
                const cellColspan = cell?.colspan || 1;
                
                // Calculate the last column index this cell spans
                // For a cell at col=0 with colspan=2, it spans columns 0 and 1, so lastCol=1
                const lastCol = col + cellColspan - 1;
                
                if (lastCol >= 0 && lastCol < this.currentGrid.columnSpec.length) {
                    this.currentGrid.columnSpec[lastCol].rightBorder = enabled;
                    // Also update next column's leftBorder (same separator)
                    if (lastCol < this.currentGrid.columnSpec.length - 1) {
                        this.currentGrid.columnSpec[lastCol + 1].leftBorder = enabled;
                    }
                }
            }
        } else if (border === 'thisRowTop') {
            // Add/remove top border considering cell's column span
            // Need to modify both current row's rulesAbove AND previous row's rulesBelow
            if (row !== undefined && row >= 0 && row < this.currentAST.rows.length) {
                const cell = this.currentGrid.cells[row]?.[col];
                const cellColspan = cell?.colspan || 1;
                
                // Calculate LaTeX column range for this cell
                let latexCol = 1;
                for (let c = 0; c < col && this.currentGrid.cells[row]; c++) {
                    if (!this.currentGrid.cells[row][c]?.isSpanned) {
                        latexCol++;
                    }
                }
                const cellStartCol = latexCol;
                const cellEndCol = latexCol + cellColspan - 1;
                
                if (enabled) {
                    // Add border to current row's rulesAbove
                    const hasHline = this.currentAST.rows[row].rulesAbove.some(r => r.type === 'hline');
                    if (!hasHline) {
                        const existingCline = this.currentAST.rows[row].rulesAbove.find(
                            r => r.type === 'cline' && r.columns && 
                            r.columns[0] === cellStartCol && r.columns[1] === cellEndCol
                        );
                        if (!existingCline) {
                            this.currentAST.rows[row].rulesAbove.push({
                                type: 'cline',
                                columns: [cellStartCol, cellEndCol]
                            });
                        }
                    }
                } else {
                    // Remove border from BOTH current row's rulesAbove AND previous row's rulesBelow
                    this.currentAST.rows[row].rulesAbove = this.currentAST.rows[row].rulesAbove.filter(r => {
                        if (r.type === 'hline') {return false;}
                        if (r.type === 'cline' && r.columns) {
                            return !(r.columns[0] === cellStartCol && r.columns[1] === cellEndCol);
                        }
                        return true;
                    });
                    
                    // Also remove from previous row's rulesBelow
                    if (row > 0) {
                        this.currentAST.rows[row - 1].rulesBelow = this.currentAST.rows[row - 1].rulesBelow.filter(r => {
                            if (r.type === 'hline') {return false;}
                            if (r.type === 'cline' && r.columns) {
                                return !(r.columns[0] === cellStartCol && r.columns[1] === cellEndCol);
                            }
                            return true;
                        });
                    }
                }
            }
        } else if (border === 'thisRowBottom') {
            // Add/remove bottom border considering cell's column span
            // Need to modify both current row's rulesBelow AND next row's rulesAbove
            if (row !== undefined && row >= 0 && row < this.currentAST.rows.length) {
                const cell = this.currentGrid.cells[row]?.[col];
                const cellColspan = cell?.colspan || 1;
                
                // Calculate LaTeX column range for this cell
                let latexCol = 1;
                for (let c = 0; c < col && this.currentGrid.cells[row]; c++) {
                    if (!this.currentGrid.cells[row][c]?.isSpanned) {
                        latexCol++;
                    }
                }
                const cellStartCol = latexCol;
                const cellEndCol = latexCol + cellColspan - 1;
                
                if (enabled) {
                    // Add border to current row's rulesBelow
                    const hasHline = this.currentAST.rows[row].rulesBelow.some(r => r.type === 'hline');
                    if (!hasHline) {
                        const existingCline = this.currentAST.rows[row].rulesBelow.find(
                            r => r.type === 'cline' && r.columns && 
                            r.columns[0] === cellStartCol && r.columns[1] === cellEndCol
                        );
                        if (!existingCline) {
                            this.currentAST.rows[row].rulesBelow.push({
                                type: 'cline',
                                columns: [cellStartCol, cellEndCol]
                            });
                        }
                    }
                } else {
                    // Remove border from BOTH current row's rulesBelow AND next row's rulesAbove
                    this.currentAST.rows[row].rulesBelow = this.currentAST.rows[row].rulesBelow.filter(r => {
                        if (r.type === 'hline') {return false;}
                        if (r.type === 'cline' && r.columns) {
                            return !(r.columns[0] === cellStartCol && r.columns[1] === cellEndCol);
                        }
                        return true;
                    });
                    
                    // Also remove from next row's rulesAbove
                    if (row < this.currentAST.rows.length - 1) {
                        this.currentAST.rows[row + 1].rulesAbove = this.currentAST.rows[row + 1].rulesAbove.filter(r => {
                            if (r.type === 'hline') {return false;}
                            if (r.type === 'cline' && r.columns) {
                                return !(r.columns[0] === cellStartCol && r.columns[1] === cellEndCol);
                            }
                            return true;
                        });
                    }
                }
            }
        }
        
        // Send updated grid with updated border state for current selection
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
            borderState: this.getBorderState(row, col)
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle set border preset
     */
    private async handleSetBorderPreset(message: any): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const { preset } = message;
        
        // Clear all borders first
        for (const col of this.currentGrid.columnSpec) {
            col.leftBorder = false;
            col.rightBorder = false;
        }
        for (const row of this.currentAST.rows) {
            row.rulesAbove = [];
            row.rulesBelow = [];
        }
        
        // Apply preset
        if (preset === 'all') {
            // All borders: outer + all separators
            this.currentGrid.columnSpec[0].leftBorder = true;
            for (const col of this.currentGrid.columnSpec) {
                col.rightBorder = true;
            }
            if (this.currentAST.rows.length > 0) {
                this.currentAST.rows[0].rulesAbove = [{ type: 'hline' }];
                for (const row of this.currentAST.rows) {
                    row.rulesBelow = [{ type: 'hline' }];
                }
            }
        } else if (preset === 'outer') {
            // Outer border only
            this.currentGrid.columnSpec[0].leftBorder = true;
            const lastCol = this.currentGrid.columnSpec.length - 1;
            this.currentGrid.columnSpec[lastCol].rightBorder = true;
            if (this.currentAST.rows.length > 0) {
                this.currentAST.rows[0].rulesAbove = [{ type: 'hline' }];
                const lastRow = this.currentAST.rows.length - 1;
                this.currentAST.rows[lastRow].rulesBelow = [{ type: 'hline' }];
            }
        } else if (preset === 'horizontal') {
            // Horizontal lines only
            if (this.currentAST.rows.length > 0) {
                this.currentAST.rows[0].rulesAbove = [{ type: 'hline' }];
                for (const row of this.currentAST.rows) {
                    row.rulesBelow = [{ type: 'hline' }];
                }
            }
        }
        // 'none' preset - already cleared all borders
        
        // Send updated grid
        this.panel?.webview.postMessage({
            type: 'setTable',
            grid: this.currentGrid.cells,
            columnSpec: this.currentGrid.columnSpec,
            environment: this.currentAST.environment,
                        rowBorders: this.getRowBorders(),
                borderState: this.getBorderState()
        });
        
        await this.updateSource(false);
    }

    /**
     * Handle update table environment wrapper
     */
    private async handleUpdateTableEnvironment(message: any): Promise<void> {
        if (!this.currentAST) {return;}
        
        this.currentAST.hasTableEnvironment = message.hasTableEnvironment;
        await this.updateSource(false);
    }

    /**
     * Handle update caption
     */
    private async handleUpdateCaption(message: any): Promise<void> {
        if (!this.currentAST) {return;}
        
        this.currentAST.caption = message.caption || undefined;
        await this.updateSource(false);
    }

    /**
     * Handle update caption position
     */
    private async handleUpdateCaptionPosition(message: any): Promise<void> {
        if (!this.currentAST) {return;}
        
        this.currentAST.captionPosition = message.position;
        await this.updateSource(false);
    }

    /**
     * Handle update label
     */
    private async handleUpdateLabel(message: any): Promise<void> {
        if (!this.currentAST) {return;}
        
        this.currentAST.label = message.label || undefined;
        await this.updateSource(false);
    }

    /**
     * Update source document
     */
    private async updateSource(isAutoUpdate: boolean): Promise<void> {
        if (!this.currentGrid || !this.currentAST || this.isUpdating) {return;}
        
        this.isUpdating = true;
        
        try {
            // Convert grid to AST
            const updatedAST = this.currentGrid.toAST(this.currentAST);
            
            // Validate
            const errors = this.validator.validate(updatedAST);
            if (errors.some(e => e.severity === 'error')) {
                this.logger.warn('Validation errors found');
                // Still continue but log errors
            }
            
            // Generate LaTeX
            const latex = this.generator.generate(updatedAST);
            
            // Update document if we have a range
            if (this.sourceDocument && this.tableRange) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(this.sourceDocument, this.tableRange, latex);
                await vscode.workspace.applyEdit(edit);
                
                // Update range for next edit
                const doc = await vscode.workspace.openTextDocument(this.sourceDocument);
                const startLine = this.tableRange.start.line;
                const endLine = startLine + latex.split('\n').length - 1;
                this.tableRange = new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(endLine, doc.lineAt(Math.min(endLine, doc.lineCount - 1)).text.length)
                );
            }
            
            // Refresh preview if not auto-update
            if (!isAutoUpdate) {
                await this.refreshPreview();
            }
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Refresh table preview
     */
    private async refreshPreview(): Promise<void> {
        if (!this.currentGrid || !this.currentAST || !this.panel) {return;}
        
        try {
            const ast = this.currentGrid.toAST(this.currentAST);
            const latex = this.generator.generate(ast);
            
            if (this.sourceDocument) {
                const pngBase64 = await this.tablePreview.compileTableToPng(latex, this.sourceDocument);
                
                if (pngBase64) {
                    this.panel.webview.postMessage({
                        type: 'updatePreview',
                        preview: pngBase64
                    });
                }
            }
        } catch (error) {
            this.logger.error(`Failed to refresh preview: ${error}`);
        }
    }

    /**
     * Insert table to document
     */
    private async insertTableToDocument(isUpdate: boolean): Promise<void> {
        if (!this.currentGrid || !this.currentAST) {return;}
        
        const ast = this.currentGrid.toAST(this.currentAST);
        const latex = this.generator.generate(ast);
        
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file');
            return;
        }
        
        await editor.edit(editBuilder => {
            if (isUpdate && this.tableRange) {
                editBuilder.replace(this.tableRange, latex);
            } else {
                editBuilder.insert(editor.selection.active, latex);
            }
        });
    }

    /**
     * Get webview HTML content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Table Editor</title>
    <style>
        ${this.getWebviewStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Table Editor</h1>
            <p class="subtitle">Create and edit tables with LaTeX-style features</p>
        </div>
        
        <div class="caption-section">
            <div class="form-group-inline">
                <input type="text" id="tableCaption" placeholder="Table caption (optional)">
            </div>
            <div class="caption-options" id="captionOptions" style="display: none;">
                <div class="form-group-inline">
                    <label for="tableLabel">Label:</label>
                    <input type="text" id="tableLabel" placeholder="tab:mytable">
                </div>
                <div class="form-group-inline">
                    <label for="captionPosition">Position:</label>
                    <select id="captionPosition">
                        <option value="top">Top</option>
                        <option value="bottom" selected>Bottom</option>
                    </select>
                </div>
                <label class="checkbox-label">
                    <input type="checkbox" id="useTableEnvironment">
                    <span>Wrap in table environment</span>
                </label>
            </div>
        </div>
        
        <div class="main-content">
            <div class="table-area">
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button id="addRow" class="icon-button" title="Add Row">
                            <span class="icon">⬇</span> Add Row
                        </button>
                        <button id="deleteRow" class="icon-button danger" title="Delete Selected Row">
                            <span class="icon">🗑</span>
                        </button>
                    </div>
                    <div class="toolbar-group">
                        <button id="addColumn" class="icon-button" title="Add Column">
                            <span class="icon">➡</span> Add Column
                        </button>
                        <button id="deleteColumn" class="icon-button danger" title="Delete Selected Column">
                            <span class="icon">🗑</span>
                        </button>
                    </div>
                </div>
                
                <div class="table-wrapper">
                    <table id="tableGrid"></table>
                </div>
            </div>
            
            <div class="sidebar">
                <div class="sidebar-header">
                    <span class="icon">⊞</span>
                    <span id="cellLabel">Cell (1, 1)</span>
                </div>
                
                <div class="properties-section">
                    <h3>Horizontal Alignment</h3>
                    <div class="button-group">
                        <button class="alignment-btn" data-align="left" title="Left">
                            <span class="icon">≡</span>
                        </button>
                        <button class="alignment-btn active" data-align="center" title="Center">
                            <span class="icon">≡</span>
                        </button>
                        <button class="alignment-btn" data-align="right" title="Right">
                            <span class="icon">≡</span>
                        </button>
                    </div>
                </div>
                
                <div class="properties-section">
                    <h3>Vertical Alignment</h3>
                    <div class="button-group">
                        <button class="alignment-btn" data-valign="top" title="Top">
                            <span class="icon">⫣</span>
                        </button>
                        <button class="alignment-btn active" data-valign="middle" title="Middle">
                            <span class="icon">☰</span>
                        </button>
                        <button class="alignment-btn" data-valign="bottom" title="Bottom">
                            <span class="icon">⫤</span>
                        </button>
                    </div>
                </div>
                
                <div class="properties-section">
                    <h3>Cell Spanning</h3>
                    <div class="span-control">
                        <label>Column Span</label>
                        <div class="span-input-group">
                            <button class="span-btn" id="colSpanMinus">−</button>
                            <input type="number" id="colSpan" value="1" min="1" readonly>
                            <button class="span-btn" id="colSpanPlus">+</button>
                        </div>
                    </div>
                    <div class="span-control">
                        <label>Row Span</label>
                        <div class="span-input-group">
                            <button class="span-btn" id="rowSpanMinus">−</button>
                            <input type="number" id="rowSpan" value="1" min="1" readonly>
                            <button class="span-btn" id="rowSpanPlus">+</button>
                        </div>
                    </div>
                </div>
                
                <div class="properties-section">
                    <h3>Borders</h3>
                    <p class="help-text">Control borders for current selection</p>
                    
                    <div class="border-controls">
                        <div class="border-preset-group">
                            <button class="border-preset-btn" id="borderNone" title="No Borders">
                                <svg width="32" height="32" viewBox="0 0 32 32">
                                    <rect x="8" y="8" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/>
                                </svg>
                            </button>
                            <button class="border-preset-btn" id="borderAll" title="All Borders">
                                <svg width="32" height="32" viewBox="0 0 32 32">
                                    <rect x="8" y="8" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"/>
                                    <line x1="16" y1="8" x2="16" y2="24" stroke="currentColor" stroke-width="2"/>
                                    <line x1="8" y1="16" x2="24" y2="16" stroke="currentColor" stroke-width="2"/>
                                </svg>
                            </button>
                            <button class="border-preset-btn" id="borderOuter" title="Outer Border">
                                <svg width="32" height="32" viewBox="0 0 32 32">
                                    <rect x="8" y="8" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"/>
                                </svg>
                            </button>
                            <button class="border-preset-btn" id="borderHorizontal" title="Horizontal Lines">
                                <svg width="32" height="32" viewBox="0 0 32 32">
                                    <line x1="8" y1="12" x2="24" y2="12" stroke="currentColor" stroke-width="2"/>
                                    <line x1="8" y1="16" x2="24" y2="16" stroke="currentColor" stroke-width="2"/>
                                    <line x1="8" y1="20" x2="24" y2="20" stroke="currentColor" stroke-width="2"/>
                                </svg>
                            </button>
                        </div>
                        
                        <div class="border-detail">
                            <h4 id="columnBorderTitle">Column Borders</h4>
                            <label class="border-toggle-label">
                                <input type="checkbox" id="borderThisColumnLeft" class="border-toggle">
                                <span id="borderThisColumnLeftLabel">│ Left of this column</span>
                            </label>
                            <label class="border-toggle-label">
                                <input type="checkbox" id="borderThisColumnRight" class="border-toggle">
                                <span id="borderThisColumnRightLabel">│ Right of this column</span>
                            </label>
                            
                            <h4 id="rowBorderTitle">Row Borders</h4>
                            <label class="border-toggle-label">
                                <input type="checkbox" id="borderThisRowTop" class="border-toggle">
                                <span id="borderThisRowTopLabel">─ Above this row</span>
                            </label>
                            <label class="border-toggle-label">
                                <input type="checkbox" id="borderThisRowBottom" class="border-toggle">
                                <span id="borderThisRowBottomLabel">─ Below this row (\\hline)</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="properties-section cell-info">
                    <h3>Cell Information</h3>
                    <p>Position: <span id="cellPosition">Row 1, Column 1</span></p>
                    <p>Size: <span id="cellSize">1 × 1</span></p>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        ${this.getWebviewScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Get webview styles
     */
    private getWebviewStyles(): string {
        return `
            * {
                box-sizing: border-box;
            }
            
            body {
                padding: 0;
                margin: 0;
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                overflow: hidden;
            }
            
            .container {
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            
            .header {
                padding: 20px 24px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .header h1 {
                margin: 0 0 4px 0;
                font-size: 20px;
                font-weight: 600;
            }
            
            .subtitle {
                margin: 0;
                color: var(--vscode-descriptionForeground);
                font-size: 13px;
            }
            
            .caption-section {
                padding: 12px 24px;
                background-color: var(--vscode-editor-background);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .form-group-inline {
                margin-bottom: 8px;
            }
            
            .form-group-inline input[type="text"] {
                width: 100%;
                padding: 6px 12px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 2px;
                font-size: 14px;
                font-family: var(--vscode-font-family);
            }
            
            .form-group-inline input[type="text"]:focus {
                outline: 1px solid var(--vscode-focusBorder);
                outline-offset: -1px;
            }
            
            .caption-options {
                margin-top: 8px;
                padding: 8px;
                background-color: var(--vscode-sideBar-background);
                border-radius: 4px;
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
            }
            
            .caption-options .form-group-inline {
                margin-bottom: 0;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .caption-options label {
                font-size: 12px;
                white-space: nowrap;
            }
            
            .caption-options input[type="text"] {
                width: 150px;
                padding: 4px 8px;
                font-size: 12px;
            }
            
            .caption-options select {
                padding: 4px 8px;
                font-size: 12px;
                background-color: var(--vscode-dropdown-background);
                color: var(--vscode-dropdown-foreground);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 2px;
            }
            
            .caption-options .checkbox-label {
                margin-left: auto;
            }
            
            .main-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }
            
            .table-area {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            
            .toolbar {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                border-bottom: 1px solid var(--vscode-panel-border);
                display: flex;
                gap: 12px;
                align-items: center;
            }
            
            .toolbar-group {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .icon-button {
                padding: 6px 12px;
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                cursor: pointer;
                border-radius: 4px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: background-color 0.1s;
            }
            
            .icon-button:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            
            .icon-button.danger {
                padding: 6px 10px;
            }
            
            .icon-button .icon {
                font-size: 14px;
            }
            
            .table-wrapper {
                flex: 1;
                overflow: auto;
                padding: 16px;
            }
            
            #tableGrid {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed;
            }
            
            #tableGrid th,
            #tableGrid td {
                border: 1px solid var(--vscode-panel-border);
                padding: 0;
                height: 36px;
                min-width: 120px;
                position: relative;
                background-color: var(--vscode-input-background);
            }
            
            #tableGrid th {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                font-weight: 600;
                text-align: center;
                padding: 8px;
                color: var(--vscode-foreground);
            }
            
            #tableGrid td.selected {
                outline: 2px solid var(--vscode-focusBorder);
                outline-offset: -2px;
                background-color: var(--vscode-list-activeSelectionBackground);
            }
            
            #tableGrid td.header-cell {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                font-weight: 600;
            }
            
            #tableGrid td .cell-content {
                width: 100%;
                height: 100%;
                padding: 8px;
                display: flex;
                align-items: center;
                cursor: text;
                color: var(--vscode-foreground);
                text-align: inherit;
                justify-content: inherit;
            }
            
            #tableGrid td[style*="text-align: left"] .cell-content {
                justify-content: flex-start;
            }
            
            #tableGrid td[style*="text-align: center"] .cell-content {
                justify-content: center;
            }
            
            #tableGrid td[style*="text-align: right"] .cell-content {
                justify-content: flex-end;
            }
            
            #tableGrid td .cell-content.placeholder {
                color: var(--vscode-input-placeholderForeground);
                font-style: italic;
            }
            
            #tableGrid td input {
                width: 100%;
                height: 100%;
                padding: 8px;
                background: transparent;
                border: none;
                color: var(--vscode-foreground);
                font-family: var(--vscode-font-family);
                font-size: 13px;
                outline: none;
                text-align: inherit;
            }
            
            .sidebar {
                width: 300px;
                border-left: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-sideBar-background);
                overflow-y: auto;
                display: flex;
                flex-direction: column;
            }
            
            .sidebar-header {
                padding: 16px;
                font-weight: 600;
                background-color: var(--vscode-sideBarSectionHeader-background);
                border-bottom: 1px solid var(--vscode-panel-border);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .sidebar-header .icon {
                font-size: 16px;
            }
            
            .properties-section {
                padding: 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .properties-section h3 {
                margin: 0 0 12px 0;
                font-size: 13px;
                font-weight: 600;
                color: var(--vscode-foreground);
            }
            
            .button-group {
                display: flex;
                gap: 4px;
            }
            
            .alignment-btn {
                flex: 1;
                padding: 8px;
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                cursor: pointer;
                border-radius: 4px;
                font-size: 16px;
                transition: background-color 0.1s;
            }
            
            .alignment-btn:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            
            .alignment-btn.active {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-color: var(--vscode-button-background);
            }
            
            .span-control {
                margin-bottom: 12px;
            }
            
            .span-control:last-child {
                margin-bottom: 0;
            }
            
            .span-control label {
                display: block;
                margin-bottom: 8px;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            
            .span-input-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .span-btn {
                width: 32px;
                height: 32px;
                padding: 0;
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                cursor: pointer;
                border-radius: 4px;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.1s;
            }
            
            .span-btn:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            
            .span-btn:active {
                background-color: var(--vscode-button-background);
            }
            
            .span-input-group input {
                flex: 1;
                height: 32px;
                text-align: center;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                font-size: 13px;
            }
            
            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                padding: 8px 0;
            }
            
            .checkbox-label input[type="checkbox"] {
                width: 16px;
                height: 16px;
                cursor: pointer;
            }
            
            .help-text {
                margin: 4px 0 0 0;
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
            }
            
            .border-controls {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .border-preset-group {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 4px;
            }
            
            .border-preset-btn {
                padding: 4px;
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                cursor: pointer;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.1s;
                height: 36px;
            }
            
            .border-preset-btn:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            
            .border-preset-btn svg {
                display: block;
            }
            
            .border-detail {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .border-detail h4 {
                margin: 12px 0 6px 0;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                color: var(--vscode-descriptionForeground);
            }
            
            .border-detail h4:first-child {
                margin-top: 0;
            }
            
            .border-toggle-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                padding: 4px 0;
                font-size: 12px;
            }
            
            .border-toggle-label input[type="checkbox"] {
                width: 16px;
                height: 16px;
                cursor: pointer;
            }
            
            .border-toggle-label span {
                font-family: monospace;
            }
            
            .cell-info {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
            }
            
            .cell-info p {
                margin: 0 0 8px 0;
                font-size: 12px;
            }
            
            .cell-info p:last-child {
                margin-bottom: 0;
            }
            
            .cell-info span {
                font-weight: 600;
            }
            
            .form-group {
                margin: 12px 0;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 4px;
                font-size: 12px;
                font-weight: 500;
            }
            
            .form-group input[type="text"],
            .form-group select {
                width: 100%;
                padding: 6px 8px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 2px;
                font-size: 12px;
                font-family: var(--vscode-font-family);
            }
            
            .form-group input[type="text"]:focus,
            .form-group select:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }
        `;
    }

    /**
     * Get webview script
     */
    private getWebviewScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            let currentGrid = [];
            let columnSpec = [];
            let rowBorders = [];
            let currentRow = -1;
            let currentCol = -1;
            let currentCell = null;
            let isEditing = false;
            
            // Message handler
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'setTable':
                        currentGrid = message.grid;
                        columnSpec = message.columnSpec;
                        rowBorders = message.rowBorders || [];
                        if (message.borderState) {
                            updateBorderControls(message.borderState);
                        }
                        // Update caption fields
                        if (message.hasTableEnvironment !== undefined) {
                            document.getElementById('useTableEnvironment').checked = message.hasTableEnvironment;
                        }
                        if (message.caption !== undefined) {
                            const captionInput = document.getElementById('tableCaption');
                            captionInput.value = message.caption || '';\n                            // Show caption options if caption exists
                            const captionOptions = document.getElementById('captionOptions');\n                            captionOptions.style.display = message.caption ? 'flex' : 'none';
                        }
                        if (message.captionPosition !== undefined) {
                            document.getElementById('captionPosition').value = message.captionPosition || 'bottom';
                        }
                        if (message.label !== undefined) {
                            document.getElementById('tableLabel').value = message.label || '';
                        }
                        renderGrid();
                        break;
                    case 'updateBorderState':
                        // Only update border controls without re-rendering grid
                        if (message.borderState) {
                            updateBorderControls(message.borderState);
                        }
                        break;
                    case 'updatePreview':
                        updatePreview(message.preview);
                        break;
                }
            });
            
            function renderGrid() {
                const table = document.getElementById('tableGrid');
                table.innerHTML = '';
                
                // Render table cells (no header row)
                currentGrid.forEach((row, rowIndex) => {
                    const tr = document.createElement('tr');
                    row.forEach((cell, colIndex) => {
                        if (cell.isSpanned) {
                            return; // Skip rendering spanned cells
                        }
                        
                        const td = document.createElement('td');
                        if (cell.colspan && cell.colspan > 1) td.colSpan = cell.colspan;
                        if (cell.rowspan && cell.rowspan > 1) td.rowSpan = cell.rowspan;
                        if (cell.isHeader) td.classList.add('header-cell');
                        
                        // Apply visual alignment based on cell alignment
                        const alignment = cell.alignment || 'c';
                        if (alignment === 'l') {
                            td.style.textAlign = 'left';
                        } else if (alignment === 'r') {
                            td.style.textAlign = 'right';
                        } else {
                            td.style.textAlign = 'center';
                        }
                        
                        // Apply visual borders based on column spec and row borders
                        // For cells that span multiple columns, check borders of first and last column
                        const cellColspan = cell.colspan || 1;
                        const firstColIndex = colIndex;
                        const lastColIndex = colIndex + cellColspan - 1;
                        
                        // Left border: check first column's left border
                        if (columnSpec[firstColIndex]?.leftBorder) {
                            td.style.borderLeft = '2px solid var(--vscode-editor-foreground)';
                        }
                        
                        // Right border: check last column's right border
                        if (columnSpec[lastColIndex]?.rightBorder) {
                            td.style.borderRight = '2px solid var(--vscode-editor-foreground)';
                        }
                        
                        // Top border: check if this row has a top border (hline or cline covering this column)
                        const rowBorder = rowBorders[rowIndex];
                        if (rowBorder?.hasTopBorder) {
                            td.style.borderTop = '2px solid var(--vscode-editor-foreground)';
                        } else if (rowBorder?.topClines) {
                            // Check if any cline covers this cell (LaTeX columns are 1-indexed)
                            const cellStartCol = colIndex + 1;
                            const cellEndCol = lastColIndex + 1;
                            for (const [clineStart, clineEnd] of rowBorder.topClines) {
                                if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                                    td.style.borderTop = '2px solid var(--vscode-editor-foreground)';
                                    break;
                                }
                            }
                        }
                        
                        // Bottom border: check if this row has a bottom border (hline or cline covering this column)
                        if (rowBorder?.hasBottomBorder) {
                            td.style.borderBottom = '2px solid var(--vscode-editor-foreground)';
                        } else if (rowBorder?.bottomClines) {
                            // Check if any cline covers this cell (LaTeX columns are 1-indexed)
                            const cellStartCol = colIndex + 1;
                            const cellEndCol = lastColIndex + 1;
                            for (const [clineStart, clineEnd] of rowBorder.bottomClines) {
                                if (clineStart <= cellStartCol && cellEndCol <= clineEnd) {
                                    td.style.borderBottom = '2px solid var(--vscode-editor-foreground)';
                                    break;
                                }
                            }
                        }
                        
                        td.dataset.row = rowIndex;
                        td.dataset.col = colIndex;
                        
                        // Create cell content div
                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'cell-content';
                        if (!cell.content || cell.content === '') {
                            contentDiv.classList.add('placeholder');
                            contentDiv.textContent = 'Double-click to edit';
                        } else {
                            contentDiv.textContent = cell.content;
                        }
                        
                        // Click to select
                        td.addEventListener('click', (e) => {
                            selectCell(rowIndex, colIndex, td);
                        });
                        
                        // Double-click to edit
                        td.addEventListener('dblclick', (e) => {
                            startEditing(rowIndex, colIndex, td);
                        });
                        
                        td.appendChild(contentDiv);
                        tr.appendChild(td);
                    });
                    table.appendChild(tr);
                });
            }
            
            function selectCell(row, col, tdElement) {
                // Remove previous selection
                document.querySelectorAll('#tableGrid td.selected').forEach(td => {
                    td.classList.remove('selected');
                });
                
                // Mark new selection
                tdElement.classList.add('selected');
                currentRow = row;
                currentCol = col;
                currentCell = currentGrid[row][col];
                
                // Update sidebar
                updateSidebar();
            }
            
            function startEditing(row, col, tdElement) {
                if (isEditing) return;
                
                isEditing = true;
                const cell = currentGrid[row][col];
                const contentDiv = tdElement.querySelector('.cell-content');
                
                // Replace div with input
                const input = document.createElement('input');
                input.type = 'text';
                input.value = cell.content || '';
                
                input.addEventListener('blur', () => {
                    finishEditing(row, col, input.value, tdElement);
                });
                
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        finishEditing(row, col, input.value, tdElement);
                    } else if (e.key === 'Escape') {
                        isEditing = false;
                        renderGrid();
                    }
                });
                
                tdElement.innerHTML = '';
                tdElement.appendChild(input);
                input.focus();
            }
            
            function finishEditing(row, col, value, tdElement) {
                isEditing = false;
                
                // Update grid
                currentGrid[row][col].content = value;
                
                // Send update to extension
                vscode.postMessage({
                    type: 'cellUpdate',
                    row: row,
                    col: col,
                    content: value
                });
                
                // Re-render
                renderGrid();
                
                // Re-select the cell
                setTimeout(() => {
                    const newTd = document.querySelector(\`td[data-row="\${row}"][data-col="\${col}"]\`);
                    if (newTd) {
                        selectCell(row, col, newTd);
                    }
                }, 10);
            }
            
            function updateSidebar() {
                const cell = currentCell || { colspan: 1, rowspan: 1, alignment: 'c' };
                
                // Update cell label
                document.getElementById('cellLabel').textContent = \`Cell (\${currentRow + 1}, \${currentCol + 1})\`;
                
                // Update alignment buttons
                document.querySelectorAll('.alignment-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Map LaTeX alignment (l/c/r) to UI values (left/center/right)
                const alignMap = { 'l': 'left', 'c': 'center', 'r': 'right' };
                const hAlign = alignMap[cell.alignment] || alignMap[cell.alignment || 'c'] || 'center';
                const hAlignBtn = document.querySelector(\`[data-align="\${hAlign}"]\`);
                if (hAlignBtn) hAlignBtn.classList.add('active');
                
                const vAlign = cell.verticalAlignment || 'middle';
                const vAlignBtn = document.querySelector(\`[data-valign="\${vAlign}"]\`);
                if (vAlignBtn) vAlignBtn.classList.add('active');
                
                // Update span controls
                document.getElementById('colSpan').value = cell.colspan || 1;
                document.getElementById('rowSpan').value = cell.rowspan || 1;
                
                // Update cell info
                document.getElementById('cellPosition').textContent = \`Row \${currentRow + 1}, Column \${currentCol + 1}\`;
                document.getElementById('cellSize').textContent = \`\${cell.colspan || 1} × \${cell.rowspan || 1}\`;
                
                // Update border controls for current cell
                updateBorderControlsForSelection();
            }
            
            function updateBorderControls(borderState) {
                // Update border checkboxes for specific row/column
                if (borderState.row !== undefined && borderState.col !== undefined) {
                    document.getElementById('borderThisColumnLeft').checked = borderState.thisColumnLeft;
                    document.getElementById('borderThisColumnRight').checked = borderState.thisColumnRight;
                    document.getElementById('borderThisRowTop').checked = borderState.thisRowTop;
                    document.getElementById('borderThisRowBottom').checked = borderState.thisRowBottom;
                    
                    // Update labels to show context
                    document.getElementById('borderThisColumnLeftLabel').textContent = 
                        \`│ Left of column \${borderState.col + 1}\`;
                    document.getElementById('borderThisColumnRightLabel').textContent = 
                        \`│ Right of column \${borderState.col + 1}\`;
                    document.getElementById('borderThisRowTopLabel').textContent = 
                        \`─ Above row \${borderState.row + 1}\`;
                    document.getElementById('borderThisRowBottomLabel').textContent = 
                        \`─ Below row \${borderState.row + 1}\`;
                }
            }
            
            function updateBorderControlsForSelection() {
                // Request border state for current selection
                vscode.postMessage({ 
                    type: 'getBorderState', 
                    row: currentRow, 
                    col: currentCol 
                });
            }
            
            // Toolbar button handlers
            document.getElementById('addRow').addEventListener('click', () => {
                vscode.postMessage({ type: 'insertRow', index: currentRow >= 0 ? currentRow : 0, position: 'below' });
            });
            
            document.getElementById('deleteRow').addEventListener('click', () => {
                if (currentRow >= 0) {
                    vscode.postMessage({ type: 'deleteRow', index: currentRow });
                }
            });
            
            document.getElementById('addColumn').addEventListener('click', () => {
                vscode.postMessage({ type: 'insertColumn', index: currentCol >= 0 ? currentCol : 0, position: 'right' });
            });
            
            document.getElementById('deleteColumn').addEventListener('click', () => {
                if (currentCol >= 0) {
                    vscode.postMessage({ type: 'deleteColumn', index: currentCol });
                }
            });
            
            // Alignment button handlers
            document.querySelectorAll('[data-align]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (currentRow >= 0 && currentCol >= 0) {
                        // Map UI values (left/center/right) to LaTeX alignment (l/c/r)
                        const alignMap = { 'left': 'l', 'center': 'c', 'right': 'r' };
                        const uiAlign = btn.dataset.align;
                        const latexAlign = alignMap[uiAlign] || 'c';
                        
                        document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        vscode.postMessage({ 
                            type: 'changeAlignment', 
                            row: currentRow,
                            column: currentCol, 
                            alignment: latexAlign 
                        });
                    }
                });
            });
            
            document.querySelectorAll('[data-valign]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (currentRow >= 0 && currentCol >= 0) {
                        const valign = btn.dataset.valign;
                        document.querySelectorAll('[data-valign]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        vscode.postMessage({ 
                            type: 'changeVerticalAlignment', 
                            row: currentRow,
                            column: currentCol, 
                            alignment: valign 
                        });
                    }
                });
            });
            
            // Span control handlers
            document.getElementById('colSpanPlus').addEventListener('click', () => {
                if (currentRow >= 0 && currentCol >= 0) {
                    const newSpan = parseInt(document.getElementById('colSpan').value) + 1;
                    document.getElementById('colSpan').value = newSpan;
                    vscode.postMessage({ 
                        type: 'changeColSpan', 
                        row: currentRow,
                        col: currentCol, 
                        span: newSpan 
                    });
                }
            });
            
            document.getElementById('colSpanMinus').addEventListener('click', () => {
                if (currentRow >= 0 && currentCol >= 0) {
                    const current = parseInt(document.getElementById('colSpan').value);
                    if (current > 1) {
                        const newSpan = current - 1;
                        document.getElementById('colSpan').value = newSpan;
                        vscode.postMessage({ 
                            type: 'changeColSpan', 
                            row: currentRow,
                            col: currentCol, 
                            span: newSpan 
                        });
                    }
                }
            });
            
            document.getElementById('rowSpanPlus').addEventListener('click', () => {
                if (currentRow >= 0 && currentCol >= 0) {
                    const newSpan = parseInt(document.getElementById('rowSpan').value) + 1;
                    document.getElementById('rowSpan').value = newSpan;
                    vscode.postMessage({ 
                        type: 'changeRowSpan', 
                        row: currentRow,
                        col: currentCol, 
                        span: newSpan 
                    });
                }
            });
            
            document.getElementById('rowSpanMinus').addEventListener('click', () => {
                if (currentRow >= 0 && currentCol >= 0) {
                    const current = parseInt(document.getElementById('rowSpan').value);
                    if (current > 1) {
                        const newSpan = current - 1;
                        document.getElementById('rowSpan').value = newSpan;
                        vscode.postMessage({ 
                            type: 'changeRowSpan', 
                            row: currentRow,
                            col: currentCol, 
                            span: newSpan 
                        });
                    }
                }
            });
            
            // Border preset buttons
            document.getElementById('borderNone').addEventListener('click', () => {
                vscode.postMessage({ type: 'setBorderPreset', preset: 'none' });
            });
            
            document.getElementById('borderAll').addEventListener('click', () => {
                vscode.postMessage({ type: 'setBorderPreset', preset: 'all' });
            });
            
            document.getElementById('borderOuter').addEventListener('click', () => {
                vscode.postMessage({ type: 'setBorderPreset', preset: 'outer' });
            });
            
            document.getElementById('borderHorizontal').addEventListener('click', () => {
                vscode.postMessage({ type: 'setBorderPreset', preset: 'horizontal' });
            });
            
            // Border detail toggles - context-sensitive per row/column
            document.getElementById('borderThisColumnLeft').addEventListener('change', (e) => {
                vscode.postMessage({ 
                    type: 'toggleBorder', 
                    border: 'thisColumnLeft', 
                    enabled: e.target.checked,
                    row: currentRow,
                    col: currentCol
                });
            });
            
            document.getElementById('borderThisColumnRight').addEventListener('change', (e) => {
                vscode.postMessage({ 
                    type: 'toggleBorder', 
                    border: 'thisColumnRight', 
                    enabled: e.target.checked,
                    row: currentRow,
                    col: currentCol
                });
            });
            
            document.getElementById('borderThisRowTop').addEventListener('change', (e) => {
                vscode.postMessage({ 
                    type: 'toggleBorder', 
                    border: 'thisRowTop', 
                    enabled: e.target.checked,
                    row: currentRow,
                    col: currentCol
                });
            });
            
            document.getElementById('borderThisRowBottom').addEventListener('change', (e) => {
                vscode.postMessage({ 
                    type: 'toggleBorder', 
                    border: 'thisRowBottom', 
                    enabled: e.target.checked,
                    row: currentRow,
                    col: currentCol
                });
            });
            
            // Caption field - show options when user types
            document.getElementById('tableCaption').addEventListener('input', (e) => {
                const captionOptions = document.getElementById('captionOptions');
                const hasCaption = e.target.value.trim().length > 0;
                captionOptions.style.display = hasCaption ? 'flex' : 'none';
                
                // Auto-enable table environment if caption is entered
                if (hasCaption && !document.getElementById('useTableEnvironment').checked) {
                    document.getElementById('useTableEnvironment').checked = true;
                    vscode.postMessage({
                        type: 'updateTableEnvironment',
                        hasTableEnvironment: true
                    });
                }
            });
            
            document.getElementById('tableCaption').addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'updateCaption',
                    caption: e.target.value
                });
            });
            
            // Table environment toggle
            document.getElementById('useTableEnvironment').addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'updateTableEnvironment',
                    hasTableEnvironment: e.target.checked
                });
            });
            
            // Caption position
            document.getElementById('captionPosition').addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'updateCaptionPosition',
                    position: e.target.value
                });
            });
            
            // Label field
            document.getElementById('tableLabel').addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'updateLabel',
                    label: e.target.value
                });
            });
        `;
    }

    /**
     * Edit table at cursor position (legacy compatibility)
     */
    private async editTableAtCursor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const table = this.extractTableAtCursor(editor);
        if (!table) {
            vscode.window.showErrorMessage('No table found at cursor. Place cursor inside a tabular environment.');
            return;
        }

        this.currentTable = table;
        await this.openEditor();
    }

    /**
     * Extract table data from cursor position
     */
    private extractTableAtCursor(editor: vscode.TextEditor): TableData | null {
        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();

        const beforeCursor = text.substring(0, document.offsetAt(position));
        const afterCursor = text.substring(document.offsetAt(position));

        // Find tabular environment
        const beginMatch = beforeCursor.match(/\\begin\{(tabular|table)\}(?:\[.*?\])?(?:\{([^}]+)\})?/g);
        if (!beginMatch) {
            return null;
        }

        const lastBegin = beginMatch[beginMatch.length - 1];
        const startIndex = beforeCursor.lastIndexOf(lastBegin);
        const endMatch = afterCursor.match(/\\end\{(tabular|table)\}/);
        
        if (!endMatch) {
            return null;
        }

        const endIndex = document.offsetAt(position) + endMatch.index! + endMatch[0].length;
        const tableText = text.substring(startIndex, endIndex);

        return this.parseTableLatex(tableText);
    }

    /**
     * Parse LaTeX table into TableData
     */
    private parseTableLatex(latex: string): TableData | null {
        // Extract alignment
        const alignMatch = latex.match(/\\begin\{tabular\}\{([^}]+)\}/);
        const alignment = alignMatch ? alignMatch[1].split('').filter(c => ['l', 'c', 'r'].includes(c)) : [];

        // Extract caption and label
        const captionMatch = latex.match(/\\caption\{([^}]+)\}/);
        const labelMatch = latex.match(/\\label\{([^}]+)\}/);

        // Extract table content
        const contentMatch = latex.match(/\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]+\}([\s\S]*?)\\end\{tabular\}/);
        if (!contentMatch) {
            return null;
        }

        const content = contentMatch[1];
        
        // Parse rows
        const rows = content.split('\\\\').map(row => row.trim()).filter(row => row.length > 0);
        const cells: TableCell[][] = [];

        for (const row of rows) {
            const cellTexts = row.split('&').map(cell => cell.trim());
            cells.push(cellTexts.map(content => ({ content })));
        }

        if (cells.length === 0) {
            return null;
        }

        return {
            rows: cells.length,
            cols: cells[0].length,
            cells,
            caption: captionMatch ? captionMatch[1] : '',
            label: labelMatch ? labelMatch[1] : '',
            alignment: alignment.length > 0 ? alignment : Array(cells[0].length).fill('l')
        };
    }

    /**
     * Insert table into document
     */
    private async insertTable(table: TableData): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const latex = this.generateTableLatex(table);

        await editor.edit(editBuilder => {
            if (editor.selection.isEmpty) {
                editBuilder.insert(editor.selection.active, latex);
            } else {
                editBuilder.replace(editor.selection, latex);
            }
        });

        vscode.window.showInformationMessage('Table inserted');
    }

    /**
     * Generate LaTeX code from table data
     */
    private generateTableLatex(table: TableData): string {
        const alignment = table.alignment.join('');
        const rows = table.cells.map(row => 
            row.map(cell => cell.content).join(' & ')
        ).join(' \\\\\n    ');

        let latex = `\\begin{table}[htbp]
    \\centering`;

        if (table.caption) {
            latex += `\n    \\caption{${table.caption}}`;
        }

        if (table.label) {
            latex += `\n    \\label{${table.label}}`;
        }

        latex += `
    \\begin{tabular}{${alignment}}
    \\hline
    ${rows} \\\\
    \\hline
    \\end{tabular}
\\end{table}\n`;

        return latex;
    }

    /**
     * Get HTML for table editor
     */
    private getEditorHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h3 {
            margin-top: 0;
        }

        .controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .table-container {
            overflow-x: auto;
            margin: 20px 0;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            background: var(--vscode-editor-background);
        }

        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            min-width: 100px;
        }

        th {
            background: var(--vscode-editor-selectionBackground);
            font-weight: bold;
        }

        input, select {
            width: 100%;
            padding: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: var(--vscode-font-family);
        }

        .metadata {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 10px;
            align-items: center;
            margin: 20px 0;
        }

        .metadata label {
            font-weight: bold;
        }

        .metadata input {
            max-width: 500px;
        }

        .preview {
            background: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            overflow-x: auto;
            white-space: pre;
            margin-top: 20px;
        }

        .cell-controls {
            display: flex;
            gap: 5px;
        }

        .cell-controls button {
            padding: 4px 8px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>LaTeX Table Editor</h3>

        <div class="controls">
            <button id="insertBtn">Insert into Document</button>
            <button id="addRowBtn">Add Row</button>
            <button id="addColBtn">Add Column</button>
            <button id="delRowBtn">Delete Last Row</button>
            <button id="delColBtn">Delete Last Column</button>
        </div>

        <div class="metadata">
            <label>Caption:</label>
            <input type="text" id="caption" placeholder="Table caption">
            
            <label>Label:</label>
            <input type="text" id="label" placeholder="tab:mytable">
            
            <label>Rows:</label>
            <input type="number" id="rows" value="3" min="1" max="20">
            
            <label>Columns:</label>
            <input type="number" id="cols" value="3" min="1" max="10">
            
            <button id="createTableBtn">Create Table</button>
        </div>

        <div class="table-container">
            <table id="dataTable"></table>
        </div>

        <h4>Column Alignment</h4>
        <div id="alignmentControls"></div>

        <h4>LaTeX Preview</h4>
        <div class="preview" id="preview"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let tableData = {
            rows: 3,
            cols: 3,
            cells: [],
            caption: '',
            label: '',
            alignment: []
        };

        function createTable() {
            const rows = parseInt(document.getElementById('rows').value);
            const cols = parseInt(document.getElementById('cols').value);
            
            tableData.rows = rows;
            tableData.cols = cols;
            tableData.cells = Array(rows).fill(null).map(() => 
                Array(cols).fill(null).map(() => ({ content: '' }))
            );
            tableData.alignment = Array(cols).fill('l');
            
            renderTable();
            renderAlignmentControls();
            updatePreview();
        }

        function renderTable() {
            const table = document.getElementById('dataTable');
            table.innerHTML = '';

            // Header row with column numbers
            const thead = table.createTHead();
            const headerRow = thead.insertRow();
            for (let j = 0; j < tableData.cols; j++) {
                const th = document.createElement('th');
                th.textContent = \`Col \${j + 1}\`;
                headerRow.appendChild(th);
            }

            // Data rows
            const tbody = table.createTBody();
            for (let i = 0; i < tableData.rows; i++) {
                const row = tbody.insertRow();
                for (let j = 0; j < tableData.cols; j++) {
                    const cell = row.insertCell();
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = tableData.cells[i][j].content;
                    input.addEventListener('input', (e) => {
                        tableData.cells[i][j].content = e.target.value;
                        updatePreview();
                    });
                    cell.appendChild(input);
                }
            }
        }

        function renderAlignmentControls() {
            const container = document.getElementById('alignmentControls');
            container.innerHTML = '';
            
            for (let j = 0; j < tableData.cols; j++) {
                const div = document.createElement('div');
                div.style.display = 'inline-block';
                div.style.margin = '5px';
                
                const label = document.createElement('label');
                label.textContent = \`Col \${j + 1}: \`;
                
                const select = document.createElement('select');
                const options = [
                    { value: 'l', text: 'Left' },
                    { value: 'c', text: 'Center' },
                    { value: 'r', text: 'Right' }
                ];
                
                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.text = opt.text;
                    if (tableData.alignment[j] === opt.value) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
                
                select.addEventListener('change', (e) => {
                    tableData.alignment[j] = e.target.value;
                    updatePreview();
                });
                
                div.appendChild(label);
                div.appendChild(select);
                container.appendChild(div);
            }
        }

        function updatePreview() {
            const preview = document.getElementById('preview');
            tableData.caption = document.getElementById('caption').value;
            tableData.label = document.getElementById('label').value;
            
            const alignment = tableData.alignment.join('');
            const rows = tableData.cells.map(row => 
                row.map(cell => cell.content || '').join(' & ')
            ).join(' \\\\\\\\\n    ');

            let latex = \`\\\\begin{table}[htbp]
    \\\\centering\`;

            if (tableData.caption) {
                latex += \`\n    \\\\caption{\${tableData.caption}}\`;
            }

            if (tableData.label) {
                latex += \`\n    \\\\label{\${tableData.label}}\`;
            }

            latex += \`
    \\\\begin{tabular}{\${alignment}}
    \\\\hline
    \${rows} \\\\\\\\
    \\\\hline
    \\\\end{tabular}
\\\\end{table}\`;

            preview.textContent = latex;
        }

        document.getElementById('insertBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'insert',
                table: tableData
            });
        });

        document.getElementById('addRowBtn').addEventListener('click', () => {
            tableData.rows++;
            tableData.cells.push(Array(tableData.cols).fill(null).map(() => ({ content: '' })));
            document.getElementById('rows').value = tableData.rows;
            renderTable();
            updatePreview();
        });

        document.getElementById('addColBtn').addEventListener('click', () => {
            tableData.cols++;
            tableData.cells.forEach(row => row.push({ content: '' }));
            tableData.alignment.push('l');
            document.getElementById('cols').value = tableData.cols;
            renderTable();
            renderAlignmentControls();
            updatePreview();
        });

        document.getElementById('delRowBtn').addEventListener('click', () => {
            if (tableData.rows > 1) {
                tableData.rows--;
                tableData.cells.pop();
                document.getElementById('rows').value = tableData.rows;
                renderTable();
                updatePreview();
            }
        });

        document.getElementById('delColBtn').addEventListener('click', () => {
            if (tableData.cols > 1) {
                tableData.cols--;
                tableData.cells.forEach(row => row.pop());
                tableData.alignment.pop();
                document.getElementById('cols').value = tableData.cols;
                renderTable();
                renderAlignmentControls();
                updatePreview();
            }
        });

        document.getElementById('caption').addEventListener('input', updatePreview);
        document.getElementById('label').addEventListener('input', updatePreview);
        
        document.getElementById('createTableBtn').addEventListener('click', createTable);

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setTable') {
                tableData = message.table;
                document.getElementById('rows').value = tableData.rows;
                document.getElementById('cols').value = tableData.cols;
                document.getElementById('caption').value = tableData.caption;
                document.getElementById('label').value = tableData.label;
                renderTable();
                renderAlignmentControls();
                updatePreview();
            }
        });

        // Initialize
        createTable();
    </script>
</body>
</html>`;
    }

    /**
     * Insert table template
     */
    private async insertTableTemplate(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const templates = {
            'Simple 3x3': `\\begin{table}[htbp]
    \\centering
    \\caption{Caption}
    \\label{tab:label}
    \\begin{tabular}{lcc}
    \\hline
    Header 1 & Header 2 & Header 3 \\\\
    \\hline
    Data 1 & Data 2 & Data 3 \\\\
    Data 4 & Data 5 & Data 6 \\\\
    \\hline
    \\end{tabular}
\\end{table}`,
            'Booktabs Style': `\\begin{table}[htbp]
    \\centering
    \\caption{Caption}
    \\label{tab:label}
    \\begin{tabular}{lcc}
    \\toprule
    Header 1 & Header 2 & Header 3 \\\\
    \\midrule
    Data 1 & Data 2 & Data 3 \\\\
    Data 4 & Data 5 & Data 6 \\\\
    \\bottomrule
    \\end{tabular}
\\end{table}`,
            'Multi-column': `\\begin{table}[htbp]
    \\centering
    \\caption{Caption}
    \\label{tab:label}
    \\begin{tabular}{lccc}
    \\hline
    \\multicolumn{2}{c}{Group 1} & \\multicolumn{2}{c}{Group 2} \\\\
    \\hline
    A & B & C & D \\\\
    1 & 2 & 3 & 4 \\\\
    \\hline
    \\end{tabular}
\\end{table}`
        };

        const selected = await vscode.window.showQuickPick(Object.keys(templates), {
            placeHolder: 'Select a table template'
        });

        if (!selected) {
            return;
        }

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, templates[selected as keyof typeof templates]);
        });
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
