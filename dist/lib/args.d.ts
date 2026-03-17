export interface ParsedArgs {
    command?: string;
    positionals: string[];
    flags: Map<string, string | boolean>;
}
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function getFlag(parsed: ParsedArgs, name: string): string | boolean | undefined;
