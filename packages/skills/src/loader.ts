import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Skill } from "@agentforge/types";
import { parseSkillMarkdown } from "./parser.js";

/**
 * Scan a directory for skill subdirectories following Claude Code convention:
 *   skills/
 *     my-skill/
 *       SKILL.md        <- required entry point
 *       template.md     <- optional
 *       examples/       <- optional
 */
export function loadSkillsFromDirectory(dir: string): Skill[] {
  if (!existsSync(dir)) return [];

  const skills: Skill[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const skillDir = join(dir, entry);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    const raw = readFileSync(skillMdPath, "utf-8");
    const parsed = parseSkillMarkdown(raw);

    // Directory name is the skill id; frontmatter name overrides display name
    const id = basename(skillDir);
    const name = parsed.name || id;

    // Collect supporting files
    let content = parsed.body;

    const templatePath = join(skillDir, "template.md");
    if (existsSync(templatePath)) {
      const template = readFileSync(templatePath, "utf-8");
      content += `\n\n---\n## Template\n\n${template}`;
    }

    const examplesDir = join(skillDir, "examples");
    if (existsSync(examplesDir) && statSync(examplesDir).isDirectory()) {
      const exampleFiles = readdirSync(examplesDir).filter((f: string) => f.endsWith(".md"));
      for (const ef of exampleFiles) {
        const example = readFileSync(join(examplesDir, ef), "utf-8");
        content += `\n\n---\n## Example: ${ef}\n\n${example}`;
      }
    }

    skills.push({
      id,
      name,
      description: parsed.description,
      content,
      enabled: true,
      createdAt: "",
      updatedAt: "",
    });
  }

  return skills;
}
