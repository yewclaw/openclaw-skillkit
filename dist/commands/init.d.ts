import { type TemplateMode } from "../lib/templates";
export interface InitOptions {
    targetDir: string;
    name?: string;
    description?: string;
    template: TemplateMode;
    resources: string[];
    force: boolean;
}
export declare function runInit(options: InitOptions): Promise<void>;
export declare function getExampleSkillForTemplate(template: TemplateMode, resources: string[]): string;
