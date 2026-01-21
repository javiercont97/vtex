/**
 * TikZ Parser and AST
 * Parses TikZ code into an Abstract Syntax Tree for visual editing
 */

import * as vscode from 'vscode';

// ============================================================================
// AST Types
// ============================================================================

export interface Point {
    x: number;
    y: number;
}

export interface TikZOptions {
    // Colors
    draw?: string;
    fill?: string;
    color?: string;
    
    // Line styles
    lineWidth?: string;
    thick?: boolean;
    thin?: boolean;
    'very thick'?: boolean;
    'ultra thick'?: boolean;
    dashed?: boolean;
    dotted?: boolean;
    
    // Arrows
    arrows?: string;
    '->'?: boolean;
    '<-'?: boolean;
    '<->'?: boolean;
    
    // Shapes
    circle?: boolean;
    rectangle?: boolean;
    
    // Positioning
    anchor?: string;
    above?: boolean | string;
    below?: boolean | string;
    left?: boolean | string;
    right?: boolean | string;
    
    // Effects
    opacity?: number;
    rotate?: number;
    scale?: number;
    
    // Text
    align?: string;
    'text width'?: string;
    
    // Paths
    'bend left'?: boolean | number;
    'bend right'?: boolean | number;
    'out'?: number;
    'in'?: number;
    'looseness'?: number;
    
    // Raw unparsed options
    raw?: string[];
}

export type TikZNode = 
    | DrawCommand
    | NodeCommand
    | PathCommand
    | CoordinateCommand
    | ScopeCommand;

export interface DrawCommand {
    type: 'draw';
    options: TikZOptions;
    path: PathSegment[];
    raw?: string;
}

export interface NodeCommand {
    type: 'node';
    name?: string;
    at?: Point;
    options: TikZOptions;
    content: string;
    raw?: string;
}

export interface PathCommand {
    type: 'path';
    options: TikZOptions;
    segments: PathSegment[];
    raw?: string;
}

export interface CoordinateCommand {
    type: 'coordinate';
    name: string;
    at: Point;
    raw?: string;
}

export interface ScopeCommand {
    type: 'scope';
    options: TikZOptions;
    children: TikZNode[];
    raw?: string;
}

export type PathSegment = 
    | LineSegment
    | CurveSegment
    | ArcSegment
    | CircleSegment
    | RectangleSegment
    | NodeSegment;

export interface LineSegment {
    type: 'line';
    to: Point;
}

export interface CurveSegment {
    type: 'curve';
    controls: [Point, Point?];
    to: Point;
}

export interface ArcSegment {
    type: 'arc';
    startAngle: number;
    endAngle: number;
    radius: number | Point;
}

export interface CircleSegment {
    type: 'circle';
    center?: Point;
    radius: number;
}

export interface RectangleSegment {
    type: 'rectangle';
    corner1: Point;
    corner2: Point;
}

export interface NodeSegment {
    type: 'node';
    at?: Point;
    content: string;
    options?: TikZOptions;
}

// ============================================================================
// Coordinate Transformation
// ============================================================================

export class CoordinateMapper {
    private scale: number = 50; // 1cm = 50px (default)
    private offset: Point = { x: 250, y: 250 }; // Center canvas
    
    constructor(scale: number = 50, offset: Point = { x: 250, y: 250 }) {
        this.scale = scale;
        this.offset = offset;
    }
    
    /**
     * Convert TikZ coordinates (cm) to canvas pixels
     * Note: Y-axis is flipped (TikZ: up is positive, Canvas: down is positive)
     */
    tikzToCanvas(tikzPoint: Point): Point {
        return {
            x: tikzPoint.x * this.scale + this.offset.x,
            y: -tikzPoint.y * this.scale + this.offset.y
        };
    }
    
    /**
     * Convert canvas pixels to TikZ coordinates (cm)
     */
    canvasToTikZ(canvasPoint: Point): Point {
        return {
            x: (canvasPoint.x - this.offset.x) / this.scale,
            y: -(canvasPoint.y - this.offset.y) / this.scale
        };
    }
    
