import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

export interface ProjectStructure {
    rootFile: vscode.Uri;
    includedFiles: vscode.Uri[];
    bibliographyFiles: vscode.Uri[];
    imageFiles: vscode.Uri[];
}

export class ProjectManager {
    private projectCache: Map<string, ProjectStructure>;

    constructor(
        private config: Config,
        private logger: Logger
    ) {
        this.projectCache = new Map();
    }

    /**
     * Find the root file for a given LaTeX document
     */
    async findRootFile(document: vscode.TextDocument): Promise<vscode.Uri> {
        // 1. Check if explicitly configured
        const configuredRoot = this.config.get<string>('rootFile');
        if (configuredRoot) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                const rootPath = path.join(workspaceFolder.uri.fsPath, configuredRoot);
                if (fs.existsSync(rootPath)) {
                    this.logger.info(`Using configured root file: ${rootPath}`);
                    return vscode.Uri.file(rootPath);
                }
            }
        }

        // 2. Check if current file has \documentclass (it's a root file)
        const content = document.getText();
        if (this.hasDocumentClass(content)) {
            this.logger.info(`Current file is root: ${document.uri.fsPath}`);
            return document.uri;
        }

        // 3. Look for root file in same directory
        const dirPath = path.dirname(document.uri.fsPath);
        const filesInDir = fs.readdirSync(dirPath).filter(f => f.endsWith('.tex'));
        
        for (const file of filesInDir) {
            const filePath = path.join(dirPath, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                if (this.hasDocumentClass(fileContent) && this.includesFile(fileContent, document.uri.fsPath)) {
                    this.logger.info(`Found root file in same directory: ${filePath}`);
                    return vscode.Uri.file(filePath);
                }
            } catch (error) {
                // Skip files that can't be read
            }
        }

        // 4. Look for root file in parent directories (up to workspace root)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            const rootFile = await this.searchForRootFile(
                document.uri.fsPath,
                workspaceFolder.uri.fsPath
            );
            if (rootFile) {
                this.logger.info(`Found root file in parent directory: ${rootFile}`);
                return vscode.Uri.file(rootFile);
            }
        }

        // 5. Default to current file
        this.logger.info(`No root file found, using current file: ${document.uri.fsPath}`);
        return document.uri;
    }

    /**
     * Search for root file in parent directories
     */
    private async searchForRootFile(
        currentPath: string,
        workspaceRoot: string
    ): Promise<string | null> {
        let dirPath = path.dirname(currentPath);

        while (dirPath.startsWith(workspaceRoot) && dirPath !== workspaceRoot) {
            const filesInDir = fs.readdirSync(dirPath).filter(f => f.endsWith('.tex'));
            
            for (const file of filesInDir) {
                const filePath = path.join(dirPath, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (this.hasDocumentClass(content)) {
                        // Check if this root file includes our current file
                        if (this.includesFileRecursive(content, filePath, currentPath)) {
                            return filePath;
                        }
                    }
                } catch (error) {
                    // Skip files that can't be read
                }
            }

            // Move to parent directory
            const parentDir = path.dirname(dirPath);
            if (parentDir === dirPath) {
                break; // Reached filesystem root
            }
            dirPath = parentDir;
        }

        return null;
    }

    /**
     * Check if content has \documentclass
     */
    private hasDocumentClass(content: string): boolean {
        return /\\documentclass(\[.*?\])?\{.*?\}/.test(content);
    }

    /**
     * Check if content includes a specific file
     */
    private includesFile(content: string, targetPath: string): boolean {
        const targetName = path.basename(targetPath, '.tex');
        
        // Check \input{file} or \include{file}
        const includePattern = /\\(?:input|include)\{([^}]+)\}/g;
        let match;
        
        while ((match = includePattern.exec(content)) !== null) {
            const includedFile = match[1].replace(/\.tex$/, '');
            if (includedFile === targetName || includedFile.endsWith(`/${targetName}`)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if file includes target file recursively
     */
    private includesFileRecursive(
        content: string,
        currentPath: string,
        targetPath: string,
        visited: Set<string> = new Set()
    ): boolean {
        if (visited.has(currentPath)) {
            return false;
        }
        visited.add(currentPath);

        const targetName = path.basename(targetPath, '.tex');
        const currentDir = path.dirname(currentPath);

        // Check \input{file} or \include{file}
        const includePattern = /\\(?:input|include)\{([^}]+)\}/g;
        let match;

        while ((match = includePattern.exec(content)) !== null) {
            let includedFile = match[1].replace(/\.tex$/, '');
            
            // Resolve relative path
            const resolvedPath = path.resolve(currentDir, includedFile + '.tex');
            
            if (resolvedPath === targetPath) {
                return true;
            }

            // Recursively check included file
            try {
                if (fs.existsSync(resolvedPath)) {
                    const includedContent = fs.readFileSync(resolvedPath, 'utf-8');
                    if (this.includesFileRecursive(includedContent, resolvedPath, targetPath, visited)) {
                        return true;
                    }
                }
            } catch (error) {
                // Skip files that can't be read
            }
        }

        return false;
    }

    /**
     * Analyze project structure
     */
    async analyzeProject(rootFile: vscode.Uri): Promise<ProjectStructure> {
        const cacheKey = rootFile.fsPath;
        
        // Check cache
        if (this.projectCache.has(cacheKey)) {
            return this.projectCache.get(cacheKey)!;
        }

        this.logger.info(`Analyzing project structure for: ${rootFile.fsPath}`);

        const structure: ProjectStructure = {
            rootFile,
            includedFiles: [],
            bibliographyFiles: [],
            imageFiles: []
        };

        try {
            const content = fs.readFileSync(rootFile.fsPath, 'utf-8');
            const rootDir = path.dirname(rootFile.fsPath);

            // Find included files
            structure.includedFiles = this.findIncludedFiles(content, rootDir);

            // Find bibliography files
            structure.bibliographyFiles = this.findBibliographyFiles(content, rootDir);

            // Find image files
            structure.imageFiles = this.findImageFiles(content, rootDir);

            // Cache the result
            this.projectCache.set(cacheKey, structure);

            this.logger.info(
                `Project analysis complete: ${structure.includedFiles.length} included files, ` +
                `${structure.bibliographyFiles.length} bibliography files, ` +
                `${structure.imageFiles.length} image files`
            );
        } catch (error) {
            this.logger.error(`Failed to analyze project: ${error}`);
        }

        return structure;
    }

    /**
     * Find all included files recursively
     */
    private findIncludedFiles(
        content: string,
        baseDir: string,
        visited: Set<string> = new Set()
    ): vscode.Uri[] {
        const files: vscode.Uri[] = [];
        
        // Match \input{file} and \include{file}
        const includePattern = /\\(?:input|include)\{([^}]+)\}/g;
        let match;

        while ((match = includePattern.exec(content)) !== null) {
            let includedFile = match[1];
            
            // Add .tex extension if not present
            if (!includedFile.endsWith('.tex')) {
                includedFile += '.tex';
            }

            const resolvedPath = path.resolve(baseDir, includedFile);
            
            if (visited.has(resolvedPath)) {
                continue;
            }
            visited.add(resolvedPath);

            if (fs.existsSync(resolvedPath)) {
                files.push(vscode.Uri.file(resolvedPath));

                // Recursively find files in included file
                try {
                    const includedContent = fs.readFileSync(resolvedPath, 'utf-8');
                    const nestedFiles = this.findIncludedFiles(
                        includedContent,
                        path.dirname(resolvedPath),
                        visited
                    );
                    files.push(...nestedFiles);
                } catch (error) {
                    // Skip files that can't be read
                }
            }
        }

        return files;
    }

    /**
     * Find bibliography files
     */
    private findBibliographyFiles(content: string, baseDir: string): vscode.Uri[] {
        const files: vscode.Uri[] = [];
        
        // Match \bibliography{file} and \addbibresource{file}
        const bibPattern = /\\(?:bibliography|addbibresource)(?:\[.*?\])?\{([^}]+)\}/g;
        let match;

        while ((match = bibPattern.exec(content)) !== null) {
            const bibFiles = match[1].split(',');
            
            for (let bibFile of bibFiles) {
                bibFile = bibFile.trim();
                
                // Add .bib extension if not present
                if (!bibFile.endsWith('.bib')) {
                    bibFile += '.bib';
                }

                const resolvedPath = path.resolve(baseDir, bibFile);
                if (fs.existsSync(resolvedPath)) {
                    files.push(vscode.Uri.file(resolvedPath));
                }
            }
        }

        return files;
    }

    /**
     * Find image files
     */
    private findImageFiles(content: string, baseDir: string): vscode.Uri[] {
        const files: vscode.Uri[] = [];
        
        // Match \includegraphics{file}
        const imagePattern = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
        let match;

        while ((match = imagePattern.exec(content)) !== null) {
            const imageFile = match[1];
            
            // Try common image extensions
            const extensions = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps'];
            
            for (const ext of extensions) {
                const resolvedPath = path.resolve(baseDir, imageFile + ext);
                if (fs.existsSync(resolvedPath)) {
                    files.push(vscode.Uri.file(resolvedPath));
                    break;
                }
            }
        }

        return files;
    }

    /**
     * Clear project cache
     */
    clearCache(rootFile?: vscode.Uri): void {
        if (rootFile) {
            this.projectCache.delete(rootFile.fsPath);
            this.logger.info(`Cleared cache for: ${rootFile.fsPath}`);
        } else {
            this.projectCache.clear();
            this.logger.info('Cleared all project cache');
        }
    }

    /**
     * Get all LaTeX files in workspace
     */
    async getAllLatexFiles(): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**');
        return files;
    }

    /**
     * Suggest root file configuration
     */
    async suggestRootFileConfiguration(document: vscode.TextDocument): Promise<void> {
        const rootFile = await this.findRootFile(document);
        
        if (rootFile.fsPath !== document.uri.fsPath) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, rootFile.fsPath);
                
                const action = await vscode.window.showInformationMessage(
                    `Detected root file: ${path.basename(rootFile.fsPath)}. Configure it as project root?`,
                    'Yes',
                    'No'
                );

                if (action === 'Yes') {
                    await this.config.update('rootFile', relativePath, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`Root file configured: ${relativePath}`);
                }
            }
        }
    }
}
