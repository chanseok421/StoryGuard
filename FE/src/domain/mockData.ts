import type { AnalysisResult, Project, Story, User, WorldGraph } from "./types";

const now = "2026-06-20T06:40:00.000Z";

export const mockUser: User = {
  id: "user-001",
  email: "writer@storyguard.local",
  name: "스토리 작가",
  createdAt: now,
};

export const mockProjects: Project[] = [
  {
    id: "project-gisadan",
    title: "황혼의 기사단",
    genre: "판타지",
    description: "금지된 기술과 빛의 마력을 둘러싼 장편 판타지.",
    createdAt: now,
    updatedAt: now,
  },
];

export const mockStories: Story[] = [
  {
    id: "story-23",
    projectId: "project-gisadan",
    title: "23화_돌아온 기사",
    documentType: "manuscript",
    sourceType: "manual",
    createdAt: now,
    updatedAt: now,
    content: `차가운 바람이 성벽 위로 불어왔다.

에렌은 망토를 여미며 성문을 바라보았다. 멀리서 말발굽 소리가 들려왔다.

"드디어 돌아왔군."

그의 곁에 선 세린이 작게 미소 지었다.

"이번에는 다를 거야. 약속했잖아."

에렌은 고개를 끄덕였다.

성문이 열리고, 오래 잊었던 깃발이 바람에 펄럭였다.

---

성 내부 회의실

"교단은 아직 우리를 신뢰하지 않습니다."

수석 사제 라미엘이 조용히 말했다.

"하지만 증거는 충분합니다. 금지된 기술의 사용 흔적이 명확해요."

세린이 테이블 위의 보고서를 가리켰다.

에렌은 한숨을 내쉬었다.

"우리가 증명해야 해. 우리가 아니라면, 또 누가 이 세계를 지키겠어."`,
  },
  {
    id: "story-22",
    projectId: "project-gisadan",
    title: "22화_새벽의 의식",
    documentType: "manuscript",
    sourceType: "manual",
    createdAt: now,
    updatedAt: now,
    content:
      "세린은 아직 새벽을 보지 못했다. 성문은 닫혀 있었고, 금지된 기술은 세 명의 의식 없이는 발동할 수 없었다.",
  },
  {
    id: "story-12",
    projectId: "project-gisadan",
    title: "12화_별의 제단",
    documentType: "manuscript",
    sourceType: "manual",
    createdAt: now,
    updatedAt: now,
    content:
      "세린은 태생적으로 빛의 마력을 사용하는 수호자였다. 어둠 계열의 마력은 그의 몸에 닿는 것만으로도 상처를 남겼다.",
  },
];

export const mockWorldGraph: WorldGraph = {
  nodes: [
    {
      id: "node-serin",
      label: "세린",
      type: "character",
      importance: 9,
      hasIssue: true,
    },
    {
      id: "node-eren",
      label: "에렌",
      type: "character",
      importance: 8,
      hasIssue: true,
    },
    {
      id: "node-forbidden-ritual",
      label: "금지된 기술",
      type: "rule",
      importance: 8,
      hasIssue: true,
    },
    {
      id: "node-castle-gate",
      label: "성문",
      type: "place",
      importance: 6,
      hasIssue: false,
    },
    {
      id: "node-dawn-ceremony",
      label: "새벽의 의식",
      type: "event",
      importance: 7,
      hasIssue: false,
    },
    {
      id: "node-star-altar",
      label: "별의 제단",
      type: "foreshadow",
      importance: 5,
      hasIssue: false,
    },
  ],
  edges: [
    {
      source: "node-serin",
      target: "node-forbidden-ritual",
      label: "세린의 맹세",
      type: "relationship",
    },
    {
      source: "node-eren",
      target: "node-dawn-ceremony",
      label: "새벽 보유 시점",
      type: "causes",
    },
    {
      source: "node-forbidden-ritual",
      target: "node-dawn-ceremony",
      label: "발동 조건",
      type: "violates",
    },
    {
      source: "node-castle-gate",
      target: "node-dawn-ceremony",
      label: "의식 장소",
      type: "located_at",
    },
    {
      source: "node-star-altar",
      target: "node-serin",
      label: "빛의 복선",
      type: "foreshadows",
    },
  ],
};

