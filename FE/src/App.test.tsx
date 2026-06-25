import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { mockStoryguardApi } from "./api/storyguardApi";

describe("StoryGuard app", () => {
  beforeEach(() => {
    (mockStoryguardApi as typeof mockStoryguardApi & { reset?: () => void }).reset?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the StoryGuard workspace after mock login", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByRole("heading", { name: "23화_돌아온 기사" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("분석 결과")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분석하기" })).toBeInTheDocument();
  });

  it("runs analysis and shows high-risk character conflict evidence", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });
    await user.click(await screen.findByRole("button", { name: "분석하기" }));

    expect(await screen.findByText("높은 위험 6건")).toBeInTheDocument();
    expect(screen.getByText("세린의 마력 속성")).toBeInTheDocument();
    expect(screen.getByText(/세린은 태생적으로 빛의 마력/)).toBeInTheDocument();
  });

  it("imports markdown text into the manuscript editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    expect(screen.queryByLabelText("Markdown 가져오기")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "23화_돌아온 기사 수정" }));

    const file = new File(["# 새 원고\n\n세린은 빛을 바라보았다."], "new-story.md", {
      type: "text/markdown",
    });
    await user.upload(await screen.findByLabelText("Markdown 가져오기"), file);

    expect(await screen.findByDisplayValue(/세린은 빛을 바라보았다/)).toBeInTheDocument();
  });

  it("distinguishes reading and writing editor states", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    const readonlyEditor = screen.getByLabelText("원고 본문");
    expect(readonlyEditor).toBeDisabled();
    expect(readonlyEditor).toHaveClass("is-reading");
    expect(screen.queryByLabelText("Markdown 가져오기")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "23화_돌아온 기사 수정" }));

    const writingEditor = screen.getByLabelText("원고 본문");
    expect(writingEditor).toBeEnabled();
    expect(writingEditor).toHaveClass("is-writing");
    expect(screen.getByLabelText("Markdown 가져오기")).toBeInTheDocument();
  });

  it("opens the project world graph with nodes and edges", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "세계관 그래프" }));

    expect(await screen.findByRole("heading", { name: "세계관 그래프" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "황혼의 기사단 세계관 그래프" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "세린 노드 선택" })).toHaveClass(
      "world-node character",
    );
    expect(screen.getByRole("button", { name: "금지된 기술 노드 선택" })).toHaveClass(
      "world-node rule",
    );
    expect(screen.getByText("세린의 맹세")).toBeInTheDocument();
  });

  it("opens a detail panel when selecting a world graph node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "세계관 그래프" }));
    await user.click(await screen.findByRole("button", { name: "세린 노드 선택" }));

    const detailPanel = await screen.findByRole("complementary", { name: "세린 상세" });
    expect(detailPanel).toBeInTheDocument();
    expect(within(detailPanel).getByText("character")).toBeInTheDocument();
    expect(within(detailPanel).getByText("중요도 9")).toBeInTheDocument();
    expect(within(detailPanel).getByText("이슈 있음")).toBeInTheDocument();
    expect(within(detailPanel).getByText("금지된 기술")).toBeInTheDocument();
  });

  it("shows an empty world graph state for a project without graph data", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    await user.type(screen.getByLabelText("프로젝트 제목"), "빈 그래프 프로젝트");
    await user.click(screen.getByRole("button", { name: "프로젝트 생성" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
        "빈 그래프 프로젝트",
      ),
    );

    await user.click(screen.getByRole("button", { name: "세계관 그래프" }));

    expect(await screen.findByText("아직 세계관 그래프가 없습니다")).toBeInTheDocument();
  });

  it("shows a retryable error state when the world graph cannot load", async () => {
    const user = userEvent.setup();
    vi.spyOn(mockStoryguardApi, "readProjectWorldGraph").mockRejectedValueOnce(
      new Error("graph failed"),
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "세계관 그래프" }));

    expect(await screen.findByText("세계관 그래프를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("does not show controls that are not backed by the MVP API", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("heading", { name: "23화_돌아온 기사" })).toBeInTheDocument();
    expect(screen.queryByText("개요")).not.toBeInTheDocument();
    expect(screen.queryByText("인물")).not.toBeInTheDocument();
    expect(screen.queryByText("세계관")).not.toBeInTheDocument();
    expect(screen.queryByText("타임라인")).not.toBeInTheDocument();
    expect(screen.queryByText("설정")).not.toBeInTheDocument();
    expect(screen.queryByText("작가 모드")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("원고 도구")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "프로젝트 삭제" })).not.toBeInTheDocument();
  });

  it("creates projects only after filling and submitting the project form", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    expect(screen.queryByDisplayValue("새 프로젝트 2")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "프로젝트 만들기" })).toBeInTheDocument();
    expect(screen.getByLabelText("프로젝트 제목")).toBeInTheDocument();
    expect(screen.getByLabelText("프로젝트 장르")).toBeInTheDocument();
    expect(screen.getByLabelText("프로젝트 설명")).toBeInTheDocument();

    await user.type(screen.getByLabelText("프로젝트 제목"), "은하 기록자");
    await user.type(screen.getByLabelText("프로젝트 장르"), "스페이스 오페라");
    await user.type(screen.getByLabelText("프로젝트 설명"), "제국 변경의 기억을 추적하는 장편");
    await user.click(screen.getByRole("button", { name: "프로젝트 생성" }));

    expect(await screen.findByText("문서가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("아직 원고가 없습니다")).toBeInTheDocument();
    expect(screen.queryByLabelText("프로젝트 제목")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
        "은하 기록자",
      ),
    );
  });

  it("validates and cancels the project creation form", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    await user.click(screen.getByRole("button", { name: "프로젝트 생성" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("프로젝트 제목을 입력해 주세요.");

    await user.type(screen.getByLabelText("프로젝트 제목"), "취소할 프로젝트");
    await user.click(screen.getByRole("button", { name: "생성 취소" }));

    expect(screen.queryByLabelText("프로젝트 제목")).not.toBeInTheDocument();
    expect(screen.queryByText("취소할 프로젝트")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
      "황혼의 기사단",
    );
  });

  it("renders project form fields as compact separated groups", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 추가" }));

    expect(await screen.findByRole("group", { name: "프로젝트 제목 입력 그룹" })).toHaveClass(
      "project-field-group",
    );
    expect(screen.getByRole("group", { name: "프로젝트 장르 입력 그룹" })).toHaveClass(
      "project-field-group",
    );
    expect(screen.getByRole("group", { name: "프로젝트 설명 입력 그룹" })).toHaveClass(
      "project-field-group",
    );
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("edits and deletes stories from the document list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "23화_돌아온 기사 수정" }));
    await user.clear(screen.getByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "23화_귀환한 기사");
    await user.type(screen.getByLabelText("원고 본문"), "\n새 문단을 추가한다.");
    await user.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(await screen.findByRole("heading", { name: "23화_귀환한 기사" })).toBeInTheDocument();
    expect(screen.getAllByText("23화_귀환한 기사").length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "23화_귀환한 기사 삭제" }));
    expect(await screen.findByRole("heading", { name: "22화_새벽의 의식" })).toBeInTheDocument();
    expect(screen.queryByText("23화_귀환한 기사")).not.toBeInTheDocument();
  });

  it("deletes a project and moves to the next available project", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    await user.type(await screen.findByLabelText("프로젝트 제목"), "삭제할 프로젝트");
    await user.click(screen.getByRole("button", { name: "프로젝트 생성" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
        "삭제할 프로젝트",
      ),
    );

    await user.click(screen.getByRole("button", { name: "프로젝트 전환" }));
    await user.click(await screen.findByRole("button", { name: "삭제할 프로젝트 삭제" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
        "황혼의 기사단",
      ),
    );
    expect(screen.queryByText("삭제할 프로젝트")).not.toBeInTheDocument();
  });

  it("shows a project-only empty state after deleting every project", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 전환" }));
    await user.click(await screen.findByRole("button", { name: "황혼의 기사단 삭제" }));

    expect(await screen.findByRole("heading", { name: "프로젝트가 없습니다" })).toBeInTheDocument();
    expect(screen.getByText("새 프로젝트를 만들면 원고를 정리할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("아직 원고가 없습니다")).not.toBeInTheDocument();
  });

  it("opens a project switcher panel and edits a project from the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "프로젝트 전환" }));
    expect(await screen.findByRole("dialog", { name: "프로젝트 선택" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "프로젝트 목록" })).toHaveClass(
      "project-switcher-list compact",
    );
    expect(screen.getByRole("listitem", { name: "황혼의 기사단" })).toHaveClass(
      "project-switcher-item",
    );
    expect(screen.getByRole("button", { name: "황혼의 기사단 수정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "황혼의 기사단 삭제" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "황혼의 기사단 수정" }));
    expect(await screen.findByRole("dialog", { name: "프로젝트 수정" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("프로젝트 제목"));
    await user.type(screen.getByLabelText("프로젝트 제목"), "새벽의 기사단");
    await user.click(screen.getByRole("button", { name: "프로젝트 저장" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "프로젝트 전환" })).toHaveTextContent(
        "새벽의 기사단",
      ),
    );
    expect(screen.queryByRole("dialog", { name: "프로젝트 수정" })).not.toBeInTheDocument();
  });

  it("saves documents only after writing a draft", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "문서 추가" }));
    expect(await screen.findByLabelText("문서 제목")).toBeInTheDocument();
    expect(screen.getByLabelText("원고 본문")).toHaveFocus();
    await user.clear(screen.getByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "새 저장 원고");
    expect(screen.queryByText("새 저장 원고")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("원고 본문"), "저장 버튼을 누를 때만 문서가 만들어진다.");
    await user.click(screen.getByRole("button", { name: "문서 저장" }));

    expect(await screen.findByRole("heading", { name: "새 저장 원고" })).toBeInTheDocument();
    expect(screen.getAllByText("새 저장 원고").length).toBeGreaterThan(1);
  });

  it("marks empty draft fields without mixing warnings into the manuscript", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "문서 추가" }));
    const titleInput = await screen.findByLabelText("문서 제목");
    const manuscriptEditor = screen.getByLabelText("원고 본문");

    await user.click(screen.getByRole("button", { name: "문서 저장" }));

    expect(titleInput).toHaveClass("field-invalid");
    expect(manuscriptEditor).toHaveClass("field-invalid");
    expect(screen.getAllByText("비어있을수 없습니다.")).toHaveLength(2);
    expect(manuscriptEditor).toHaveValue("");

    await user.type(titleInput, "검증 원고");
    expect(titleInput).not.toHaveClass("field-invalid");
    expect(manuscriptEditor).toHaveClass("field-invalid");

    await user.type(manuscriptEditor, "본문을 입력한다.");
    expect(manuscriptEditor).not.toHaveClass("field-invalid");
    expect(screen.queryByText("비어있을수 없습니다.")).not.toBeInTheDocument();
  });

  it("cancels a draft without creating a document", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "문서 추가" }));
    await user.clear(await screen.findByLabelText("문서 제목"));
    await user.type(screen.getByLabelText("문서 제목"), "저장하지 않을 원고");
    await user.click(screen.getByRole("button", { name: "작성 취소" }));

    expect(await screen.findByRole("heading", { name: "23화_돌아온 기사" })).toBeInTheDocument();
    expect(screen.queryByText("저장하지 않을 원고")).not.toBeInTheDocument();
  });

  it("signs up a new writer and opens the workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "회원가입으로 전환" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "새 작가");
    await user.clear(screen.getByLabelText("이메일"));
    await user.type(screen.getByLabelText("이메일"), "new-writer@storyguard.local");
    await user.clear(screen.getByLabelText("비밀번호"));
    await user.type(screen.getByLabelText("비밀번호"), "storyguard");
    await user.click(screen.getByRole("button", { name: "회원가입" }));

    expect(
      await screen.findByRole("heading", { name: "23화_돌아온 기사" }),
    ).toBeInTheDocument();
    expect(screen.getByText("새 작가")).toBeInTheDocument();
  });

  it("shows an inline message when login credentials are invalid", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText("비밀번호"));
    await user.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이메일 또는 비밀번호를 확인해 주세요.",
    );
    expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "23화_돌아온 기사" })).not.toBeInTheDocument();
  });

  it("shows an inline message when signup email already exists", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "회원가입으로 전환" }));
    await user.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");
    expect(screen.getByRole("button", { name: "회원가입" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "23화_돌아온 기사" })).not.toBeInTheDocument();
  });

  it("logs out and returns to the auth screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });
    expect(screen.getByRole("button", { name: "로그아웃" })).toHaveClass("sidebar-logout");
    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "23화_돌아온 기사" })).not.toBeInTheDocument();
  });

  it("restores the current user session on app load", async () => {
    await mockStoryguardApi.login("writer@storyguard.local", "storyguard");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "23화_돌아온 기사" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("shows saved analysis history and opens a saved result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByRole("heading", { name: "23화_돌아온 기사" });

    await user.click(screen.getByRole("button", { name: "분석 패널 열기" }));
    expect(await screen.findByText("분석 기록")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "23화 저장 결과 · 높음 6" }));

    expect(await screen.findByText("높은 위험 6건")).toBeInTheDocument();
    expect(screen.getByText("세린의 마력 속성")).toBeInTheDocument();
  });
});
