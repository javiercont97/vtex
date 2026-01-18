import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Jimp } from 'jimp';
import { Logger } from '../utils/logger';

/**
 * Provides hover previews for images in LaTeX documents
 */
export class ImageHoverProvider implements vscode.HoverProvider {
    private readonly logger: Logger;
    private thumbnailCache: Map<string, string> = new Map(); // imagePath -> thumbnail data URI

    constructor(private context: vscode.ExtensionContext, logger: Logger) {
        this.logger = logger;
    }

    /**
     * Provide hover information for images
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (document.languageId !== 'latex') {
            return undefined;
        }

        const line = document.lineAt(position.line).text;
        const imageInfo = this.findImageAtPosition(line, position.character);
        
        if (!imageInfo) {
            return undefined;
        }

        // Resolve image path relative to document
        const docDir = path.dirname(document.uri.fsPath);
        const imagePath = path.resolve(docDir, imageInfo.path);

        // Check if image exists
        if (!fs.existsSync(imagePath)) {
            return new vscode.Hover(`❌ Image not found: ${imageInfo.path}`);
        }

        // Check cache
        if (this.thumbnailCache.has(imagePath)) {
            return this.createHoverWithThumbnail(this.thumbnailCache.get(imagePath)!, imageInfo);
        }

        // Generate thumbnail
        try {
            const thumbnailUri = await this.generateThumbnail(imagePath);
            if (thumbnailUri) {
                this.thumbnailCache.set(imagePath, thumbnailUri);
                return this.createHoverWithThumbnail(thumbnailUri, imageInfo);
            } else {
                return new vscode.Hover(`🖼️ Image: \`${imageInfo.path}\`\n\n*Preview unavailable*`);
            }
        } catch (error) {
            this.logger.error(`Failed to create thumbnail: ${error}`);
            return new vscode.Hover(`🖼️ Image: \`${imageInfo.path}\`\n\n*Preview failed*`);
        }
    }

    /**
     * Create hover with thumbnail
     */
    private createHoverWithThumbnail(thumbnailDataUri: string, imageInfo: { path: string; width?: string }): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;
        
        // Use markdown syntax with data URI
        markdown.appendMarkdown(`![preview](${thumbnailDataUri})\n\n`);
        markdown.appendMarkdown(`📁 \`${imageInfo.path}\`\n\n`);
        
        if (imageInfo.width) {
            markdown.appendMarkdown(`📏 Width: \`${imageInfo.width}\`\n\n`);
        }
        
        markdown.appendMarkdown(`---\n\n`);
        markdown.appendMarkdown(`💡 *Click "🖼️ Edit Figure" CodeLens to edit*`);
        
        return new vscode.Hover(markdown);
    }

    /**
     * Generate thumbnail using jimp (pure JavaScript, cross-platform)
     */
    private async generateThumbnail(imagePath: string): Promise<string> {
        try {
            // Read and resize image to max 200px height while maintaining aspect ratio
            const image = await Jimp.read(imagePath);
            
            // Resize to 200px height (AUTO maintains aspect ratio)
            if (image.height > 200) {
                await image.resize({ h: 200 });
            }
            
            // Convert to JPEG with quality 80
            const buffer = await image.getBuffer('image/jpeg', { quality: 80 });
            
            const base64 = buffer.toString('base64');
            const dataUri = `data:image/jpeg;base64,${base64}`;
            
            this.logger.info(`Thumbnail generated: ${imagePath}, size: ${buffer.length} bytes`);
            return dataUri;
        } catch (error) {
            this.logger.error(`Failed to generate thumbnail with jimp: ${error}`);
            return '';
        }
    }

    /**
     * Find image path at cursor position
     */
    private findImageAtPosition(line: string, character: number): { path: string; width?: string } | undefined {
        // Match \includegraphics[options]{path}
        const includeGraphicsRegex = /\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}/g;
        
        let match;
        while ((match = includeGraphicsRegex.exec(line)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;
            
            if (character >= start && character <= end) {
                const options = match[1] || '';
                const imagePath = match[2];
                
                // Extract width from options
                const widthMatch = options.match(/width\s*=\s*([^,\]]+)/);
                const width = widthMatch ? widthMatch[1].trim() : undefined;
                
                return { path: imagePath, width };
            }
        }
        
        return undefined;
    }
}