    /**
     * Format point as TikZ coordinate string
     */
    formatTikZPoint(point: Point, precision: number = 2): string {
        return `(${point.x.toFixed(precision)},${point.y.toFixed(precision)})`;
    }
    
    setScale(scale: number): void {
        this.scale = scale;
    }
    
    setOffset(offset: Point): void {
        this.offset = offset;
    }
    
    getScale(): number {
        return this.scale;
    }
    
    getOffset(): Point {
        return this.offset;
    }
}

// ============================================================================
// TikZ Parser
// ============================================================================

export class TikZParser {
    private coordinateMapper: CoordinateMapper;
    
    constructor(coordinateMapper?: CoordinateMapper) {
        this.coordinateMapper = coordinateMapper || new CoordinateMapper();
    }
    
    /**
     * Parse TikZ picture code into AST
     */
    parse(tikzCode: string): TikZNode[] {
        const nodes: TikZNode[] = [];
        
        // Extract content between \begin{tikzpicture} and \end{tikzpicture}
        const pictureMatch = tikzCode.match(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/);
        if (!pictureMatch) {
            return nodes;
        }
        
        const content = pictureMatch[1];
        
        // Split by semicolons but preserve them for raw text
        const commands = this.splitCommands(content);
        
        for (const cmd of commands) {
            const trimmed = cmd.trim();
            if (!trimmed) {continue;}
            
            try {
                const node = this.parseCommand(trimmed);
                if (node) {
                    nodes.push(node);
                }
            } catch (error) {
                console.error('Failed to parse TikZ command:', trimmed, error);
            }
        }
        
        return nodes;
    }
    
    /**
     * Split content by semicolons, preserving nested structures
     */
    private splitCommands(content: string): string[] {
        const commands: string[] = [];
        let current = '';
        let braceDepth = 0;
        let bracketDepth = 0;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '{') {braceDepth++;}
            else if (char === '}') {braceDepth--;}
            else if (char === '[') {bracketDepth++;}
            else if (char === ']') {bracketDepth--;}
            else if (char === ';' && braceDepth === 0 && bracketDepth === 0) {
                commands.push(current.trim());
                current = '';
                continue;
            }
            
