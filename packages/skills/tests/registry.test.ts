import { describe, it, expect } from "vitest";
import { SkillRegistryImpl } from "../src/registry.js";
import type { Skill } from "@agentforge/types";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "1",
    name: "test-skill",
    description: "A test skill",
    content: "# Test",
    enabled: true,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    ...overrides,
  };
}

describe("SkillRegistryImpl", () => {
  it("registers and gets a skill by name", () => {
    const registry = new SkillRegistryImpl();
    const skill = makeSkill({ name: "greeting" });
    registry.register(skill);
    expect(registry.get("greeting")).toBe(skill);
  });

  it("lists only enabled skills", () => {
    const registry = new SkillRegistryImpl();
    registry.register(makeSkill({ name: "a", enabled: true }));
    registry.register(makeSkill({ name: "b", enabled: false }));
    registry.register(makeSkill({ name: "c", enabled: true }));

    const listed = registry.list();
    expect(listed).toHaveLength(2);
    expect(listed.map((s) => s.name)).toEqual(["a", "c"]);
  });

  it("matches a skill by keyword", () => {
    const registry = new SkillRegistryImpl();
    registry.register(
      makeSkill({ name: "customer-service", description: "客服对话技巧" })
    );

    const match = registry.match("customer");
    expect(match).not.toBeNull();
    expect(match!.skill.name).toBe("customer-service");
    expect(match!.score).toBeGreaterThan(0);
  });

  it("returns null when no skill matches", () => {
    const registry = new SkillRegistryImpl();
    registry.register(makeSkill({ name: "greeting", description: "hello" }));

    const match = registry.match("zzzzz");
    expect(match).toBeNull();
  });

  it("returns best match among multiple skills", () => {
    const registry = new SkillRegistryImpl();
    registry.register(
      makeSkill({
        id: "1",
        name: "customer-service",
        description: "customer support and help",
      })
    );
    registry.register(
      makeSkill({
        id: "2",
        name: "sales",
        description: "sales pitch techniques",
      })
    );

    const match = registry.match("customer support");
    expect(match).not.toBeNull();
    expect(match!.skill.name).toBe("customer-service");
  });
});
