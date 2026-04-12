import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Skill } from "@agentforge/types";
import { parseSkillMarkdown } from "./parser.js";

/** Collect available files in a skill directory (SKILL.md, template.md, examples/*, references/*) */
function collectAvailableFiles(skillDir: string): string[] {
  const files: string[] = ["SKILL.md"];

  const templatePath = join(skillDir, "template.md");
  if (existsSync(templatePath)) files.push("template.md");

  const examplesDir = join(skillDir, "examples");
  if (existsSync(examplesDir) && statSync(examplesDir).isDirectory()) {
    for (const f of readdirSync(examplesDir).filter((f: string) => f.endsWith(".md"))) {
      files.push(`examples/${f}`);
    }
  }

  const refsDir = join(skillDir, "references");
  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    for (const f of readdirSync(refsDir).filter((f: string) => f.endsWith(".md"))) {
      files.push(`references/${f}`);
    }
  }

  return files;
}

/**
 * Scan a directory for skill subdirectories.
 * Loads name, description, and available file list (lightweight).
 * Full content is loaded on-demand via loadSkillContent() or loadSkillFile().
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
      content: "",
      dirPath: skillDir,
      availableFiles: collectAvailableFiles(skillDir),
      enabled: true,
      createdAt: "",
      updatedAt: "",
    });
  }

  return skills;
}

/**
 * Load a single file from a skill directory.
 * @param skill - The skill to load from
 * @param file - Relative path within the skill dir (e.g. "SKILL.md", "examples/foo.md"), or "all" for everything
 * @returns The file content, or an error message if not found
 */
export function loadSkillFile(skill: Skill, file?: string): string {
  if (!skill.dirPath) return "Skill has no directory path.";

  const target = file || "SKILL.md";

  if (target === "all") {
    return loadSkillContent(skill);
  }

  if (target === "SKILL.md") {
    const mdPath = join(skill.dirPath, "SKILL.md");
    if (!existsSync(mdPath)) return "SKILL.md not found.";
    const raw = readFileSync(mdPath, "utf-8");
    const parsed = parseSkillMarkdown(raw);
    return parsed.body;
  }

  const filePath = join(skill.dirPath, target);
  if (!existsSync(filePath)) return `File not found: ${target}`;
  return readFileSync(filePath, "utf-8");
}

/**
 * Load full skill content from filesystem (called on-demand).
 * Reads SKILL.md body + template.md + examples/*.md + references/*.md
 * Always reads from disk — supports hot editing without restart.
 */
export function loadSkillContent(skill: Skill): string {
  if (!skill.dirPath) return skill.content;

  const skillMdPath = join(skill.dirPath, "SKILL.md");
  if (!existsSync(skillMdPath)) return skill.content;

  // Read fresh SKILL.md
  const raw = readFileSync(skillMdPath, "utf-8");
  const parsed = parseSkillMarkdown(raw);
  let content = parsed.body;

  // Also update name/description in case they changed
  if (parsed.name) skill.name = parsed.name;
  if (parsed.description) skill.description = parsed.description;

  // template.md
  const templatePath = join(skill.dirPath, "template.md");
  if (existsSync(templatePath)) {
    content += `\n\n---\n## Template\n\n${readFileSync(templatePath, "utf-8")}`;
  }

  // examples/*.md
  const examplesDir = join(skill.dirPath, "examples");
  if (existsSync(examplesDir) && statSync(examplesDir).isDirectory()) {
    for (const ef of readdirSync(examplesDir).filter((f: string) => f.endsWith(".md"))) {
      content += `\n\n---\n## Example: ${ef.replace(/\.md$/, "")}\n\n${readFileSync(join(examplesDir, ef), "utf-8")}`;
    }
  }

  // references/*.md
  const refsDir = join(skill.dirPath, "references");
  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    for (const rf of readdirSync(refsDir).filter((f: string) => f.endsWith(".md"))) {
      content += `\n\n---\n## Reference: ${rf.replace(/\.md$/, "")}\n\n${readFileSync(join(refsDir, rf), "utf-8")}`;
    }
  }

  return content;
}
