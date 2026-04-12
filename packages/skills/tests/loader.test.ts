import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkillsFromDirectory, loadSkillContent } from "../src/loader.js";

describe("loadSkillsFromDirectory", () => {
  const testDir = join(tmpdir(), "agentforge-skill-test-" + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loads a skill from SKILL.md in a subdirectory", () => {
    const skillDir = join(testDir, "greeting");
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: greeting
description: A greeting skill
---

# Hello World
Say hello to the user.`
    );

    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("greeting");
    expect(skills[0].name).toBe("greeting");
    expect(skills[0].description).toBe("A greeting skill");
    expect(skills[0].dirPath).toBe(skillDir);
    // Content is lazy — empty on load
    expect(skills[0].content).toBe("");
    // loadSkillContent reads from disk
    const content = loadSkillContent(skills[0]);
    expect(content).toContain("Say hello to the user.");
    expect(skills[0].enabled).toBe(true);
  });

  it("uses directory name as id, frontmatter name as display name", () => {
    const skillDir = join(testDir, "my-dir");
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: Custom Name
description: desc
---

Body`
    );

    const skills = loadSkillsFromDirectory(testDir);
    expect(skills[0].id).toBe("my-dir");
    expect(skills[0].name).toBe("Custom Name");
  });

  it("skips directories without SKILL.md", () => {
    const skillDir = join(testDir, "no-skill");
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "README.md"), "not a skill");

    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(0);
  });

  it("includes template.md content on demand", () => {
    const skillDir = join(testDir, "with-template");
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: templated
description: Has template
---

# Main instructions`
    );
    writeFileSync(join(skillDir, "template.md"), "Fill in: {{ name }}");

    const skills = loadSkillsFromDirectory(testDir);
    const content = loadSkillContent(skills[0]);
    expect(content).toContain("# Main instructions");
    expect(content).toContain("Fill in: {{ name }}");
  });

  it("includes examples/ content on demand", () => {
    const skillDir = join(testDir, "with-examples");
    mkdirSync(skillDir);
    mkdirSync(join(skillDir, "examples"));
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: exampled
description: Has examples
---

# Instructions`
    );
    writeFileSync(join(skillDir, "examples", "sample.md"), "Example output here");

    const skills = loadSkillsFromDirectory(testDir);
    const content = loadSkillContent(skills[0]);
    expect(content).toContain("Example output here");
  });

  it("includes references/ content on demand", () => {
    const skillDir = join(testDir, "with-refs");
    mkdirSync(skillDir);
    mkdirSync(join(skillDir, "references"));
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: referenced
description: Has references
---

# Instructions`
    );
    writeFileSync(join(skillDir, "references", "api-docs.md"), "API reference content");

    const skills = loadSkillsFromDirectory(testDir);
    const content = loadSkillContent(skills[0]);
    expect(content).toContain("API reference content");
    expect(content).toContain("## Reference: api-docs");
  });

  it("returns empty array for non-existent directory", () => {
    const skills = loadSkillsFromDirectory("/nonexistent/path");
    expect(skills).toHaveLength(0);
  });

  it("loads multiple skills", () => {
    for (const name of ["alpha", "beta", "gamma"]) {
      const dir = join(testDir, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}`);
    }

    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(3);
  });
});
