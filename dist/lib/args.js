"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.getFlag = getFlag;
function parseArgs(argv) {
    const [command, ...rest] = argv;
    const positionals = [];
    const flags = new Map();
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith("--")) {
            positionals.push(token);
            continue;
        }
        const [rawKey, inlineValue] = token.slice(2).split("=", 2);
        if (inlineValue !== undefined) {
            flags.set(rawKey, inlineValue);
            continue;
        }
        const next = rest[index + 1];
        if (next && !next.startsWith("--")) {
            flags.set(rawKey, next);
            index += 1;
        }
        else {
            flags.set(rawKey, true);
        }
    }
    return { command, positionals, flags };
}
function getFlag(parsed, name) {
    return parsed.flags.get(name);
}