            current += char;
        }
        
        if (current.trim()) {
            commands.push(current.trim());
        }
        
        return commands;
    }
    
    /**
     * Parse a single TikZ command
     */
    private parseCommand(cmd: string): TikZNode | null {
        // Node command: \node [options] (name) at (x,y) {content};
        if (cmd.startsWith('\\node')) {
            return this.parseNode(cmd);
        }
        
        // Draw command: \draw [options] (x1,y1) -- (x2,y2) ...;
        if (cmd.startsWith('\\draw')) {
            return this.parseDraw(cmd);
        }
        
        // Path command: \path [options] ...;
        if (cmd.startsWith('\\path')) {
            return this.parsePath(cmd);
        }
        
        // Coordinate: \coordinate (name) at (x,y);
        if (cmd.startsWith('\\coordinate')) {
            return this.parseCoordinate(cmd);
        }
        
        return null;
    }
    
    /**
     * Parse \node command
     */
    private parseNode(cmd: string): NodeCommand | null {
        const raw = cmd;
        
        // Extract options [...]
        const options = this.extractOptions(cmd);
        let remaining = this.removeOptions(cmd);
        
        // Extract name (optional): (name)
        let name: string | undefined;
        const nameMatch = remaining.match(/\\node\s*\(([^)]+)\)/);
        if (nameMatch) {
            name = nameMatch[1];
            remaining = remaining.replace(/\([^)]+\)/, '').trim();
        }
        
        // Extract position: at (x,y)
        let at: Point | undefined;
        const atMatch = remaining.match(/at\s*\(([^)]+)\)/);
        if (atMatch) {
            at = this.parsePoint(atMatch[1]);
        }
        
        // Extract content: {...}
        const contentMatch = remaining.match(/\{([^}]*)\}/);
        const content = contentMatch ? contentMatch[1] : '';
        
        return {
            type: 'node',
            name,
            at,
            options,
            content,
            raw
        };
    }
    
    /**
     * Parse \draw command
     */
    private parseDraw(cmd: string): DrawCommand | null {
        const raw = cmd;
        const options = this.extractOptions(cmd);
        let remaining = this.removeOptions(cmd);
        
        // Remove \draw
        remaining = remaining.replace(/\\draw\s*/, '').trim();
        
        // Parse path segments
        const path = this.parsePathSegments(remaining);
        
        return {
            type: 'draw',
            options,
            path,
            raw
        };
    }
    
    /**
     * Parse \path command
     */
    private parsePath(cmd: string): PathCommand | null {
        const raw = cmd;
        const options = this.extractOptions(cmd);
        let remaining = this.removeOptions(cmd);
        
        remaining = remaining.replace(/\\path\s*/, '').trim();
        const segments = this.parsePathSegments(remaining);
        
        return {
            type: 'path',
            options,
            segments,
            raw
        };
    }
    
    /**
     * Parse \coordinate command
     */
    private parseCoordinate(cmd: string): CoordinateCommand | null {
        const raw = cmd;
        
        // \coordinate (name) at (x,y);
        const match = cmd.match(/\\coordinate\s*\(([^)]+)\)\s*at\s*\(([^)]+)\)/);
        if (!match) {return null;}
        
        return {
            type: 'coordinate',
            name: match[1],
            at: this.parsePoint(match[2]),
            raw
        };
    }
    
    /**
     * Parse path segments (lines, curves, circles, rectangles)
     */
    private parsePathSegments(pathStr: string): PathSegment[] {
        const segments: PathSegment[] = [];
        
        // Simple line-to pattern: (x1,y1) -- (x2,y2)
        const linePattern = /\(([^)]+)\)\s*--\s*\(([^)]+)\)/g;
        let match;
        
        while ((match = linePattern.exec(pathStr)) !== null) {
            segments.push({
                type: 'line',
                to: this.parsePoint(match[2])
            });
        }
        
        // Circle pattern: (x,y) circle (r)
        const circlePattern = /\(([^)]+)\)\s*circle\s*\(([^)]+)\)/g;
        while ((match = circlePattern.exec(pathStr)) !== null) {
            segments.push({
                type: 'circle',
                center: this.parsePoint(match[1]),
                radius: parseFloat(match[2]) || 1
            });
        }
        
        // Rectangle pattern: (x1,y1) rectangle (x2,y2)
        const rectPattern = /\(([^)]+)\)\s*rectangle\s*\(([^)]+)\)/g;
        while ((match = rectPattern.exec(pathStr)) !== null) {
            segments.push({
                type: 'rectangle',
                corner1: this.parsePoint(match[1]),
                corner2: this.parsePoint(match[2])
            });
        }
        
        return segments;
    }
    
    /**
     * Extract options from [...] brackets
     */
    private extractOptions(cmd: string): TikZOptions {
        const options: TikZOptions = { raw: [] };
        const optionMatch = cmd.match(/\[([^\]]*)\]/);
        
        if (!optionMatch) {return options;}
        
        const optionStr = optionMatch[1];
        const parts = optionStr.split(',').map(s => s.trim());
        
        for (const part of parts) {
            if (!part) {continue;}
            
            // Key=value options
            if (part.includes('=')) {
                const [key, value] = part.split('=').map(s => s.trim());
                (options as any)[key] = value;
            }
            // Boolean flags
            else {
                (options as any)[part] = true;
            }
            
            options.raw!.push(part);
        }
        
        return options;
    }
    
    /**
     * Remove options [...] from command
     */
    private removeOptions(cmd: string): string {
        return cmd.replace(/\[[^\]]*\]/, '').trim();
    }
    
    /**
     * Parse coordinate string like "1,2" or "1cm,2cm"
     */
    private parsePoint(coordStr: string): Point {
        const parts = coordStr.split(',').map(s => s.trim());
        return {
            x: parseFloat(parts[0]) || 0,
            y: parseFloat(parts[1]) || 0
        };
    }
    
    /**
     * Get coordinate mapper
     */
    getCoordinateMapper(): CoordinateMapper {
        return this.coordinateMapper;
    }
}

