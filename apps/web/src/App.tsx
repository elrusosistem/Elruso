import { useEffect, useState } from "react";
import { useUiMode } from "./uiMode";
import { useSelectedProject } from "./projectStore";
import { Layout2026 } from "./ui2026";
import { RunsList } from "./pages/RunsList";
import { RunDetail } from "./pages/RunDetail";
import { RequestsList } from "./pages/RequestsList";
import { DirectivesList } from "./pages/DirectivesList";
import { TasksList } from "./pages/TasksList";
import { SetupWizard } from "./pages/SetupWizard";
import { RunnersList } from "./pages/RunnersList";
import { DecisionsList } from "./pages/DecisionsList";
import { Dashboard } from "./pages/Dashboard";
import { Help } from "./pages/Help";
import { StrategyWizard } from "./pages/StrategyWizard";
import { ObjectivesList } from "./pages/ObjectivesList";
import { ProjectsList } from "./pages/ProjectsList";
import { OperatorOnboardingModal } from "./components/OperatorOnboardingModal";
import { TourOverlay } from "./tour";

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [mode] = useUiMode();
  const isOp = mode === "operator";
  const [selectedProject] = useSelectedProject();

  // Soft guard: redirect to projects if none selected (except projects page itself)
  useEffect(() => {
    if (!selectedProject && hash !== "#/projects") {
      window.location.hash = "#/projects";
    }
  }, [selectedProject, hash]);

  const runDetailMatch = hash.match(/^#\/runs\/(.+)$/);

  let page: React.ReactNode;
  if (hash === "#/projects") {
    page = <ProjectsList />;
  } else if (!selectedProject) {
    page = <ProjectsList />;
  } else if (runDetailMatch) {
    page = <RunDetail runId={runDetailMatch[1]} />;
  } else if (hash === "#/requests") {
    page = <RequestsList />;
  } else if (hash === "#/directives") {
    page = <DirectivesList />;
  } else if (hash === "#/decisions") {
    page = <DecisionsList />;
  } else if (hash === "#/tasks") {
    page = <TasksList />;
  } else if (hash === "#/strategy-wizard") {
    page = <StrategyWizard />;
  } else if (hash === "#/objectives") {
    page = <ObjectivesList />;
  } else if (hash === "#/runners") {
    page = <RunnersList />;
  } else if (hash === "#/help") {
    page = <Help />;
  } else if (hash === "#/setup") {
    page = <SetupWizard />;
  } else if (hash === "#/runs") {
    page = <RunsList />;
  } else {
    page = <Dashboard />;
  }

  return (
    <Layout2026 currentHash={hash}>
      {isOp && <OperatorOnboardingModal />}
      <TourOverlay />
      {page}
    </Layout2026>
  );
}
