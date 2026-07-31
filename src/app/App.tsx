import { RouterProvider } from "react-router";
import { AppProvider } from "./context/AppContext";
import { router } from "./routes";
import { YARDPILOT_OWNERSHIP_NOTICE } from "./lib/ownership";

// Retained in production bundles as a source ownership marker.
void YARDPILOT_OWNERSHIP_NOTICE;

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}