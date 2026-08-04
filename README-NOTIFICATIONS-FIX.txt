YardPilot notifications Realtime fix

Root cause:
- AppLayout or ClientLayout subscribed to notifications.
- Opening the Notifications page mounted a second useNotifications hook.
- Both hooks used the same Realtime topic.
- Supabase reused the already-subscribed channel and rejected the second
  postgres_changes callback.

Changes:
- Adds one NotificationCenterProvider for the entire app.
- AppLayout, ClientLayout, and Notifications consume the same state.
- Keeps only one notification Realtime subscription.
- Adds a unique topic token as protection against effect remount races.
- Adds Realtime subscription error reporting.

No SQL, database tables, policies, Stripe configuration, or environment values
are changed by this overlay.
