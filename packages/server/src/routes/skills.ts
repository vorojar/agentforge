import { resolve, join, relative } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import { loadSkillsFromDirectory } from "@agentforge/skills";
import type { AppContext } from "../bootstrap.js";
import { resolveWorkspaceId } from "../workspace.js";

export async function skillRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { db, skillRegistry } = opts.ctx;
  const skillsDir = resolve(process.cwd(), "skills");

  async function listSkillsWithCategories(workspaceId: string) {
    const categories = await db.listSkillCategories(workspaceId);
    return skillRegistry.list().map((skill) => ({
      ...skill,
      category: categories[skill.name] ?? "",
    }));
  }

  async function getSkillWithCategory(name: string, workspaceId: string) {
    const skill = skillRegistry.get(name);
    if (!skill) return null;
    const categories = await db.listSkillCategories(workspaceId);
    return { ...skill, category: categories[skill.name] ?? "" };
  }

  // List skills (read-only, loaded from filesystem)
  fastify.get("/api/skills", async (request) => {
    return listSkillsWithCategories(await resolveWorkspaceId(request, db));
  });

  fastify.put("/api/skills/:name/category", async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!skillRegistry.get(name)) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    const { category } = (request.body ?? {}) as { category?: string };
    const workspaceId = await resolveWorkspaceId(request, db);
    await db.setSkillCategory(name, category ?? "", workspaceId);
    return await getSkillWithCategory(name, workspaceId);
  });

  // Get single skill by name
  fastify.get("/api/skills/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const skill = await getSkillWithCategory(name, await resolveWorkspaceId(request, db));
    if (!skill) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return skill;
  });

  // POST /api/skills/import — Upload a zip file containing a skill directory
  // The zip should contain: skill-name/SKILL.md (and optionally template.md, examples/, etc.)
  fastify.post("/api/skills/import", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const buffer = await data.toBuffer();
    const zip = new AdmZip(buffer);

    // Validate: find skill directories with SKILL.md before extracting
    const entries = zip.getEntries();
    const skillNames = new Set<string>();
    for (const entry of entries) {
      const parts = entry.entryName.split("/");
      if (parts.length >= 2 && parts[1] === "SKILL.md") {
        skillNames.add(parts[0]);
      }
    }

    if (skillNames.size === 0) {
      return reply.code(400).send({
        error: "No valid skill found in zip (must contain <name>/SKILL.md)",
      });
    }

    // Extract to skills directory
    zip.extractAllTo(skillsDir, true);

    // Reload skill registry
    skillRegistry.clear();
    const skills = loadSkillsFromDirectory(skillsDir);
    for (const skill of skills) {
      skillRegistry.register(skill);
    }

    return reply.code(200).send({
      imported: [...skillNames],
      totalSkills: skills.length,
    });
  });

  // POST /api/skills/reload — Reload all skills from filesystem
  fastify.post("/api/skills/reload", async (_request, reply) => {
    skillRegistry.clear();
    const skills = loadSkillsFromDirectory(skillsDir);
    for (const skill of skills) {
      skillRegistry.register(skill);
    }
    return reply.code(200).send({ reloaded: skills.length });
  });

  // --- File editor endpoints ---

  /** Validate that a resolved path is inside the expected base directory */
  function assertInsideDir(filePath: string, baseDir: string): void {
    const rel = relative(baseDir, filePath);
    if (rel.startsWith("..") || rel.includes("..")) {
      throw new Error("Path traversal not allowed");
    }
  }

  /** Recursively list files in a directory, skipping hidden entries */
  function listFilesRecursive(
    dir: string,
    base: string,
  ): { path: string; type: "file" | "directory" }[] {
    const results: { path: string; type: "file" | "directory" }[] = [];
    if (!existsSync(dir)) return results;
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const rel = relative(base, full).replace(/\\/g, "/");
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push({ path: rel, type: "directory" });
        results.push(...listFilesRecursive(full, base));
      } else {
        results.push({ path: rel, type: "file" });
      }
    }
    return results;
  }

  // POST /api/skills — Create a new skill
  fastify.post("/api/skills", async (request, reply) => {
    const { name, description } = request.body as {
      name: string;
      description: string;
    };
    if (!name || !description) {
      return reply.code(400).send({ error: "name and description are required" });
    }
    const skillDir = join(skillsDir, name);
    if (existsSync(skillDir)) {
      return reply.code(409).send({ error: "Skill already exists" });
    }
    mkdirSync(skillDir, { recursive: true });
    const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nSkill instructions here.\n`;
    writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
    mkdirSync(join(skillDir, "examples"), { recursive: true });
    mkdirSync(join(skillDir, "references"), { recursive: true });

    // Reload so the registry picks it up
    skillRegistry.clear();
    const skills = loadSkillsFromDirectory(skillsDir);
    for (const skill of skills) {
      skillRegistry.register(skill);
    }

    const created = skillRegistry.get(name);
    return reply.code(201).send(created ?? { name, description });
  });

  // DELETE /api/skills/:name — Delete entire skill
  fastify.delete("/api/skills/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const skillDir = join(skillsDir, name);
    assertInsideDir(skillDir, skillsDir);
    if (!existsSync(skillDir)) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    rmSync(skillDir, { recursive: true, force: true });
    // Reload registry
    skillRegistry.clear();
    for (const skill of loadSkillsFromDirectory(skillsDir)) { skillRegistry.register(skill); }
    return { success: true };
  });

  // GET /api/skills/:name/files — List all files in a skill directory
  fastify.get("/api/skills/:name/files", async (request, reply) => {
    const { name } = request.params as { name: string };
    const skillDir = join(skillsDir, name);
    assertInsideDir(skillDir, skillsDir);
    if (!existsSync(skillDir)) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return listFilesRecursive(skillDir, skillDir);
  });

  // GET /api/skills/:name/files/* — Read a specific file
  fastify.get("/api/skills/:name/files/*", async (request, reply) => {
    const { name, "*": filePath } = request.params as {
      name: string;
      "*": string;
    };
    const fullPath = join(skillsDir, name, filePath);
    assertInsideDir(fullPath, join(skillsDir, name));
    if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) {
      return reply.code(404).send({ error: "File not found" });
    }
    return { path: filePath, content: readFileSync(fullPath, "utf-8") };
  });

  // PUT /api/skills/:name/files/* — Save file content
  fastify.put("/api/skills/:name/files/*", async (request, reply) => {
    const { name, "*": filePath } = request.params as {
      name: string;
      "*": string;
    };
    if (!filePath.endsWith(".md")) {
      return reply.code(400).send({ error: "Only .md files can be created or edited" });
    }
    const { content } = request.body as { content: string };
    const fullPath = join(skillsDir, name, filePath);
    assertInsideDir(fullPath, join(skillsDir, name));
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");

    // Reload skills if SKILL.md was changed
    if (filePath === "SKILL.md") {
      const skills = loadSkillsFromDirectory(skillsDir);
      for (const skill of skills) {
        skillRegistry.register(skill);
      }
    }

    return { path: filePath, content };
  });

  // DELETE /api/skills/:name/files/* — Delete a file
  fastify.delete("/api/skills/:name/files/*", async (request, reply) => {
    const { name, "*": filePath } = request.params as {
      name: string;
      "*": string;
    };
    if (!filePath.endsWith(".md")) {
      return reply.code(400).send({ error: "Only .md files can be deleted" });
    }
    const fullPath = join(skillsDir, name, filePath);
    assertInsideDir(fullPath, join(skillsDir, name));
    if (!existsSync(fullPath)) {
      return reply.code(404).send({ error: "File not found" });
    }
    unlinkSync(fullPath);
    return { success: true };
  });

  // PATCH /api/skills/:name/files/rename — Rename a file or folder within a skill
  fastify.patch("/api/skills/:name/files/rename", async (request, reply) => {
    const { name } = request.params as { name: string };
    const { oldPath, newPath } = request.body as { oldPath: string; newPath: string };
    if (!oldPath || !newPath) {
      return reply.code(400).send({ error: "oldPath and newPath are required" });
    }
    if (oldPath === "SKILL.md") {
      return reply.code(400).send({ error: "SKILL.md cannot be renamed" });
    }

    const skillDir = join(skillsDir, name);
    const fullOld = join(skillDir, oldPath);
    const fullNew = join(skillDir, newPath);
    assertInsideDir(fullOld, skillDir);
    assertInsideDir(fullNew, skillDir);

    if (!existsSync(fullOld)) {
      return reply.code(404).send({ error: "Source path not found" });
    }
    if (existsSync(fullNew)) {
      return reply.code(409).send({ error: "Target path already exists" });
    }

    mkdirSync(join(fullNew, ".."), { recursive: true });
    const { renameSync } = await import("node:fs");
    renameSync(fullOld, fullNew);

    // Reload skills if directory structure changed
    skillRegistry.clear();
    for (const skill of loadSkillsFromDirectory(skillsDir)) { skillRegistry.register(skill); }

    return { success: true, oldPath, newPath };
  });

  // PATCH /api/skills/:name/rename — Rename the skill itself (directory name)
  fastify.patch("/api/skills/:name/rename", async (request, reply) => {
    const { name } = request.params as { name: string };
    const { newName } = request.body as { newName: string };
    if (!newName?.trim()) {
      return reply.code(400).send({ error: "newName is required" });
    }
    const oldDir = join(skillsDir, name);
    const newDir = join(skillsDir, newName.trim());
    assertInsideDir(oldDir, skillsDir);
    assertInsideDir(newDir, skillsDir);

    if (!existsSync(oldDir)) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    if (existsSync(newDir)) {
      return reply.code(409).send({ error: "Skill with new name already exists" });
    }

    const { renameSync } = await import("node:fs");
    renameSync(oldDir, newDir);

    // Update SKILL.md frontmatter name if present
    const skillMdPath = join(newDir, "SKILL.md");
    if (existsSync(skillMdPath)) {
      let md = readFileSync(skillMdPath, "utf-8");
      md = md.replace(/^(---\s*\n(?:.*\n)*?name:\s*).*$/m, `$1${newName.trim()}`);
      writeFileSync(skillMdPath, md, "utf-8");
    }

    skillRegistry.clear();
    for (const skill of loadSkillsFromDirectory(skillsDir)) { skillRegistry.register(skill); }

    return { success: true, oldName: name, newName: newName.trim() };
  });
}
