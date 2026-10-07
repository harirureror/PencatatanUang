import { NotificationBanner } from "@/components/notifications/notification-banner";
import { listOpenNotifications } from "@/server/notifications";

/** Pemberitahuan terbuka milik pengguna (dirender di server). Kosong → tidak tampil apa pun. */
export async function Notifications({ userId }: { userId: string }) {
  const list = await listOpenNotifications(userId);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {list.map((n) => (
        <NotificationBanner key={n.id} notification={n} />
      ))}
    </div>
  );
}
