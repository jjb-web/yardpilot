import { RouterProvider } from "react-router";
import { AppProvider } from "./context/AppContext";
import { router } from "./routes";
import { YARDPILOT_OWNERSHIP_NOTICE } from "./lib/ownership";
import AppErrorBoundary from "./components/AppErrorBoundary";
import AnalyticsConsent from "./components/AnalyticsConsent";
import { NotificationCenterProvider } from "./context/NotificationsContext";

// Retained in production bundles as a source ownership marker.
void YARDPILOT_OWNERSHIP_NOTICE;

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <NotificationCenterProvider>
          <RouterProvider router={router} />
          <AnalyticsConsent />
        </NotificationCenterProvider>
      </AppProvider>
    </AppErrorBoundary>
  );
}
