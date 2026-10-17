import type { RouteObject } from "react-router";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlanPage } from "../pages/PlanPage";
import { QuizPage } from "../pages/QuizPage";
import { ResultsPage } from "../pages/ResultsPage";
import { RouteErrorPage } from "../pages/RouteErrorPage";
import { RootLayout } from "./RootLayout";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorPage,
    children: [
      { index: true, Component: HomePage },
      { path: "plan", Component: PlanPage },
      { path: "quiz", Component: QuizPage },
      { path: "results", Component: ResultsPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
];
