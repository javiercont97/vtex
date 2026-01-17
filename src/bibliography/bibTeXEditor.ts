import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { BibliographyManager, BibEntry } from './bibliographyManager';

export class BibTeXEditor {
    private panel: vscode.WebviewPanel | undefined;
    private currentFile: string | undefined;
    private currentEntry: BibEntry | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private bibliographyManager: BibliographyManager
    ) {}

    /**
     * Open BibTeX editor for a specific entry in a file
     */
    async openEditor(filePath: string, entryKey?: string): Promise<void> {
        this.logger.info(`Opening BibTeX editor for ${filePath}${entryKey ? `, entry: ${entryKey}` : ''}`);

        if (!fs.existsSync(filePath)) {
            vscode.window.showErrorMessage(`BibTeX file not found: ${filePath}`);
            return;
        }

        this.currentFile = filePath;

        // Parse file to get entry
        const entries = await this.bibliographyManager.parseBibFile(filePath);
        
        if (entryKey) {
            this.currentEntry = entries.find(e => e.key === entryKey);
            if (!this.currentEntry) {
                vscode.window.showErrorMessage(`Entry '${entryKey}' not found in ${path.basename(filePath)}`);
                return;
            }
        } else {
            // No specific entry - create new one
            this.currentEntry = {
                key: '',
                type: 'article',
                fields: {},
                rawText: '',
                startLine: 0,
                endLine: 0
            };
        }

        // Create or show panel
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vtexBibtexEditor',
                `Edit BibTeX Entry`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.panel.webview.onDidReceiveMessage(
                message => this.handleMessage(message),
                undefined,
                this.context.subscriptions
            );
        }

        // Update panel title and content
        this.panel.title = entryKey ? `Edit: ${entryKey}` : 'New BibTeX Entry';
        this.panel.webview.html = this.getWebviewContent(this.currentEntry);
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'save':
                await this.saveEntry(message.entry);
                break;
            case 'cancel':
                this.panel?.dispose();
                break;
            case 'typeChanged':
                // Update required fields based on entry type
                if (this.panel) {
                    this.panel.webview.postMessage({
                        command: 'updateFields',
                        requiredFields: this.getRequiredFields(message.type),
                        optionalFields: this.getOptionalFields(message.type)
                    });
                }
                break;
        }
    }

    /**
     * Save entry to BibTeX file
     */
    private async saveEntry(entry: BibEntry): Promise<void> {
        if (!this.currentFile) {
            return;
        }

        try {
            const fileContent = fs.readFileSync(this.currentFile, 'utf8');
            let newContent: string;

            if (this.currentEntry?.key && this.currentEntry.key !== '') {
                // Update existing entry
                const entryRegex = new RegExp(`@${this.currentEntry.type}\\s*{\\s*${this.currentEntry.key}\\s*,[^}]*}`, 'i');
                const newEntryText = this.formatEntry(entry);
                newContent = fileContent.replace(entryRegex, newEntryText);
            } else {
                // Append new entry
                const newEntryText = this.formatEntry(entry);
                newContent = fileContent + '\n\n' + newEntryText;
            }

            fs.writeFileSync(this.currentFile, newContent, 'utf8');
            
            vscode.window.showInformationMessage(`BibTeX entry '${entry.key}' saved successfully`);
            this.panel?.dispose();

            // Refresh the file in editor if it's open
            const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === this.currentFile);
            if (doc) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    doc.uri,
                    new vscode.Range(0, 0, doc.lineCount, 0),
                    newContent
                );
                await vscode.workspace.applyEdit(edit);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save BibTeX entry: ${error.message}`);
            this.logger.error(`Failed to save BibTeX entry: ${error.message}`);
        }
    }

    /**
     * Format entry as BibTeX string
     */
    private formatEntry(entry: BibEntry): string {
        const lines: string[] = [`@${entry.type}{${entry.key},`];
        
        for (const [key, value] of Object.entries(entry.fields)) {
            if (value.trim()) {
                lines.push(`  ${key} = {${value}},`);
            }
        }

        lines.push('}');
        return lines.join('\n');
    }

    /**
     * Get required fields for entry type
     */
    private getRequiredFields(type: string): string[] {
        const required: { [key: string]: string[] } = {
            article: ['author', 'title', 'journal', 'year'],
            book: ['author', 'title', 'publisher', 'year'],
            inproceedings: ['author', 'title', 'booktitle', 'year'],
            phdthesis: ['author', 'title', 'school', 'year'],
            mastersthesis: ['author', 'title', 'school', 'year'],
            techreport: ['author', 'title', 'institution', 'year'],
            misc: ['title'],
            unpublished: ['author', 'title', 'note']
        };
        return required[type.toLowerCase()] || ['title'];
    }

    /**
     * Get optional fields for entry type
     */
    private getOptionalFields(type: string): string[] {
        const optional: { [key: string]: string[] } = {
            article: ['volume', 'number', 'pages', 'month', 'note', 'doi', 'url'],
            book: ['editor', 'volume', 'series', 'address', 'edition', 'month', 'note', 'isbn'],
            inproceedings: ['editor', 'volume', 'series', 'pages', 'address', 'month', 'organization', 'publisher'],
            phdthesis: ['address', 'month', 'note'],
            mastersthesis: ['address', 'month', 'note'],
            techreport: ['type', 'number', 'address', 'month', 'note'],
            misc: ['author', 'howpublished', 'month', 'year', 'note'],
            unpublished: ['month', 'year']
        };
        return optional[type.toLowerCase()] || ['author', 'year', 'note'];
    }

    /**
     * Generate HTML for webview
     */
    private getWebviewContent(entry: BibEntry): string {
        const requiredFields = this.getRequiredFields(entry.type);
        const optionalFields = this.getOptionalFields(entry.type);

        const entryTypes = [
            'article', 'book', 'inproceedings', 'phdthesis', 
            'mastersthesis', 'techreport', 'misc', 'unpublished'
        ];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BibTeX Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        label.required::after {
            content: ' *';
            color: var(--vscode-errorForeground);
        }
        input, select, textarea {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        textarea {
            min-height: 60px;
            resize: vertical;
        }
        input:focus, select:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }
        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .fields-section {
            margin-top: 20px;
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }
        .info {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <h1>BibTeX Entry Editor</h1>
    
    <form id="bibtexForm">
        <div class="form-group">
            <label for="key" class="required">Citation Key</label>
            <input type="text" id="key" name="key" value="${entry.key}" 
                   placeholder="e.g., Einstein1905" required>
            <div class="info">Unique identifier for this reference (no spaces)</div>
        </div>

        <div class="form-group">
            <label for="type" class="required">Entry Type</label>
            <select id="type" name="type" required>
                ${entryTypes.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('\n')}
            </select>
        </div>

        <div class="fields-section">
            <div class="section-title">Required Fields</div>
            <div id="requiredFields">
                ${requiredFields.map(field => `
                    <div class="form-group">
                        <label for="${field}" class="required">${this.capitalizeFirst(field)}</label>
                        <input type="text" id="${field}" name="${field}" 
                               value="${entry.fields[field] || ''}" required>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="fields-section">
            <div class="section-title">Optional Fields</div>
            <div id="optionalFields">
                ${optionalFields.map(field => `
                    <div class="form-group">
                        <label for="${field}">${this.capitalizeFirst(field)}</label>
                        <input type="text" id="${field}" name="${field}" 
                               value="${entry.fields[field] || ''}">
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="button-group">
            <button type="submit" class="primary">Save Entry</button>
            <button type="button" class="secondary" id="cancelBtn">Cancel</button>
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('bibtexForm');
        const typeSelect = document.getElementById('type');
        const cancelBtn = document.getElementById('cancelBtn');

        // Handle form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const entry = {
                key: formData.get('key'),
                type: formData.get('type'),
                fields: {}
            };

            // Collect all fields
            for (const [key, value] of formData.entries()) {
                if (key !== 'key' && key !== 'type' && value) {
                    entry.fields[key] = value;
                }
            }

            vscode.postMessage({
                command: 'save',
                entry: entry
            });
        });

        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });

        // Handle type change to update fields
        typeSelect.addEventListener('change', (e) => {
            vscode.postMessage({
                command: 'typeChanged',
                type: e.target.value
            });
        });

        // Handle field updates from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateFields') {
                updateFields(message.requiredFields, message.optionalFields);
            }
        });

        function updateFields(requiredFields, optionalFields) {
            // Get current values
            const currentValues = {};
            const inputs = form.querySelectorAll('input[type="text"]:not(#key)');
            inputs.forEach(input => {
                if (input.value) {
                    currentValues[input.name] = input.value;
                }
            });

            // Update required fields
            const requiredDiv = document.getElementById('requiredFields');
            requiredDiv.innerHTML = requiredFields.map(field => \`
                <div class="form-group">
                    <label for="\${field}" class="required">\${capitalize(field)}</label>
                    <input type="text" id="\${field}" name="\${field}" 
                           value="\${currentValues[field] || ''}" required>
                </div>
            \`).join('');

            // Update optional fields
            const optionalDiv = document.getElementById('optionalFields');
            optionalDiv.innerHTML = optionalFields.map(field => \`
                <div class="form-group">
                    <label for="\${field}">\${capitalize(field)}</label>
                    <input type="text" id="\${field}" name="\${field}" 
                           value="\${currentValues[field] || ''}">
                </div>
            \`).join('');
        }

        function capitalize(str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        }
    </script>
</body>
</html>`;
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
