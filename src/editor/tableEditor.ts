import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

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

/**
 * Visual table editor for LaTeX
 */
export class TableEditor {
    private panel: vscode.WebviewPanel | undefined;
    private currentTable: TableData | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {}

    /**
     * Register table editor commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.openTableEditor', () => this.openEditor()),
            vscode.commands.registerCommand('vtex.editTableAtCursor', () => this.editTableAtCursor()),
            vscode.commands.registerCommand('vtex.insertTableTemplate', () => this.insertTableTemplate())
        ];
    }

    /**
     * Open table editor panel
     */
    private async openEditor(initialTable?: TableData): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        this.currentTable = initialTable;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'tableEditor',
                'LaTeX Table Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.html = this.getEditorHtml();

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'insert':
                            await this.insertTable(message.table);
                            break;
                        case 'addRow':
                        case 'addColumn':
                        case 'deleteRow':
                        case 'deleteColumn':
                            // Handled in webview
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        // Send initial table data
        if (this.currentTable) {
            this.panel.webview.postMessage({
                command: 'setTable',
                table: this.currentTable
            });
        }
    }

    /**
     * Edit table at cursor position
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

        await this.openEditor(table);
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
