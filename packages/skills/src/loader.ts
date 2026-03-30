import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Skill } from "@agentforge/types";
import { parseSkillMarkdown } from "./parser.js";

/**
 * Scan a directory for skill subdirectories.
 * Only loads name + description (lightweight). Full content is loaded
 * on-demand when a skill is matched via loadSkillContent().
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

    const id = basename(skillDir);
    const name = parsed.name || id;

    skills.push({
      id,
      name,
      description: parsed.description,
      content: "", // lazy — loaded on match
      dirPath: skillDir,
      enabled: true,
      createdAt: "",
      updatedAt: "",
    });
  }

  return skills;
}

/**
 * Load full skill content from filesystem (called on-demand when skill is matched).
 * Reads SKILL.md body + template.md + examples/*.md + references/*.md
 * Always reads from disk — supports hot editing without restart.
 */
/**
 * Load skill content on demand. Only injects SKILL.md body into prompt.
 * Supporting files (template, examples, references) are listed so the LLM
 * can read them on-demand via the read_skill_file tool.
 */
export function loadSkillContent(skill: Skill): string {
  if (!skill.dirPath) return skill.content;

  const skillMdPath = join(skill.dirPath, "SKILL.md");
  if (!existsSync(skillMdPath)) return skill.content;

  // Read fresh SKILL.md
  const raw = readFileSync(skillMdPath, "utf-8");
  const parsed = parseSkillMarkdown(raw);
  let content = parsed.body;

  // Update name/description in case they changed
  if (parsed.name) skill.name = parsed.name;
  if (parsed.description) skill.description = parsed.description;

  // List available supporting files so LLM knows what it can read
  const files: string[] = [];
  const templatePath = join(skill.dirPath, "template.md");
  if (existsSync(templatePath)) files.push("template.md");

  for (const dir of ["examples", "references"]) {
    const dirPath = join(skill.dirPath, dir);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      for (const f of readdirSync(dirPath).filter((f: string) => f.endsWith(".md"))) {
        files.push(`${dir}/${f}`);
      }
    }
  }

  if (files.length > 0) {
    content += `\n\n---\n**IMPORTANT: Before responding, you MUST call the read_skill_file tool to read the following files** (skill="${skill.id}"):\n`;
    for (const f of files) content += `- ${f}\n`;
  }

  return content;
}
