"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFrontmatter = parseFrontmatter;
function parseFrontmatter(markdown) {
    const normalized = markdown.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) {
        return {
            attributes: {},
            body: normalized,
            hasFrontmatter: false
        };
    }
    const endMarker = normalized.indexOf("\n---\n", 4);
    if (endMarker === -1) {
        throw new Error("Frontmatter starts with --- but does not have a closing --- line.");
    }
    const rawFrontmatter = normalized.slice(4, endMarker);
    const body = normalized.slice(endMarker + 5);
    const attributes = {};
    for (const rawLine of rawFrontmatter.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
            throw new Error(`Invalid frontmatter line: "${rawLine}"`);
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (!key) {
            throw new Error(`Frontmatter key is missing in line: "${rawLine}"`);
        }
        attributes[key] = stripWrappingQuotes(value);
    }
    return {
        attributes,
        body,
        hasFrontmatter: true
    };
}
function stripWrappingQuotes(value) {
    if ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}
