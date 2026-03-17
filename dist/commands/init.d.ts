import { type TemplateMode } from "../lib/templates";
export interface InitOptions {
    targetDir: string;
    name?: string;
    description?: string;
    template: TemplateMode;
    resources: string[];
    force: boolean;
}
export interface InitResult {
    skillDir: string;
    skillFile: string;
    template: TemplateMode;
    resources: string[];
    inferredName: string;
    exampleSkill: string;
}
export declare function runInit(options: InitOptions): Promise<InitResult>;
export declare function getExampleSkillForTemplate(template: TemplateMode, resources: string[]): string;
