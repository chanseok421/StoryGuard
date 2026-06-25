import type {
  SettingChunk,
  SettingsFixture,
  StorySetting,
} from "./types.js";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEntities(entities: string[]): string[] {
  return [...new Set(entities.map(normalizeText).filter(Boolean))];
}

function validateSetting(setting: StorySetting): void {
  if (!normalizeText(setting.id)) {
    throw new Error("Setting id is required.");
  }

  if (!normalizeText(setting.category)) {
    throw new Error(`Setting ${setting.id} category is required.`);
  }

  if (!normalizeText(setting.title)) {
    throw new Error(`Setting ${setting.id} title is required.`);
  }

  if (!normalizeText(setting.content)) {
    throw new Error(`Setting ${setting.id} content is required.`);
  }

  if (!Array.isArray(setting.entities)) {
    throw new Error(`Setting ${setting.id} entities must be an array.`);
  }
}

function createPageContent(
  setting: StorySetting,
  entities: string[],
  aliases: string[],
): string {
  const lines = [
    `제목: ${normalizeText(setting.title)}`,
    `분류: ${normalizeText(setting.category)}`,
  ];

  if (entities.length > 0) {
    lines.push(`관련 개체: ${entities.join(", ")}`);
  }

  if (aliases.length > 0) {
    lines.push(`관련 표현: ${aliases.join(", ")}`);
  }

  lines.push(`설정: ${normalizeText(setting.content)}`);
  return lines.join("\n");
}

export function chunkSettings(fixture: SettingsFixture): SettingChunk[] {
  const projectId = normalizeText(fixture.projectId);

  if (!projectId) {
    throw new Error("Project id is required.");
  }

  if (!Array.isArray(fixture.settings)) {
    throw new Error("Settings must be an array.");
  }

  const seenSettingIds = new Set<string>();

  return fixture.settings.map((setting, settingOrder) => {
    validateSetting(setting);

    const settingId = normalizeText(setting.id);
    if (seenSettingIds.has(settingId)) {
      throw new Error(`Duplicate setting id: ${settingId}`);
    }
    seenSettingIds.add(settingId);

    const category = normalizeText(setting.category);
    const title = normalizeText(setting.title);
    const content = normalizeText(setting.content);
    const entities = normalizeEntities(setting.entities);
    const aliases = normalizeEntities(setting.aliases ?? []);

    return {
      id: `${projectId}:${settingId}:0`,
      pageContent: createPageContent(setting, entities, aliases),
      metadata: {
        schemaVersion: 1,
        sourceType: "setting",
        projectId,
        settingId,
        category,
        title,
        content,
        entities,
        language: "ko",
        chunkIndex: 0,
        settingOrder,
      },
    };
  });
}