// ============================================================================
// Code Generator
// ============================================================================

export class TikZGenerator {
    private coordinateMapper: CoordinateMapper;
    
    constructor(coordinateMapper?: CoordinateMapper) {
        this.coordinateMapper = coordinateMapper || new CoordinateMapper();
    }
    
    /**
     * Generate TikZ code from AST
     */
    generate(nodes: TikZNode[], pictureOptions?: string): string {
        let code = '\\begin{tikzpicture}';
        if (pictureOptions) {
            code += `[${pictureOptions}]`;
        }
        code += '\n';
        
        for (const node of nodes) {
            code += '  ' + this.generateNode(node) + '\n';
        }
        
        code += '\\end{tikzpicture}';
        return code;
    }
    
    /**
     * Generate code for a single node
     */
    private generateNode(node: TikZNode): string {
        switch (node.type) {
            case 'draw':
                return this.generateDraw(node);
            case 'node':
                return this.generateNodeCommand(node);
            case 'path':
                return this.generatePath(node);
            case 'coordinate':
                return this.generateCoordinate(node);
            default:
                return node.raw || '';
        }
    }
    
    /**
     * Generate \draw command
     */
    private generateDraw(node: DrawCommand): string {
        let code = '\\draw';
        
        const opts = this.formatOptions(node.options);
        if (opts) {
            code += ` [${opts}]`;
        }
        
        code += ' ';
        code += this.formatPath(node.path);
        code += ';';
        
        return code;
    }
    
    /**
     * Generate \node command
     */
    private generateNodeCommand(node: NodeCommand): string {
        let code = '\\node';
        
        const opts = this.formatOptions(node.options);
        if (opts) {
            code += ` [${opts}]`;
        }
        
        if (node.name) {
            code += ` (${node.name})`;
        }
        
        if (node.at) {
            code += ` at ${this.coordinateMapper.formatTikZPoint(node.at)}`;
        }
        
        code += ` {${node.content}}`;
        code += ';';
        
        return code;
    }
    
    /**
     * Generate \path command
     */
    private generatePath(node: PathCommand): string {
        let code = '\\path';
        
        const opts = this.formatOptions(node.options);
        if (opts) {
            code += ` [${opts}]`;
        }
        
        code += ' ';
        code += this.formatPath(node.segments);
        code += ';';
        
        return code;
    }
    
    /**
     * Generate \coordinate command
     */
    private generateCoordinate(node: CoordinateCommand): string {
        return `\\coordinate (${node.name}) at ${this.coordinateMapper.formatTikZPoint(node.at)};`;
    }
    
    /**
     * Format path segments
     */
    private formatPath(segments: PathSegment[]): string {
        const parts: string[] = [];
        
        for (const segment of segments) {
            switch (segment.type) {
                case 'line':
                    parts.push(`-- ${this.coordinateMapper.formatTikZPoint(segment.to)}`);
                    break;
                case 'circle':
                    if (segment.center) {
                        parts.push(`${this.coordinateMapper.formatTikZPoint(segment.center)} circle (${segment.radius})`);
                    }
                    break;
                case 'rectangle':
                    parts.push(`${this.coordinateMapper.formatTikZPoint(segment.corner1)} rectangle ${this.coordinateMapper.formatTikZPoint(segment.corner2)}`);
                    break;
            }
        }
        
        return parts.join(' ');
    }
    
    /**
     * Format options object to string
     */
    private formatOptions(options: TikZOptions): string {
        const parts: string[] = [];
        
        // Use raw options if available
        if (options.raw && options.raw.length > 0) {
            return options.raw.join(', ');
        }
        
        // Otherwise reconstruct from parsed options
        for (const [key, value] of Object.entries(options)) {
            if (key === 'raw') {continue;}
            
            if (typeof value === 'boolean' && value) {
                parts.push(key);
            } else if (typeof value === 'string') {
                parts.push(`${key}=${value}`);
            } else if (typeof value === 'number') {
                parts.push(`${key}=${value}`);
            }
        }
        
        return parts.join(', ');
    }
}
