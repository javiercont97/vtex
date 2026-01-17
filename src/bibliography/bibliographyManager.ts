import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

export interface BibEntry {
    key: string;
    type: string;
    fields: { [key: string]: string };
    rawText: string;
    startLine: number;
    endLine: number;
}

export class BibliographyManager {
    constructor(private logger: Logger) {}

    /**
     * Parse a BibTeX file
     */
    parseBibFile(filePath: string): BibEntry[] {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return this.parseBibContent(content);
        } catch (error) {
            this.logger.error(`Failed to parse bib file ${filePath}: ${error}`);
            return [];
        }
    }

    /**
     * Parse BibTeX content
     */
    parseBibContent(content: string): BibEntry[] {
        const entries: BibEntry[] = [];
        const lines = content.split('\n');
        
        // Match @type{key,
        const entryStartPattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,/;
        
        let currentEntry: BibEntry | null = null;
        let currentText = '';
        let braceDepth = 0;
        let startLine = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for entry start
            const match = line.match(entryStartPattern);
            if (match && braceDepth === 0) {
                const [, type, key] = match;
                currentEntry = {
                    key,
                    type: type.toLowerCase(),
                    fields: {},
                    rawText: '',
                    startLine: i + 1,
                    endLine: i + 1
                };
                currentText = line;
                braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                startLine = i;
                continue;
            }

            if (currentEntry) {
                currentText += '\n' + line;
                braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

                // Entry ended
                if (braceDepth === 0) {
                    currentEntry.rawText = currentText;
                    currentEntry.endLine = i + 1;
                    
                    // Parse fields
                    this.parseFields(currentText, currentEntry);
                    
                    entries.push(currentEntry);
                    currentEntry = null;
                    currentText = '';
                }
            }
        }

        return entries;
    }

    /**
     * Parse fields from entry text
     */
    private parseFields(text: string, entry: BibEntry): void {
        // Remove first line (@type{key,) and last line (})
        const lines = text.split('\n').slice(1, -1);
        const fieldText = lines.join('\n');
        
        // Match field = {value} or field = "value"
        const fieldPattern = /(\w+)\s*=\s*(\{[^}]*\}|"[^"]*")/g;
        let match;

        while ((match = fieldPattern.exec(fieldText)) !== null) {
            const [, fieldName, fieldValue] = match;
            // Remove surrounding braces or quotes
            const cleanValue = fieldValue.slice(1, -1);
            entry.fields[fieldName.toLowerCase()] = cleanValue;
        }
    }

    /**
     * Find all .bib files in workspace
     */
    async findBibFiles(): Promise<vscode.Uri[]> {
        const bibFiles = await vscode.workspace.findFiles('**/*.bib', '**/node_modules/**');
        return bibFiles;
    }

    /**
     * Get citation keys from .bib files
     */
    async getCitationKeys(): Promise<string[]> {
        const bibFiles = await this.findBibFiles();
        const keys: string[] = [];

        for (const file of bibFiles) {
            const entries = this.parseBibFile(file.fsPath);
            keys.push(...entries.map(e => e.key));
        }

        return keys;
    }

    /**
     * Get entry by key from all .bib files
     */
    async getEntryByKey(key: string): Promise<BibEntry | null> {
        const bibFiles = await this.findBibFiles();

        for (const file of bibFiles) {
            const entries = this.parseBibFile(file.fsPath);
            const entry = entries.find(e => e.key === key);
            if (entry) {
                return entry;
            }
        }

        return null;
    }

    /**
     * Format entry for display
     */
    formatEntry(entry: BibEntry): string {
        let formatted = `@${entry.type}{${entry.key},\n`;
        
        for (const [field, value] of Object.entries(entry.fields)) {
            formatted += `  ${field} = {${value}},\n`;
        }
        
        formatted += '}';
        return formatted;
    }

    /**
     * Create a new BibTeX entry template
     */
    createEntryTemplate(type: string, key: string): string {
        const templates: { [key: string]: string[] } = {
            article: ['author', 'title', 'journal', 'year', 'volume', 'pages'],
            book: ['author', 'title', 'publisher', 'year'],
            inproceedings: ['author', 'title', 'booktitle', 'year', 'pages'],
            phdthesis: ['author', 'title', 'school', 'year'],
            mastersthesis: ['author', 'title', 'school', 'year'],
            techreport: ['author', 'title', 'institution', 'year'],
            misc: ['author', 'title', 'howpublished', 'year']
        };

        const fields = templates[type] || templates['misc'];
        
        let template = `@${type}{${key},\n`;
        for (const field of fields) {
            template += `  ${field} = {},\n`;
        }
        template += '}\n';

        return template;
    }

    /**
     * Provide citation completion items
     */
    async provideCitationCompletions(): Promise<vscode.CompletionItem[]> {
        const bibFiles = await this.findBibFiles();
        const completions: vscode.CompletionItem[] = [];

        for (const file of bibFiles) {
            const entries = this.parseBibFile(file.fsPath);
            
            for (const entry of entries) {
                const item = new vscode.CompletionItem(entry.key, vscode.CompletionItemKind.Reference);
                
                // Build detail string
                const author = entry.fields.author || 'Unknown';
                const year = entry.fields.year || '';
                const title = entry.fields.title || '';
                
                item.detail = `${author} (${year})`;
                item.documentation = new vscode.MarkdownString(
                    `**${title}**\n\n${this.formatEntry(entry)}`
                );
                
                completions.push(item);
            }
        }

        return completions;
    }

    /**
     * Show citation picker
     */
    async showCitationPicker(): Promise<string | undefined> {
        const bibFiles = await this.findBibFiles();
        
        if (bibFiles.length === 0) {
            vscode.window.showInformationMessage('No .bib files found in workspace');
            return undefined;
        }

        const items: vscode.QuickPickItem[] = [];

        for (const file of bibFiles) {
            const entries = this.parseBibFile(file.fsPath);
            
            for (const entry of entries) {
                const author = entry.fields.author || 'Unknown';
                const year = entry.fields.year || '';
                const title = entry.fields.title || '';
                
                items.push({
                    label: entry.key,
                    description: `${author} (${year})`,
                    detail: title
                });
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a citation',
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.label;
    }

    /**
     * Insert citation at cursor
     */
    async insertCitation(key: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, `\\cite{${key}}`);
        });
    }

    /**
     * Validate BibTeX file
     */
    validateBibFile(filePath: string): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const entries = this.parseBibFile(filePath);
            
            // Check for duplicate keys
            const keys = new Set<string>();
            for (const entry of entries) {
                if (keys.has(entry.key)) {
                    errors.push(`Duplicate key: ${entry.key}`);
                } else {
                    keys.add(entry.key);
                }

                // Check required fields
                const requiredFields = this.getRequiredFields(entry.type);
                for (const field of requiredFields) {
                    if (!entry.fields[field]) {
                        warnings.push(`Missing required field '${field}' in entry ${entry.key}`);
                    }
                }
            }
        } catch (error) {
            errors.push(`Failed to parse file: ${error}`);
        }

        return { errors, warnings };
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
            mastersthesis: ['author', 'title', 'school', 'year']
        };

        return required[type] || [];
    }
}