export const mockAnalysis: AnalysisResult = {
  id: "analysis-23",
  projectId: "project-gisadan",
  storyId: "story-23",
  provider: "mock",
  fallbackUsed: false,
  createdAt: now,
  summary: {
    issueCount: 11,
    highCount: 6,
    mediumCount: 3,
    lowCount: 2,
  },
  response: {
    summary: {
      issueCount: 11,
      highCount: 6,
      mediumCount: 3,
      lowCount: 2,
    },
    issues: [
      {
        id: "issue-serin-magic",
        type: "character_conflict",
        severity: "high",
        title: "세린의 마력 속성",
        manuscriptQuote: "세린이 강력한 빛의 마력을 방출했다.",
        conflictingSetting:
          "12화에서는 세린이 빛의 마력을 사용하는 수호자로 정리되어 있다.",
        reason:
          "현재 원고는 문제 없어 보이지만, 이후 어둠 계열 능력으로 바뀌면 인물 능력 설정이 즉시 충돌한다.",
        suggestion:
          "세린의 능력은 빛 계열로 유지하고, 다른 속성이 필요하면 예외 조건을 먼저 추가한다.",
        relatedNodeIds: ["node-serin"],
        evidenceIds: ["evidence-serin-light"],
      },
      {
        id: "issue-dawn-memory",
        type: "character_conflict",
        severity: "high",
        title: "에렌의 새벽 보유 시점",
        manuscriptQuote: "에렌은 새벽을 머리에 차고 성문으로 향했다.",
        conflictingSetting:
          "22화에서는 에렌이 아직 새벽을 받지 못했다고 되어 있다.",
        reason: "소유 시점이 앞선 원고와 맞지 않는다.",
        suggestion:
          "에렌이 새벽을 얻는 장면을 먼저 배치하거나, 표현을 다른 검으로 바꾼다.",
        relatedNodeIds: ["node-eren"],
        evidenceIds: ["evidence-dawn"],
      },
      {
        id: "issue-forbidden-ritual",
        type: "world_rule_conflict",
        severity: "medium",
        title: "금지된 기술의 사용 조건",
        manuscriptQuote: "세린은 단독으로 금지된 기술을 사용했다.",
        conflictingSetting:
          "8화에서는 금지된 기술은 세 명 이상의 의식 참여자가 필요하다고 설명했다.",
        reason: "세계관 규칙의 발동 조건이 달라졌다.",
        suggestion:
          "의식 참여자를 추가하거나, 단독 사용이 가능한 예외 조건을 설정한다.",
        relatedNodeIds: ["node-forbidden-ritual"],
        evidenceIds: ["evidence-forbidden-rule"],
      },
    ],
    nodes: [
      {
        id: "node-serin",
        label: "세린",
        type: "character",
        importance: 9,
        hasIssue: true,
      },
      {
        id: "node-forbidden-ritual",
        label: "금지된 기술",
        type: "rule",
        importance: 8,
        hasIssue: true,
      },
    ],
    edges: [],
    evidence: [
      {
        id: "evidence-serin-light",
        sourceType: "manuscript",
        quote: "세린은 태생적으로 빛의 마력을 사용하는 수호자였다.",
        chunkId: "story-12:18",
        score: 0.94,
      },
      {
        id: "evidence-dawn",
        sourceType: "manuscript",
        quote: "에렌은 아직 새벽을 받지 못했다.",
        chunkId: "story-22:2",
        score: 0.88,
      },
      {
        id: "evidence-forbidden-rule",
        sourceType: "manuscript",
        quote: "금지된 기술은 세 명의 의식 없이는 발동할 수 없었다.",
        chunkId: "story-22:6",
        score: 0.91,
      },
    ],
    providerInfo: {
      provider: "mock",
      fallbackUsed: false,
    },
  },
};
