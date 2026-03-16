import path from "node:path";
import { chmod } from "node:fs/promises";
import { ensureDir, exists, writeTextFile } from "../lib/fs";
import {
  DEFAULT_SKILL_MD,
  EXAMPLE_ASSET,
  EXAMPLE_REFERENCE,
  EXAMPLE_SCRIPT
} from "../lib/templates";

export interface InitOptions {
  targetDir: string;
  name?: string;
  description?: string;
  resources: string[];
  force: boolean;
}

export async function runInit(options: InitOptions): Promise<void> {
  const skillDir = path.resolve(options.targetDir);
  const skillFile = path.join(skillDir, "SKILL.md");

  if ((await exists(skillFile)) && !options.force) {
    throw new Error(`Refusing to overwrite existing file: ${skillFile}. Use --force to replace it.`);
  }

  await ensureDir(skillDir);

  const inferredName = options.name ?? path.basename(skillDir);
  const title = titleCase(inferredName);
  const titleLower = title.toLowerCase();
  const description = options.description ?? `Guide the model through ${title.toLowerCase()} workflows with clear steps.`;

  const markdown = DEFAULT_SKILL_MD
    .replace(/{{name}}/g, inferredName)
    .replace(/{{description}}/g, description)
    .replace(/{{title}}/g, title)
    .replace(/{{titleLower}}/g, titleLower);

  await writeTextFile(skillFile, markdown);

  for (const resource of options.resources) {
    const resourceDir = path.join(skillDir, resource);
    await ensureDir(resourceDir);

    if (resource === "references") {
      await writeTextFile(path.join(resourceDir, "README.md"), EXAMPLE_REFERENCE);
    } else if (resource === "scripts") {
      const scriptFile = path.join(resourceDir, "example.sh");
      await writeTextFile(scriptFile, EXAMPLE_SCRIPT);
      await chmod(scriptFile, 0o755);
    } else if (resource === "assets") {
      await writeTextFile(path.join(resourceDir, "README.txt"), EXAMPLE_ASSET);
    }
  }
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
