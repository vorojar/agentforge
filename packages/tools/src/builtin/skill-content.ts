/**
 * get_skill_content 工具 — 按需加载 Skill 文件内容
 *
 * 功能说明：允许 AI 按需获取 Skill 目录下的指定文件内容，
 *          避免将全部 Skill 内容一次性注入 System Prompt。
 * 创建时间：2026-03-30
 * 负责人：王觉贤
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Tool, Skill, SkillRegistry } from "@agentforge/types";

/** Parse SKILL.md frontmatter and return the body content only */
function extractSkillBody(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  const endIdx = lines.indexOf("---", 1);
  if (endIdx === -1) return raw;
  return lines.slice(endIdx + 1).join("\n").trim();
}

/** Load full skill content: SKILL.md body + template.md + examples/* + references/* */
function loadAllContent(skill: Skill): string {
  if (!skill.dirPath) return "";

  const skillMdPath = join(skill.dirPath, "SKILL.md");
  if (!existsSync(skillMdPath)) return "";

  let content = extractSkillBody(readFileSync(skillMdPath, "utf-8"));

  const templatePath = join(skill.dirPath, "template.md");
  if (existsSync(templatePath)) {
    content += `\n\n---\n## Template\n\n${readFileSync(templatePath, "utf-8")}`;
  }

  const examplesDir = join(skill.dirPath, "examples");
  if (existsSync(examplesDir) && statSync(examplesDir).isDirectory()) {
    for (const f of readdirSync(examplesDir).filter((f: string) => f.endsWith(".md"))) {
      content += `\n\n---\n## Example: ${f.replace(/\.md$/, "")}\n\n${readFileSync(join(examplesDir, f), "utf-8")}`;
    }
  }

  const refsDir = join(skill.dirPath, "references");
  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    for (const f of readdirSync(refsDir).filter((f: string) => f.endsWith(".md"))) {
      content += `\n\n---\n## Reference: ${f.replace(/\.md$/, "")}\n\n${readFileSync(join(refsDir, f), "utf-8")}`;
    }
  }

  return content;
}

/** Load a single file from the skill directory */
function loadSingleFile(skill: Skill, file: string): string {
  if (!skill.dirPath) return "Skill has no directory path.";

  if (file === "SKILL.md") {
    const mdPath = join(skill.dirPath, "SKILL.md");
    if (!existsSync(mdPath)) return "SKILL.md not found.";
    return extractSkillBody(readFileSync(mdPath, "utf-8"));
  }

  const filePath = join(skill.dirPath, file);
  if (!existsSync(filePath)) return `File not found: ${file}`;
  return readFileSync(filePath, "utf-8");
}

export function createSkillContentTool(skillRegistry: SkillRegistry): Tool {
  return {
    name: "get_skill_content",
    description:
      "Load detailed content from a skill. Returns the full text of the requested file — skill instructions, examples, or references. Use 'all' as file to load everything at once.",
    parameters: {
      type: "object",
      properties: {
        skillName: {
          type: "string",
          description: "Skill name or ID (as shown in the Available Skills section)",
        },
        file: {
          type: "string",
          description:
            "File to load: 'SKILL.md' for main instructions, 'template.md' for output template, or a path like 'examples/foo.md' or 'references/bar.md'. Use 'all' to load everything. Defaults to 'SKILL.md' if omitted.",
        },
      },
      required: ["skillName"],
    },
    async execute(input) {
      const skillName = (input.skillName as string) || "";
      const file = (input.file as string) || undefined;

      if (!skillName.trim()) {
        return { content: "Please provide a skill name.", isError: true };
      }

      let skill = skillRegistry.get(skillName);
      if (!skill) {
        const allSkills = skillRegistry.list();
        skill = allSkills.find((s) => s.id === skillName);
      }

      if (!skill) {
        const available = skillRegistry.list().map((s) => `${s.name} (${s.id})`).join(", ");
        return {
          content: `Skill "${skillName}" not found. Available skills: ${available || "none"}`,
          isError: true,
        };
      }

      const target = file || "SKILL.md";
      const content = target === "all"
        ? loadAllContent(skill)
        : loadSingleFile(skill, target);

      return { content };
    },
  };
}
