import { Navigate, type RouteObject } from "react-router";
import { DestinationFormPage } from "../pages/DestinationFormPage";
import { DestinationsPage } from "../pages/DestinationsPage";
import { ImportPage } from "../pages/ImportPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { QuestionFormPage } from "../pages/QuestionFormPage";
import { QuestionsPage } from "../pages/QuestionsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TaxonomyPage } from "../pages/TaxonomyPage";
import { AdminLayout } from "./AdminLayout";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: AdminLayout,
    children: [
      { index: true, element: <Navigate to="/destinations" replace /> },
      { path: "destinations", Component: DestinationsPage },
      { path: "destinations/new", Component: DestinationFormPage },
      { path: "destinations/:id", Component: DestinationFormPage },
      { path: "questions", Component: QuestionsPage },
      { path: "questions/new", Component: QuestionFormPage },
      { path: "questions/:id", Component: QuestionFormPage },
      { path: "countries", element: <TaxonomyPage kind="countries" /> },
      { path: "attributes", element: <TaxonomyPage kind="attributes" /> },
      { path: "categories", element: <TaxonomyPage kind="categories" /> },
      { path: "settings", Component: SettingsPage },
      { path: "import", Component: ImportPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
];
