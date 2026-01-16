import * as vscode from 'vscode';
import { Config } from '../utils/config';
import { Logger } from '../utils/logger';
import { EnvironmentDetector } from './detector';
import { LocalBuilder } from './localBuilder';
import { DockerBuilder } from './dockerBuilder';

export interface IBuilder {
    build(documentUri: vscode.Uri): Promise<BuildResult>;
    clean(documentUri: vscode.Uri): Promise<void>;
    isAvailable(): Promise<boolean>;
    getName(): string;
}

export interface BuildResult {
    success: boolean;
    output: string;
    errors: BuildError[];
    pdfPath?: string;
}

export interface BuildError {
    file: string;
    line: number;
    message: string;
    severity: 'error' | 'warning';
}

export class BuildSystem {
    private builder: IBuilder | null = null;
    private detector: EnvironmentDetector;

    constructor(
        private config: Config,
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {
        this.detector = new EnvironmentDetector(logger);
    }

    async initialize(): Promise<void> {
        try {
            const buildMethod = this.config.getBuildMethod();
            this.logger.info(`Initializing build system with method: ${buildMethod}`);

            if (buildMethod === 'local') {
                this.builder = new LocalBuilder(this.config, this.logger);
            } else if (buildMethod === 'docker') {
                this.builder = new DockerBuilder(this.config, this.logger);
            } else {
                // Auto-detect
                const hasLocal = await this.detector.hasLocalTexLive();
                if (hasLocal) {
                    this.logger.info('Local TeX Live detected, using local builder');
                    this.builder = new LocalBuilder(this.config, this.logger);
                } else {
                    const hasDocker = await this.detector.hasDocker();
                    if (hasDocker) {
                        this.logger.info('Docker detected, using Docker builder');
                        this.builder = new DockerBuilder(this.config, this.logger);
                    } else {
                        this.logger.error('No LaTeX environment found!');
                        vscode.window.showErrorMessage(
                            'No LaTeX environment detected. Please install TeX Live or Docker.'
                        );
                        return;
                    }
                }
            }

            if (this.builder) {
                const available = await this.builder.isAvailable();
                if (!available) {
                    this.logger.warn(`Selected builder ${this.builder.getName()} is not available`);
                    vscode.window.showWarningMessage(
                        `Selected build method (${this.builder.getName()}) is not available`
                    );
                }
            }
            
            this.logger.info('Build system initialized successfully');
        } catch (error) {
            this.logger.error(`Error during build system initialization: ${error}`);
            throw error;
        }
    }

    async build(documentUri: vscode.Uri): Promise<BuildResult> {
        if (!this.builder) {
            throw new Error('Build system not initialized');
        }

        return await this.builder.build(documentUri);
    }

    async clean(documentUri: vscode.Uri): Promise<void> {
        if (!this.builder) {
            throw new Error('Build system not initialized');
        }

        await this.builder.clean(documentUri);
    }

    async getEnvironmentInfo(): Promise<string> {
        const hasLocal = await this.detector.hasLocalTexLive();
        const hasDocker = await this.detector.hasDocker();
        const localVersion = hasLocal ? await this.detector.getTexLiveVersion() : 'N/A';
        const dockerVersion = hasDocker ? await this.detector.getDockerVersion() : 'N/A';

        const currentBuilder = this.builder ? this.builder.getName() : 'None';

        return [
            `Current Builder: ${currentBuilder}`,
            `Local TeX Live: ${hasLocal ? 'Yes' : 'No'} (${localVersion})`,
            `Docker: ${hasDocker ? 'Yes' : 'No'} (${dockerVersion})`
        ].join('\n');
    }
}
