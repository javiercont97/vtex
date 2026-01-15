import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Config } from '../utils/config';
import { Logger } from '../utils/logger';
import { IBuilder, BuildResult, BuildError } from './builder';
import { ErrorParser } from './errorParser';

const execAsync = promisify(exec);

export class LocalBuilder implements IBuilder {
    private errorParser: ErrorParser;

    constructor(
        private config: Config,
        private logger: Logger
    ) {
        this.errorParser = new ErrorParser();
    }

    getName(): string {
        return 'Local TeX Live';
    }

    async isAvailable(): Promise<boolean> {
        try {
            const engine = this.config.getBuildEngine();
            await execAsync(`${engine} --version`);
            return true;
        } catch {
            return false;
        }
    }

    async build(documentUri: vscode.Uri): Promise<BuildResult> {
        const docPath = documentUri.fsPath;
        const docDir = path.dirname(docPath);
        const docName = path.basename(docPath, '.tex');
        const engine = this.config.getBuildEngine();

        this.logger.info(`Building with local ${engine}: ${docPath}`);

        try {
            let command: string;
            let cwd = docDir;

            if (engine === 'latexmk') {
                const options = this.config.getLatexmkOptions().join(' ');
                command = `latexmk ${options} -output-directory=. "${docName}.tex"`;
            } else {
                // Direct engine call
                command = `${engine} -interaction=nonstopmode -synctex=1 -file-line-error "${docName}.tex"`;
            }

            this.logger.info(`Executing: ${command}`);
            this.logger.info(`Working directory: ${cwd}`);

            const { stdout, stderr } = await execAsync(command, {
                cwd,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            const output = stdout + stderr;
            this.logger.info('Build output:');
            this.logger.info(output);

            // Check if PDF was created
            const pdfPath = path.join(docDir, `${docName}.pdf`);
            const pdfExists = await this.fileExists(pdfPath);

            const errors = this.errorParser.parse(output);

            return {
                success: pdfExists && errors.filter(e => e.severity === 'error').length === 0,
                output,
                errors,
                pdfPath: pdfExists ? pdfPath : undefined
            };
        } catch (error: any) {
            this.logger.error(`Build failed: ${error.message}`);
            const errors = this.errorParser.parse(error.stdout || error.message);
            
            return {
                success: false,
                output: error.stdout || error.message,
                errors
            };
        }
    }

    async clean(documentUri: vscode.Uri): Promise<void> {
        const docPath = documentUri.fsPath;
        const docDir = path.dirname(docPath);
        const docName = path.basename(docPath, '.tex');

        const extensions = [
            '.aux', '.log', '.out', '.toc', '.lof', '.lot',
            '.fls', '.fdb_latexmk', '.synctex.gz', '.bbl', '.blg',
            '.nav', '.snm', '.vrb', '.bcf', '.run.xml'
        ];

        this.logger.info(`Cleaning auxiliary files for ${docName}`);

        for (const ext of extensions) {
            const filePath = path.join(docDir, docName + ext);
            try {
                await fs.unlink(filePath);
                this.logger.info(`Deleted ${filePath}`);
            } catch {
                // File doesn't exist, ignore
            }
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}
