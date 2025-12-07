// platform/macos/DetectionNotification.swift
// User notification prompt with action buttons to start/ignore recording on detection.

import Foundation
import UserNotifications

public final class DetectionNotification: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = DetectionNotification()
    private override init() {}

    public enum Action: String { case start = "MEETING_START", dismiss = "MEETING_DISMISS" }
    public static let categoryId = "MEETING_DETECTED"

    public func register() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let start = UNNotificationAction(identifier: Action.start.rawValue, title: "Start Recording", options: [.foreground])
        let dismiss = UNNotificationAction(identifier: Action.dismiss.rawValue, title: "Dismiss", options: [])
        let cat = UNNotificationCategory(identifier: Self.categoryId, actions: [start, dismiss], intentIdentifiers: [], options: [])
        center.setNotificationCategories([cat])
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    public func present(title: String, body: String, userInfo: [AnyHashable: Any]) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = Self.categoryId
        content.userInfo = userInfo
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }

    // Forward action callbacks
    public var onAction: ((Action, [AnyHashable: Any]) -> Void)?

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let action = Action(rawValue: response.actionIdentifier) {
            onAction?(action, response.notification.request.content.userInfo)
        }
    }
}
