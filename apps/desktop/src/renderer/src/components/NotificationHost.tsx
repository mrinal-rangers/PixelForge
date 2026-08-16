import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../application/state/taskStore'
import type { TaskNotificationKind } from '../application/state/taskStore'

export function NotificationHost(): React.JSX.Element {
  const notifications = useTaskStore(useShallow((s) => s.notifications))
  const dismiss = useTaskStore((s) => s.dismissNotification)
  if (notifications.length === 0) {
    return <div className="toast-host" />
  }
  return (
    <div className="toast-host">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          className={`toast toast-${notification.kind}`}
          onClick={() => dismiss(notification.id)}
          title="Dismiss"
        >
          <span className="toast-kind">{kindLabel(notification.kind)}</span>
          <span className="toast-title">{notification.title}</span>
          {notification.detail && <span className="toast-detail">{notification.detail}</span>}
        </button>
      ))}
    </div>
  )
}

function kindLabel(kind: TaskNotificationKind): string {
  switch (kind) {
    case 'warning':
      return 'NEEDS INPUT'
    case 'danger':
      return 'FAILED'
    case 'success':
      return 'DONE'
    default:
      return 'TASK'
  }
}