import {
  AlertTriangle,
  Edit3,
  FileText,
  Gauge,
  History,
  ListFilter,
  Loader2,
  LogOut,
  PanelRightOpen,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { StoryguardApiError, storyguardApi } from "./api/storyguardApi";
import {
  countNonWhitespaceCharacters,
  filterIssuesBySeverity,
  getPriorityIssues,
} from "./domain/analysis";
import type {
  AnalysisResult,
  AnalysisResultSummary,
  Issue,
  Project,
  ReadProjectWorldGraphResponse,
  Severity,
  SeverityFilter,
  Story,
  StoryEdge,
  StoryNode,
  User,
  WorldGraph,
} from "./domain/types";
import "./styles.css";

const severityLabels: Record<Severity, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const issueTypeLabels: Record<Issue["type"], string> = {
  character_conflict: "인물 · 설정 충돌",
  world_rule_conflict: "세계관 · 규칙 충돌",
  timeline_conflict: "타임라인 충돌",
  causality_conflict: "인과 충돌",
  foreshadowing_gap: "복선 누락",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

type AuthMode = "login" | "signup";
type StoryDraftErrors = {
  title: string;
  content: string;
};
type WorkspaceMode = "document" | "worldGraph";
type GraphNodePosition = StoryNode & {
  x: number;
  y: number;
};

const emptyFieldMessage = "비어있을수 없습니다.";
const emptyStoryDraftErrors: StoryDraftErrors = { title: "", content: "" };
const storyNodeTypeLabels: Record<StoryNode["type"], string> = {
  character: "인물",
  event: "사건",
  rule: "규칙",
  place: "장소",
  foreshadow: "복선",
  issue: "이슈",
};

function authErrorMessage(error: unknown) {
  if (error instanceof StoryguardApiError) {
    if (error.code === "INVALID_CREDENTIALS" || error.status === 401) {
      return "이메일 또는 비밀번호를 확인해 주세요.";
    }
    if (error.code === "EMAIL_ALREADY_EXISTS" || error.status === 409) {
      return "이미 가입된 이메일입니다.";
    }
    if (error.code === "VALIDATION_ERROR" || error.status === 400 || error.status === 422) {
      return "입력한 정보를 다시 확인해 주세요.";
    }
  }
  return "잠시 후 다시 시도해 주세요.";
}

function LoginScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("스토리 작가");
  const [email, setEmail] = useState("writer@storyguard.local");
  const [password, setPassword] = useState("storyguard");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);
    try {
      const user =
        mode === "signup"
          ? await storyguardApi.signup({ email, password, name })
          : await storyguardApi.login(email, password);
      onAuth(user);
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="brand-mark">
          <ShieldCheck size={26} />
          <span>StoryGuard</span>
        </div>
        <h1>작품의 기억을 지키는 작업대</h1>
        <p>
          과거 원고를 기준으로 새 원고의 인물 설정과 세계관 규칙 충돌을 먼저
          확인합니다.
        </p>
        {mode === "signup" ? (
          <label>
            이름
            <input
              aria-label="이름"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        ) : null}
        {formError ? (
          <div className="form-error" role="alert">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        ) : null}
        <label>
          이메일
          <input
            aria-label="이메일"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError("");
            }}
          />
        </label>
        <label>
          비밀번호
          <input
            aria-label="비밀번호"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError("");
            }}
          />
        </label>
        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "불러오는 중" : mode === "signup" ? "회원가입" : "로그인"}
        </button>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setFormError("");
          }}
          type="button"
        >
          {mode === "signup" ? "로그인으로 전환" : "회원가입으로 전환"}
        </button>
      </form>
    </main>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity-badge ${severity}`}>{severityLabels[severity]}</span>;
}

function EvidenceQuote({
  analysis,
  issue,
}: {
  analysis: AnalysisResult;
  issue: Issue;
}) {
  const evidence = analysis.response.evidence.find((item) =>
    issue.evidenceIds.includes(item.id),
  );

  return (
    <div className="comparison-grid">
      <div>
        <span className="field-label">이전 원고 근거</span>
        <strong>{evidence?.chunkId ?? "프로젝트 원고"}</strong>
        <p>{evidence?.quote ?? issue.conflictingSetting}</p>
      </div>
      <div className="comparison-arrow">→</div>
      <div>
        <span className="field-label">현재 원고 내용</span>
        <strong>현재</strong>
        <p>{issue.manuscriptQuote}</p>
      </div>
    </div>
  );
}

function IssueItem({ analysis, issue }: { analysis: AnalysisResult; issue: Issue }) {
  return (
    <article className="issue-item">
      <header className="issue-header">
        <SeverityBadge severity={issue.severity} />
        <div>
          <h4>{issue.title}</h4>
          <span>{issueTypeLabels[issue.type]}</span>
        </div>
      </header>
      <EvidenceQuote analysis={analysis} issue={issue} />
      <div className="issue-explain">
        <span className="field-label">충돌 이유</span>
        <p>{issue.reason}</p>
      </div>
      <div className="issue-suggestion">
        <span className="field-label">수정 방향</span>
        <p>{issue.suggestion}</p>
      </div>
    </article>
  );
}

function AnalysisPanel({
  analysis,
  analysisHistory,
  isAnalyzing,
  selectedSeverity,
  onAnalysisSelect,
  onSeverityChange,
  onClose,
}: {
  analysis: AnalysisResult | null;
  analysisHistory: AnalysisResultSummary[];
  isAnalyzing: boolean;
  selectedSeverity: SeverityFilter;
  onAnalysisSelect: (analysisId: string) => void;
  onSeverityChange: (severity: SeverityFilter) => void;
  onClose: () => void;
}) {
  const issues = useMemo(() => {
    if (!analysis) return [];
    return filterIssuesBySeverity(
      getPriorityIssues(analysis.response.issues),
      selectedSeverity,
    );
  }, [analysis, selectedSeverity]);

  return (
    <aside className="analysis-panel">
      <div className="panel-heading">
        <h2>분석 결과</h2>
        <div className="panel-heading-actions">
          {analysis ? <span>분석 시간: {formatDate(analysis.createdAt)}</span> : <RefreshCcw size={17} />}
          <button aria-label="분석 패널 닫기" className="icon-button" onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      <section className="history-list" aria-label="분석 기록">
        <div className="history-heading">
          <History size={16} />
          <h3>분석 기록</h3>
        </div>
        {analysisHistory.length === 0 ? (
          <p>저장된 분석 기록이 없습니다.</p>
        ) : (
          analysisHistory.map((item) => {
            const label = analysisHistoryLabel(item);
            return (
              <button
                aria-label={label}
                key={item.id}
                onClick={() => onAnalysisSelect(item.id)}
                type="button"
              >
                <span>{label}</span>
                <small>{formatDate(item.createdAt)}</small>
              </button>
            );
          })
        )}
      </section>

      {!analysis ? (
        <div className="empty-analysis">
          {isAnalyzing ? <Loader2 className="spin" size={28} /> : <Gauge size={32} />}
          <strong>{isAnalyzing ? "이전 원고와 대조 중" : "아직 분석 전"}</strong>
          <p>분석하기를 누르면 과거 원고 기반 설정 충돌을 확인합니다.</p>
        </div>
      ) : (
        <>
          <section className="risk-summary">
            <AlertTriangle size={40} />
            <div>
              <h3>높은 위험 {analysis.summary.highCount}건</h3>
              <p>이전 원고와 충돌하면 연속성에 영향이 있을 수 있습니다.</p>
            </div>
          </section>

          <section className="severity-summary" aria-label="심각도별 현황">
            <div>
              <span>높음</span>
              <strong className="high-text">{analysis.summary.highCount}</strong>
            </div>
            <div>
              <span>보통</span>
              <strong className="medium-text">{analysis.summary.mediumCount}</strong>
            </div>
            <div>
              <span>낮음</span>
              <strong className="low-text">{analysis.summary.lowCount}</strong>
            </div>
            <div>
              <span>총</span>
              <strong>{analysis.summary.issueCount}</strong>
            </div>
          </section>

          <section className="filter-row" aria-label="심각도 필터">
            <ListFilter size={16} />
            {(["all", "high", "medium", "low"] as SeverityFilter[]).map((severity) => (
              <button
                className={selectedSeverity === severity ? "active" : ""}
                key={severity}
                onClick={() => onSeverityChange(severity)}
                type="button"
              >
                {severity === "all" ? "전체" : severityLabels[severity]}
              </button>
            ))}
          </section>

          <section className="issue-list">
            <h3>이슈 목록 ({issues.length})</h3>
            {issues.map((issue) => (
              <IssueItem analysis={analysis} issue={issue} key={issue.id} />
            ))}
          </section>
        </>
      )}
    </aside>
  );
}

function getGraphNodePositions(graph: WorldGraph): GraphNodePosition[] {
  const centerX = 430;
  const centerY = 250;
  const radius = 170;
  const total = graph.nodes.length;

  if (total === 1) {
    return [{ ...graph.nodes[0], x: centerX, y: centerY }];
  }

  return graph.nodes.map((node, index) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: Math.round(centerX + Math.cos(angle) * radius),
      y: Math.round(centerY + Math.sin(angle) * radius),
    };
  });
}

function findConnectedEdges(node: StoryNode, edges: StoryEdge[]) {
  return edges.filter((edge) => edge.source === node.id || edge.target === node.id);
}

function WorldGraphView({
  graph,
  isLoading,
  error,
  projectTitle,
  selectedNode,
  updatedAt,
  onNodeSelect,
  onRetry,
}: {
  graph: WorldGraph | null;
  isLoading: boolean;
  error: string;
  projectTitle: string;
  selectedNode: StoryNode | null;
  updatedAt: string;
  onNodeSelect: (node: StoryNode) => void;
  onRetry: () => void;
}) {
  const positionedNodes = graph ? getGraphNodePositions(graph) : [];
  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const connectedEdges = selectedNode && graph ? findConnectedEdges(selectedNode, graph.edges) : [];

  if (isLoading) {
    return (
      <section className="world-graph-view">
        <div className="world-graph-empty">
          <Loader2 className="spin" size={28} />
          <strong>세계관 그래프를 불러오는 중</strong>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="world-graph-view">
        <div className="world-graph-empty">
          <AlertTriangle size={30} />
          <strong>{error}</strong>
          <button className="secondary-button" onClick={onRetry} type="button">
            다시 시도
          </button>
        </div>
      </section>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <section className="world-graph-view">
        <div className="world-graph-empty">
          <Gauge size={34} />
          <strong>아직 세계관 그래프가 없습니다</strong>
          <p>분석이 쌓이면 프로젝트 기준 관계망을 확인할 수 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={selectedNode ? "world-graph-view with-detail" : "world-graph-view"}>
      <div className="world-graph-canvas">
        <header className="world-graph-header">
          <div>
            <h1>세계관 그래프</h1>
            <span>{updatedAt ? `업데이트: ${formatDate(updatedAt)}` : projectTitle}</span>
          </div>
          <div className="world-graph-legend" aria-label="노드 타입 범례">
            {Object.entries(storyNodeTypeLabels).map(([type, label]) => (
              <span className={`legend-item ${type}`} key={type}>
                {label}
              </span>
            ))}
          </div>
        </header>

        <svg
          aria-label={`${projectTitle} 세계관 그래프`}
          className="world-graph-svg"
          role="img"
          viewBox="0 0 860 500"
        >
          {graph.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) return null;
            const labelX = (source.x + target.x) / 2;
            const labelY = (source.y + target.y) / 2;
            return (
              <g className="world-edge" key={`${edge.source}-${edge.target}-${edge.label}`}>
                <line x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
                <text x={labelX} y={labelY}>
                  {edge.label}
                </text>
              </g>
            );
          })}
          {positionedNodes.map((node) => (
            <g
              aria-label={`${node.label} 노드 선택`}
              className={[
                "world-node",
                node.type,
                node.hasIssue ? "has-issue" : "",
                selectedNode?.id === node.id ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={node.id}
              onClick={() => onNodeSelect(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onNodeSelect(node);
                }
              }}
              role="button"
              tabIndex={0}
              transform={`translate(${node.x} ${node.y})`}
            >
              <circle className="node-issue-ring" r="34" />
              <circle className="node-dot" r="27" />
              <text className="node-label" textAnchor="middle" y="50">
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {selectedNode ? (
        <aside
          aria-label={`${selectedNode.label} 상세`}
          className="world-node-detail"
          role="complementary"
        >
          <span className={`node-type-chip ${selectedNode.type}`}>
            {storyNodeTypeLabels[selectedNode.type]}
          </span>
          <h2>{selectedNode.label}</h2>
          <dl>
            <div>
              <dt>타입</dt>
              <dd>{selectedNode.type}</dd>
            </div>
            <div>
              <dt>중요도</dt>
              <dd>중요도 {selectedNode.importance}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>{selectedNode.hasIssue ? "이슈 있음" : "이슈 없음"}</dd>
            </div>
          </dl>
          <section className="connected-edge-list">
            <h3>연결</h3>
            {connectedEdges.length === 0 ? (
              <p>연결된 요소가 없습니다.</p>
            ) : (
              connectedEdges.map((edge) => {
                const otherNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                const otherNode = graph.nodes.find((node) => node.id === otherNodeId);
                return (
                  <article key={`${edge.source}-${edge.target}-${edge.label}`}>
                    <strong>{otherNode?.label ?? otherNodeId}</strong>
                    <span>{edge.label}</span>
                  </article>
                );
              })
            )}
          </section>
        </aside>
      ) : null}
    </section>
  );
}

function analysisHistoryLabel(analysis: AnalysisResultSummary) {
  const episode = analysis.storyId === "story-23" ? "23화" : "저장";
  return `${episode} 저장 결과 · 높음 ${analysis.summary.highCount}`;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [projectDraftTitle, setProjectDraftTitle] = useState("");
  const [projectDraftGenre, setProjectDraftGenre] = useState("");
  const [projectDraftDescription, setProjectDraftDescription] = useState("");
  const [projectDraftError, setProjectDraftError] = useState("");
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [isEditingStory, setIsEditingStory] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftDocumentType, setDraftDocumentType] = useState<"manuscript" | "settings">(
    "manuscript",
  );
  const [editTitle, setEditTitle] = useState("");
  const [storyDraftErrors, setStoryDraftErrors] =
    useState<StoryDraftErrors>(emptyStoryDraftErrors);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("document");
  const [worldGraphResult, setWorldGraphResult] =
    useState<ReadProjectWorldGraphResponse | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<StoryNode | null>(null);
  const [isWorldGraphLoading, setIsWorldGraphLoading] = useState(false);
  const [worldGraphError, setWorldGraphError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResultSummary[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisPanelOpen, setIsAnalysisPanelOpen] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityFilter>("all");
  const manuscriptEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedStory = stories.find((story) => story.id === selectedStoryId);
  const hasActiveEditor = Boolean(isCreatingStory || selectedStory);
  const isWriting = isCreatingStory || isEditingStory;
  const editingProject = projects.find((project) => project.id === editingProjectId);
  const isProjectFormOpen = isCreatingProject || Boolean(editingProject);
  const activeManuscript = isCreatingStory ? draftContent : manuscript;
  const activeTitle = isCreatingStory ? draftTitle : isEditingStory ? editTitle : selectedStory?.title ?? "";

  useEffect(() => {
    async function restoreSession() {
      const currentUser = await storyguardApi.currentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    }
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function loadWorkspace() {
      const loadedProjects = await storyguardApi.listProjects();
      const firstProject = loadedProjects[0];
      const loadedStories = firstProject
        ? await storyguardApi.listStories(firstProject.id)
        : [];
      setProjects(loadedProjects);
      setSelectedProjectId(firstProject?.id ?? "");
      setStories(loadedStories);
      setSelectedStoryId(loadedStories[0]?.id ?? "");
      setManuscript(loadedStories[0]?.content ?? "");
      setIsCreatingProject(false);
      setIsProjectSwitcherOpen(false);
      setEditingProjectId("");
      setProjectDraftTitle("");
      setProjectDraftGenre("");
      setProjectDraftDescription("");
      setProjectDraftError("");
      setIsCreatingStory(false);
      setIsEditingStory(false);
      setDraftTitle("");
      setDraftContent("");
      setEditTitle("");
      setStoryDraftErrors(emptyStoryDraftErrors);
      setWorkspaceMode("document");
      setWorldGraphResult(null);
      setSelectedGraphNode(null);
      setWorldGraphError("");
    }
    void loadWorkspace();
  }, [user]);

  useEffect(() => {
    let ignore = false;
    async function loadAnalysisHistory() {
      if (!selectedStoryId) {
        if (!ignore) setAnalysisHistory([]);
        return;
      }
      const loadedHistory = await storyguardApi.listAnalysisResults(selectedStoryId);
      if (!ignore) setAnalysisHistory(loadedHistory);
    }
    void loadAnalysisHistory();
    return () => {
      ignore = true;
    };
  }, [selectedStoryId]);

  useEffect(() => {
    if (isCreatingStory) {
      manuscriptEditorRef.current?.focus();
    }
  }, [isCreatingStory]);

  async function loadProjectStories(projectId: string) {
    const loadedStories = await storyguardApi.listStories(projectId);
    setStories(loadedStories);
    setSelectedStoryId(loadedStories[0]?.id ?? "");
    setManuscript(loadedStories[0]?.content ?? "");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setWorldGraphResult(null);
    setSelectedGraphNode(null);
    setWorldGraphError("");
    setIsCreatingProject(false);
    setProjectDraftTitle("");
    setProjectDraftGenre("");
    setProjectDraftDescription("");
    setProjectDraftError("");
    setIsProjectSwitcherOpen(false);
    setEditingProjectId("");
    setAnalysis(null);
  }

  function selectStory(story: Story) {
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setSelectedGraphNode(null);
    setSelectedStoryId(story.id);
    setManuscript(story.content);
    setAnalysis(null);
  }

  async function handleProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
    setIsProjectSwitcherOpen(false);
    await loadProjectStories(projectId);
  }

  function handleStartCreateProject() {
    setIsCreatingProject(true);
    setIsProjectSwitcherOpen(false);
    setEditingProjectId("");
    setProjectDraftTitle("");
    setProjectDraftGenre("");
    setProjectDraftDescription("");
    setProjectDraftError("");
  }

  function handleStartEditProject(project: Project) {
    setIsCreatingProject(false);
    setIsProjectSwitcherOpen(false);
    setEditingProjectId(project.id);
    setProjectDraftTitle(project.title);
    setProjectDraftGenre(project.genre ?? "");
    setProjectDraftDescription(project.description ?? "");
    setProjectDraftError("");
  }

  async function handleSaveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = projectDraftTitle.trim();
    if (!title) {
      setProjectDraftError("프로젝트 제목을 입력해 주세요.");
      return;
    }
    if (editingProject) {
      const project = await storyguardApi.updateProject(editingProject.id, {
        title,
        genre: projectDraftGenre.trim() || undefined,
        description: projectDraftDescription.trim() || undefined,
      });
      setProjects((currentProjects) =>
        currentProjects.map((candidate) => (candidate.id === project.id ? project : candidate)),
      );
      setEditingProjectId("");
      setProjectDraftTitle("");
      setProjectDraftGenre("");
      setProjectDraftDescription("");
      setProjectDraftError("");
      return;
    }
    const project = await storyguardApi.createProject({
      title,
      genre: projectDraftGenre.trim() || undefined,
      description: projectDraftDescription.trim() || undefined,
    });
    setProjects((currentProjects) => [...currentProjects, project]);
    setSelectedProjectId(project.id);
    setStories([]);
    setSelectedStoryId("");
    setManuscript("");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setIsCreatingProject(false);
    setProjectDraftTitle("");
    setProjectDraftGenre("");
    setProjectDraftDescription("");
    setProjectDraftError("");
    setWorkspaceMode("document");
    setWorldGraphResult(null);
    setSelectedGraphNode(null);
    setAnalysis(null);
    setAnalysisHistory([]);
    setIsAnalysisPanelOpen(false);
  }

  function handleCancelCreateProject() {
    setIsCreatingProject(false);
    setEditingProjectId("");
    setProjectDraftTitle("");
    setProjectDraftGenre("");
    setProjectDraftDescription("");
    setProjectDraftError("");
  }

  async function handleDeleteProject(projectToDelete = selectedProject) {
    if (!projectToDelete) return;
    await storyguardApi.deleteProject(projectToDelete.id);
    const remainingProjects = projects.filter((project) => project.id !== projectToDelete.id);
    const isDeletingSelectedProject = projectToDelete.id === selectedProjectId;
    const nextProject = isDeletingSelectedProject
      ? remainingProjects[0]
      : projects.find((project) => project.id === selectedProjectId);
    setProjects(remainingProjects);
    setSelectedProjectId(nextProject?.id ?? "");
    setAnalysis(null);
    setAnalysisHistory([]);
    setIsAnalysisPanelOpen(false);
    setIsProjectSwitcherOpen(false);
    setEditingProjectId("");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setWorldGraphResult(null);
    setSelectedGraphNode(null);

    if (!nextProject || !isDeletingSelectedProject) {
      if (!nextProject) {
        setStories([]);
        setSelectedStoryId("");
        setManuscript("");
      }
      return;
    }

    if (remainingProjects.length === 0) {
      setStories([]);
      setSelectedStoryId("");
      setManuscript("");
      return;
    }

    const loadedStories = await storyguardApi.listStories(nextProject.id);
    setStories(loadedStories);
    setSelectedStoryId(loadedStories[0]?.id ?? "");
    setManuscript(loadedStories[0]?.content ?? "");
  }

  function handleStartCreateStory() {
    if (!selectedProject) return;
    setIsCreatingStory(true);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setDraftDocumentType("manuscript");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setSelectedGraphNode(null);
    setAnalysis(null);
  }

  async function handleSaveStory() {
    if (!selectedProject) return;
    const title = draftTitle.trim();
    const errors = {
      title: title ? "" : emptyFieldMessage,
      content: draftContent.trim() ? "" : emptyFieldMessage,
    };
    setStoryDraftErrors(errors);
    if (errors.title || errors.content) return;
    const story = await storyguardApi.createStory(selectedProject.id, {
      title,
      documentType: draftDocumentType,
      content: draftContent,
    });
    setStories((currentStories) => [story, ...currentStories]);
    setIsCreatingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setDraftDocumentType("manuscript");
    setStoryDraftErrors(emptyStoryDraftErrors);
    selectStory(story);
  }

  function handleStartEditStory(story: Story) {
    setIsCreatingStory(false);
    setIsEditingStory(true);
    setDraftTitle("");
    setDraftContent("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setSelectedStoryId(story.id);
    setEditTitle(story.title);
    setManuscript(story.content);
    setWorkspaceMode("document");
    setSelectedGraphNode(null);
    setAnalysis(null);
  }

  async function handleSaveStoryChanges() {
    if (!selectedStory) return;
    const title = editTitle.trim();
    const errors = {
      title: title ? "" : emptyFieldMessage,
      content: manuscript.trim() ? "" : emptyFieldMessage,
    };
    setStoryDraftErrors(errors);
    if (errors.title || errors.content) return;
    const story = await storyguardApi.updateStory(selectedStory.id, {
      title,
      content: manuscript,
    });
    setStories((currentStories) =>
      currentStories.map((candidate) => (candidate.id === story.id ? story : candidate)),
    );
    setIsEditingStory(false);
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    selectStory(story);
  }

  async function handleDeleteStory(story: Story) {
    await storyguardApi.deleteStory(story.id);
    const remainingStories = stories.filter((candidate) => candidate.id !== story.id);
    setStories(remainingStories);
    setAnalysis(null);
    setAnalysisHistory([]);
    setIsAnalysisPanelOpen(false);

    if (remainingStories.length > 0) {
      selectStory(remainingStories[0]);
      return;
    }

    setSelectedStoryId("");
    setManuscript("");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setSelectedGraphNode(null);
  }

  function handleCancelCreateStory() {
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setSelectedGraphNode(null);
    if (selectedStory) {
      setManuscript(selectedStory.content);
    }
  }

  async function handleAnalyze() {
    if (!selectedStoryId) return;
    setIsAnalysisPanelOpen(true);
    setIsAnalyzing(true);
    const result = await storyguardApi.requestAnalysis(selectedStoryId);
    setAnalysis(result);
    const loadedHistory = await storyguardApi.listAnalysisResults(selectedStoryId);
    setAnalysisHistory(loadedHistory);
    setSelectedSeverity("all");
    setIsAnalyzing(false);
  }

  async function handleAnalysisSelect(analysisId: string) {
    setIsAnalysisPanelOpen(true);
    const result = await storyguardApi.readAnalysis(analysisId);
    setAnalysis(result);
    setSelectedSeverity("all");
  }

  async function handleLogout() {
    await storyguardApi.logout();
    setUser(null);
    setProjects([]);
    setStories([]);
    setSelectedProjectId("");
    setSelectedStoryId("");
    setManuscript("");
    setIsCreatingProject(false);
    setIsProjectSwitcherOpen(false);
    setEditingProjectId("");
    setProjectDraftTitle("");
    setProjectDraftGenre("");
    setProjectDraftDescription("");
    setProjectDraftError("");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setDraftTitle("");
    setDraftContent("");
    setEditTitle("");
    setStoryDraftErrors(emptyStoryDraftErrors);
    setWorkspaceMode("document");
    setWorldGraphResult(null);
    setSelectedGraphNode(null);
    setWorldGraphError("");
    setAnalysis(null);
    setAnalysisHistory([]);
    setIsAnalysisPanelOpen(false);
  }

  async function handleMarkdownImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await readTextFile(file);
    if (isCreatingStory) {
      setDraftContent(text);
      setStoryDraftErrors((currentErrors) => ({ ...currentErrors, content: "" }));
    } else {
      if (selectedStory) {
        setIsEditingStory(true);
        setEditTitle(selectedStory.title);
      }
      setManuscript(text);
      setStoryDraftErrors((currentErrors) => ({ ...currentErrors, content: "" }));
    }
  }

  async function handleOpenWorldGraph() {
    if (!selectedProject) return;
    setWorkspaceMode("worldGraph");
    setIsCreatingStory(false);
    setIsEditingStory(false);
    setStoryDraftErrors(emptyStoryDraftErrors);
    setSelectedGraphNode(null);
    setWorldGraphError("");
    setIsWorldGraphLoading(true);
    try {
      const result = await storyguardApi.readProjectWorldGraph(selectedProject.id);
      setWorldGraphResult(result);
    } catch {
      setWorldGraphError("세계관 그래프를 불러오지 못했습니다.");
    } finally {
      setIsWorldGraphLoading(false);
    }
  }

  if (!user) {
    return <LoginScreen onAuth={setUser} />;
  }

  return (
    <div className={isAnalysisPanelOpen ? "app-shell with-analysis" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand-mark">
          <ShieldCheck size={28} />
          <span>StoryGuard</span>
        </div>

        <section className="sidebar-section">
          <div className="section-title">
            <span>프로젝트</span>
            <button
              aria-label="프로젝트 추가"
              className="icon-button"
              onClick={handleStartCreateProject}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            aria-label="프로젝트 전환"
            className="project-switch-button"
            onClick={() => setIsProjectSwitcherOpen(true)}
            type="button"
          >
            <span>{selectedProject?.title ?? "프로젝트 없음"}</span>
            <small>{selectedProject?.genre ?? "새 프로젝트를 만들어 주세요"}</small>
          </button>
        </section>

        <section className="sidebar-section document-list">
          <div className="section-title">
            <span>문서 목록</span>
            <button
              aria-label="문서 추가"
              className="icon-button"
              disabled={!selectedProject}
              onClick={handleStartCreateStory}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          {selectedProject && stories.length === 0 ? (
            <div className="empty-document-list">
              <FileText size={18} />
              <span>문서가 없습니다</span>
            </div>
          ) : null}
          {stories.map((story) => (
            <div
              className={story.id === selectedStoryId ? "document-row active" : "document-row"}
              key={story.id}
            >
              <button
                className="document-select-button"
                onClick={() => selectStory(story)}
                type="button"
              >
                <span>{story.title}</span>
                <small>
                  {formatDate(story.createdAt)} ·{" "}
                  {countNonWhitespaceCharacters(story.content).toLocaleString()}자
                </small>
              </button>
              <div className="document-row-actions">
                <button
                  aria-label={`${story.title} 수정`}
                  className="icon-button"
                  onClick={() => handleStartEditStory(story)}
                  type="button"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  aria-label={`${story.title} 삭제`}
                  className="icon-button danger"
                  onClick={() => handleDeleteStory(story)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </section>

        {selectedProject ? (
          <section className="sidebar-section world-graph-menu">
            <button
              className={
                workspaceMode === "worldGraph"
                  ? "world-graph-menu-button active"
                  : "world-graph-menu-button"
              }
              onClick={handleOpenWorldGraph}
              type="button"
            >
              <Gauge size={16} />
              <span>세계관 그래프</span>
            </button>
          </section>
        ) : null}

        <div className="sidebar-footer">
          <button className="secondary-button sidebar-logout" onClick={handleLogout} type="button">
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </aside>

      {isProjectSwitcherOpen ? (
        <div className="slide-over-backdrop">
          <section
            aria-label="프로젝트 선택"
            className="project-switcher-panel"
            role="dialog"
          >
            <header className="slide-over-header">
              <div>
                <h2>프로젝트 선택</h2>
                <span>작품을 고르거나 정보를 정리합니다.</span>
              </div>
              <button
                aria-label="프로젝트 선택 닫기"
                className="icon-button"
                onClick={() => setIsProjectSwitcherOpen(false)}
                type="button"
              >
                <X size={15} />
              </button>
            </header>
            <div
              aria-label="프로젝트 목록"
              className="project-switcher-list compact"
              role="list"
            >
              {projects.length === 0 ? (
                <p className="empty-project-copy">아직 프로젝트가 없습니다.</p>
              ) : null}
              {projects.map((project) => (
                <article
                  aria-label={project.title}
                  className={
                    project.id === selectedProjectId
                      ? "project-switcher-item active"
                      : "project-switcher-item"
                  }
                  key={project.id}
                  role="listitem"
                >
                  <button
                    className="project-switcher-select"
                    onClick={() => handleProjectSelect(project.id)}
                    type="button"
                  >
                    <strong>{project.title}</strong>
                    <span>{project.genre ?? "장르 미정"}</span>
                  </button>
                  <div className="project-switcher-actions">
                    <button
                      aria-label={`${project.title} 수정`}
                      className="icon-button"
                      onClick={() => handleStartEditProject(project)}
                      type="button"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      aria-label={`${project.title} 삭제`}
                      className="icon-button danger"
                      onClick={() => handleDeleteProject(project)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button className="primary-button" onClick={handleStartCreateProject} type="button">
              <Plus size={16} />
              새 프로젝트 만들기
            </button>
          </section>
        </div>
      ) : null}

      {isProjectFormOpen ? (
        <div className="slide-over-backdrop">
          <form
            aria-label={editingProject ? "프로젝트 수정" : "프로젝트 만들기"}
            className="project-draft-form"
            onSubmit={handleSaveProject}
            role="dialog"
          >
            <header className="slide-over-header">
              <div>
                <h2>{editingProject ? "프로젝트 수정" : "프로젝트 만들기"}</h2>
                <span>
                  {editingProject
                    ? "작품 정보를 바꾸면 목록과 작업대에 바로 반영됩니다."
                    : "작품의 기본 정보를 먼저 정리합니다."}
                </span>
              </div>
              <button
                aria-label={editingProject ? "프로젝트 수정 닫기" : "프로젝트 만들기 닫기"}
                className="icon-button"
                onClick={handleCancelCreateProject}
                type="button"
              >
                <X size={15} />
              </button>
            </header>
            {projectDraftError ? (
              <div className="form-error" role="alert">
                <AlertTriangle size={16} />
                <span>{projectDraftError}</span>
              </div>
            ) : null}
            <div aria-label="프로젝트 제목 입력 그룹" className="project-field-group" role="group">
              <label htmlFor="project-title">프로젝트 제목</label>
              <input
                id="project-title"
                onChange={(event) => {
                  setProjectDraftTitle(event.target.value);
                  setProjectDraftError("");
                }}
                value={projectDraftTitle}
              />
            </div>
            <div className="project-field-separator" role="separator" />
            <div aria-label="프로젝트 장르 입력 그룹" className="project-field-group" role="group">
              <label htmlFor="project-genre">프로젝트 장르</label>
              <input
                id="project-genre"
                onChange={(event) => setProjectDraftGenre(event.target.value)}
                value={projectDraftGenre}
              />
            </div>
            <div className="project-field-separator" role="separator" />
            <div aria-label="프로젝트 설명 입력 그룹" className="project-field-group" role="group">
              <label htmlFor="project-description">프로젝트 설명</label>
              <textarea
                id="project-description"
                onChange={(event) => setProjectDraftDescription(event.target.value)}
                rows={5}
                value={projectDraftDescription}
              />
            </div>
            <div className="project-draft-actions">
              <button
                className="secondary-button"
                onClick={handleCancelCreateProject}
                type="button"
              >
                {editingProject ? "수정 취소" : "생성 취소"}
              </button>
              <button className="primary-button" type="submit">
                {editingProject ? "프로젝트 저장" : "프로젝트 생성"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <main className="workspace">
        {!selectedProject ? (
          <div className="empty-workspace project-empty-state">
            <ShieldCheck size={42} />
            <h1>프로젝트가 없습니다</h1>
            <p>새 프로젝트를 만들면 원고를 정리할 수 있습니다.</p>
            <button className="primary-button" onClick={handleStartCreateProject} type="button">
              <Plus size={17} />
              프로젝트 만들기
            </button>
          </div>
        ) : workspaceMode === "worldGraph" ? (
          <WorldGraphView
            error={worldGraphError}
            graph={worldGraphResult?.graph ?? null}
            isLoading={isWorldGraphLoading}
            onNodeSelect={setSelectedGraphNode}
            onRetry={handleOpenWorldGraph}
            projectTitle={selectedProject.title}
            selectedNode={selectedGraphNode}
            updatedAt={worldGraphResult?.updatedAt ?? ""}
          />
        ) : !hasActiveEditor ? (
          <div className="empty-workspace">
            <FileText size={42} />
            <h1>아직 원고가 없습니다</h1>
            <p>프로젝트에 첫 원고를 작성하면 분석을 시작할 수 있습니다.</p>
            <button
              className="primary-button"
              disabled={!selectedProject}
              onClick={handleStartCreateStory}
              type="button"
            >
              <Plus size={17} />
              첫 원고 작성
            </button>
          </div>
        ) : (
          <>
            <header className="document-header">
              <div>
                {isWriting ? (
                  <div className="document-title-field">
                    <input
                      aria-label="문서 제목"
                      className={
                        storyDraftErrors.title
                          ? "document-title-input field-invalid"
                          : "document-title-input"
                      }
                      onChange={(event) => {
                        if (isCreatingStory) {
                          setDraftTitle(event.target.value);
                        } else {
                          setEditTitle(event.target.value);
                        }
                        setStoryDraftErrors((currentErrors) => ({
                          ...currentErrors,
                          title: "",
                        }));
                      }}
                      value={activeTitle}
                    />
                    {storyDraftErrors.title ? (
                      <span className="field-error-text">{storyDraftErrors.title}</span>
                    ) : null}
                  </div>
                ) : (
                  <h1>{selectedStory?.title}</h1>
                )}
                <span>
                  {isCreatingStory ? "작성 중" : isEditingStory ? "수정 중" : user.name ?? user.email}
                </span>
              </div>
              <div className="header-actions">
                {isWriting ? (
                  <label className="import-button">
                    Markdown 가져오기
                    <input
                      accept=".md,text/markdown,text/plain"
                      aria-label="Markdown 가져오기"
                      onChange={handleMarkdownImport}
                      type="file"
                    />
                  </label>
                ) : null}
              </div>
            </header>

            <div className="manuscript-editor-shell">
              <textarea
                aria-label="원고 본문"
                className={
                  [
                    "manuscript-editor",
                    isWriting ? "is-writing" : "is-reading",
                    storyDraftErrors.content ? "field-invalid" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                disabled={!isWriting}
                onChange={(event) => {
                  if (isCreatingStory) {
                    setDraftContent(event.target.value);
                  } else {
                    setManuscript(event.target.value);
                  }
                  setStoryDraftErrors((currentErrors) => ({
                    ...currentErrors,
                    content: "",
                  }));
                }}
                ref={manuscriptEditorRef}
                value={activeManuscript}
              />
              {storyDraftErrors.content ? (
                <span className="field-error-text manuscript-error-text">
                  {storyDraftErrors.content}
                </span>
              ) : null}
            </div>

            <footer className="workspace-footer">
              <span>
                {countNonWhitespaceCharacters(activeManuscript).toLocaleString()}자 · 공백 포함{" "}
                {activeManuscript.length.toLocaleString()}자
              </span>
              {isWriting ? (
                <div className="draft-actions">
                  {isCreatingStory ? (
                    <label className="draft-doc-type" style={{ display: "flex", alignItems: "center", gap: 6, marginRight: "auto" }}>
                      문서 타입
                      <select
                        value={draftDocumentType}
                        onChange={(event) =>
                          setDraftDocumentType(event.target.value as "manuscript" | "settings")
                        }
                      >
                        <option value="manuscript">원고</option>
                        <option value="settings">설정</option>
                      </select>
                    </label>
                  ) : null}
                  <button
                    className="secondary-button"
                    onClick={handleCancelCreateStory}
                    type="button"
                  >
                    작성 취소
                  </button>
                  <button
                    className="primary-button"
                    onClick={isCreatingStory ? handleSaveStory : handleSaveStoryChanges}
                    type="button"
                  >
                    <Save size={16} />
                    {isCreatingStory ? "문서 저장" : "변경 저장"}
                  </button>
                </div>
              ) : (
                <div className="draft-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setIsAnalysisPanelOpen((open) => !open)}
                    type="button"
                  >
                    <PanelRightOpen size={16} />
                    {isAnalysisPanelOpen ? "분석 패널 닫기" : "분석 패널 열기"}
                  </button>
                  <button
                    className="analyze-button"
                    disabled={isAnalyzing || !selectedStoryId}
                    onClick={handleAnalyze}
                  >
                    {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                    분석하기
                  </button>
                </div>
              )}
            </footer>
          </>
        )}
      </main>

      {isAnalysisPanelOpen ? (
        <AnalysisPanel
          analysis={analysis}
          analysisHistory={analysisHistory}
          isAnalyzing={isAnalyzing}
          onAnalysisSelect={handleAnalysisSelect}
          onClose={() => setIsAnalysisPanelOpen(false)}
          onSeverityChange={setSelectedSeverity}
          selectedSeverity={selectedSeverity}
        />
      ) : null}
    </div>
  );
}

export default App;
