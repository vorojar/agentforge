import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import { loadSkillsFromDirectory } from "@agentforge/skills";
import type { AppContext } from "../bootstrap.js";

export async function skillRoutes(fastify: FastifyInstance, opts: { ctx: AppContext }) {
  const { skillRegistry } = opts.ctx;
  const skillsDir = resolve(process.cwd(), "skills");

  // List skills (read-only, loaded from filesystem)
  fastify.get("/api/skills", async () => {
    return skillRegistry.list();
  });

  // Get single skill by name
  fastify.get("/api/skills/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const skill = skillRegistry.get(name);
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
    const skills = loadSkillsFromDirectory(skillsDir);
    for (const skill of skills) {
      skillRegistry.register(skill);
    }
    return reply.code(200).send({ reloaded: skills.length });
  });
}
