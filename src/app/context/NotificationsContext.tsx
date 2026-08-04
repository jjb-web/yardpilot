import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useNotifications } from "../hooks/useNotifications";
import { useApp } from "./AppContext";

type NotificationCenterValue = ReturnType<typeof useNotifications>;

const NotificationCenterContext =
  createContext<NotificationCenterValue | null>(null);

export function NotificationCenterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { authUserId } = useApp();
  const value = useNotifications(authUserId, 100);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const value = useContext(NotificationCenterContext);

  if (!value) {
    throw new Error(
      "useNotificationCenter must be used inside NotificationCenterProvider."
    );
  }

  return value;
}
