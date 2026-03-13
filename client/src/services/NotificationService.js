import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';

const LAST_ACTIVE_AT_KEY = 'smart_alert:last_active_at';
const INACTIVITY_NOTIFICATION_ID_KEY = 'smart_alert:inactivity_notification_id';
const NOTIFIED_ALERTS_KEY_PREFIX = 'smart_alert:notified_alert_ids';
const LAST_CATCHUP_ALERT_AT_KEY = 'smart_alert:last_catchup_alert_at';
const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';
const DEFAULT_SCOPE = 'anonymous';
const INACTIVITY_HOURS = 24;
const REMOTE_ALERT_MAX_AGE_MIN = 20;
const ABNORMAL_BEHAVIOR_SET = new Set(['vomiting', 'head_pressing', 'abnormal']);

const normalizeBehaviorLabel = (value) =>
  String(value || '').toLowerCase().replace(/\s+/g, '_').trim();

const isAbnormalBehavior = (value) => ABNORMAL_BEHAVIOR_SET.has(normalizeBehaviorLabel(value));

const severityTitle = {
  critical: 'Critical Alert',
  warning: 'Warning',
  success: 'Update',
  info: 'Notification',
};

class NotificationServiceClass {
  constructor() {
    this.scopeKey = DEFAULT_SCOPE;
    this.started = false;
    this.alertListener = null;
    this.notifications = null;
    this.responseSub = null;
  }

  _isExpoGo() {
    return Constants.appOwnership === 'expo';
  }

  _canUseNotificationsModule() {
    return !this._isExpoGo();
  }

  _loadNotificationsModule() {
    if (!this._canUseNotificationsModule()) return null;
    if (this.notifications) return this.notifications;

    try {
      // eslint-disable-next-line global-require
      const Notifications = require('expo-notifications');
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      this.notifications = Notifications;
      return Notifications;
    } catch (e) {
      console.warn(`NotificationService: expo-notifications unavailable: ${e?.message || e}`);
      return null;
    }
  }

  _notifiedIdsKey() {
    return `${NOTIFIED_ALERTS_KEY_PREFIX}:${this.scopeKey}`;
  }

  async _getNotifiedIds() {
    try {
      const raw = await AsyncStorage.getItem(this._notifiedIdsKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map((v) => String(v)) : []);
    } catch (_) {
      return new Set();
    }
  }

  async _markNotified(alertId) {
    if (!alertId) return;
    const set = await this._getNotifiedIds();
    set.add(String(alertId));
    const next = Array.from(set).slice(-300);
    try {
      await AsyncStorage.setItem(this._notifiedIdsKey(), JSON.stringify(next));
    } catch (_) {
      // no-op
    }
  }

  async setScope(scopeKey) {
    const next = String(scopeKey || DEFAULT_SCOPE);
    if (next === this.scopeKey) return;
    this.scopeKey = next;
  }

  async init() {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.dispose();
      return false;
    }
    if (this.started) return true;
    this.started = true;

    try {
      const Notifications = this._loadNotificationsModule();
      if (!Notifications) {
        this._attachAlertEngineListener();
        return true;
      }

      await this.requestPermission();
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('smart-alerts', {
          name: 'Smart Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        // Dedicated high-priority channel for abnormal behavior (Rule 7: vomiting, head-pressing etc.)
        await Notifications.setNotificationChannelAsync('abnormal-alerts', {
          name: 'Abnormal Behavior Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400, 200, 400],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
          lightColor: '#FF0000',
          enableLights: true,
        });
      }
      this._attachAlertEngineListener();
      return true;
    } catch (e) {
      console.warn(`NotificationService.init failed: ${e?.message || e}`);
      return false;
    }
  }

  _attachAlertEngineListener() {
    if (this.alertListener) return;
    this.alertListener = async (alert) => {
      await this._notifyForAlert(alert);
    };
    AlertEngine.on(AlertEvents.ALERT_ADDED, this.alertListener);
  }

  async dispose() {
    this.responseSub?.remove?.();
    this.responseSub = null;
    if (this.alertListener) {
      AlertEngine.off(AlertEvents.ALERT_ADDED, this.alertListener);
      this.alertListener = null;
    }
    this.started = false;
  }

  async isEnabled() {
    try {
      const raw = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
      if (raw === null) return true;
      return String(raw) === 'true';
    } catch (_) {
      return true;
    }
  }

  async setEnabled(enabled) {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(!!enabled));
    } catch (_) {
      // no-op
    }
    if (!enabled) {
      await this.cancelAllNotifications();
    }
  }

  async cancelAllNotifications() {
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (_) {
      // no-op
    }
    try {
      await Notifications.dismissAllNotificationsAsync?.();
    } catch (_) {
      // no-op
    }
    try {
      await AsyncStorage.removeItem(INACTIVITY_NOTIFICATION_ID_KEY);
    } catch (_) {
      // no-op
    }
  }

  async requestPermission() {
    const enabled = await this.isEnabled();
    if (!enabled) return false;
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return false;

    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }
    const next = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return !!next.granted;
  }

  async _notifyForAlert(alert) {
    if (!alert || alert.isDeleted) return;
    if (!alert.id) return;

    const enabled = await this.isEnabled();
    if (!enabled) return;
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return;

    const seen = await this._getNotifiedIds();
    if (seen.has(String(alert.id))) return;

    const isAppActive = AppState.currentState === 'active';
    const fromRemote = alert?._fromRemote === true;
    // Abnormal = isAbnormal flag OR critical severity OR abnormal behavior labels
    const isAbnormal = alert?.isAbnormal === true
      || String(alert.severity || '').toLowerCase() === 'critical'
      || String(alert.type || '').toLowerCase() === 'behavior_abnormal'
      || isAbnormalBehavior(alert?.behaviorLabel)
      || isAbnormalBehavior(alert?.behaviorDetail);

    // Abnormal alerts always push — even when app is active (Rule 7: must always show)
    // Normal alerts only push when app is in background or from remote sync
    if (!isAbnormal && isAppActive && !fromRemote) {
      return;
    }

    // Skip very old alerts from remote sync to avoid replay spam on reopen.
    const ts = new Date(alert.timestamp || 0).getTime();
    if (fromRemote && Number.isFinite(ts)) {
      const ageMin = (Date.now() - ts) / (60 * 1000);
      if (ageMin > REMOTE_ALERT_MAX_AGE_MIN) {
        await this._markNotified(alert.id);
        return;
      }
    }

    const channelId = isAbnormal ? 'abnormal-alerts' : 'smart-alerts';
    const title = isAbnormal
      ? 'Abnormal behavior detected!'
      : (severityTitle[String(alert.severity || 'info').toLowerCase()] || 'Notification');
    const body = String(alert.title || alert.desc || 'You have a new update.');
    const interruptionLevel = isAbnormal ? 'timeSensitive' : 'active';

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            type: 'app_alert',
            target: 'Alert',
            alertId: String(alert.id),
          },
          sound: true,
          priority: isAbnormal ? 'max' : 'default',
          ...(Platform.OS === 'android' ? { channelId } : {}),
          ...(Platform.OS === 'ios' ? { interruptionLevel } : {}),
        },
        trigger: null,
      });

      await this._markNotified(alert.id);
    } catch (_) {
      // Permission denied or API unavailable on emulator.
    }
  }

  async markUserActiveNow() {
    try {
      await AsyncStorage.setItem(LAST_ACTIVE_AT_KEY, new Date().toISOString());
      await this.scheduleInactivityReminder();
    } catch (_) {
      // no-op
    }
  }

  async scheduleInactivityReminder() {
    const enabled = await this.isEnabled();
    if (!enabled) return null;
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return null;

    try {
      const oldId = await AsyncStorage.getItem(INACTIVITY_NOTIFICATION_ID_KEY);
      if (oldId) {
        await Notifications.cancelScheduledNotificationAsync(oldId).catch(() => {});
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Health check reminder',
          body: "You have not opened Neko Care for a while. Open the app and log today's cat health data.",
          data: {
            type: 'inactivity_reminder',
            target: 'Home',
          },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: INACTIVITY_HOURS * 60 * 60,
        },
      });

      await AsyncStorage.setItem(INACTIVITY_NOTIFICATION_ID_KEY, String(id));
      return id;
    } catch (_) {
      return null;
    }
  }

  async maybeSendCatchupReminder() {
    const enabled = await this.isEnabled();
    if (!enabled) return;
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return;

    try {
      const raw = await AsyncStorage.getItem(LAST_ACTIVE_AT_KEY);
      if (!raw) return;
      const lastMs = new Date(raw).getTime();
      if (!Number.isFinite(lastMs)) return;

      const inactiveHours = (Date.now() - lastMs) / (60 * 60 * 1000);
      if (inactiveHours < INACTIVITY_HOURS) return;

      const lastCatchupRaw = await AsyncStorage.getItem(LAST_CATCHUP_ALERT_AT_KEY);
      const lastCatchupMs = new Date(lastCatchupRaw || 0).getTime();
      if (Number.isFinite(lastCatchupMs) && (Date.now() - lastCatchupMs) < (8 * 60 * 60 * 1000)) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Welcome back',
          body: 'Please update your cat daily log so health trends stay accurate.',
          data: {
            type: 'catchup_reminder',
            target: 'LogDaily',
          },
        },
        trigger: null,
      });

      await AlertEngine.logEvent({
        type: 'engagement_followup',
        severity: 'info',
        title: 'Reminder to update daily cat health',
        desc: "You have not opened the app for a while. Please log today's data to keep insights accurate.",
        dedupeKey: `engagement_followup:${this.scopeKey}`,
        cooldownMs: 8 * 60 * 60 * 1000,
      });
      await AsyncStorage.setItem(LAST_CATCHUP_ALERT_AT_KEY, new Date().toISOString());
    } catch (_) {
      // no-op
    }
  }

  async getInitialNotificationTarget() {
    const enabled = await this.isEnabled();
    if (!enabled) return null;
    const Notifications = this._loadNotificationsModule();
    if (!Notifications) return null;
    try {
      const initial = await Notifications.getLastNotificationResponseAsync();
      return initial?.notification?.request?.content?.data?.target || null;
    } catch (_) {
      return null;
    }
  }

  registerNavigationListener(onTarget) {
    const Notifications = this._loadNotificationsModule();
    if (!Notifications || typeof onTarget !== 'function') {
      return () => {};
    }

    this.responseSub?.remove?.();
    this.responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = response?.notification?.request?.content?.data?.target;
      if (target) onTarget(String(target));
    });
    return () => {
      this.responseSub?.remove?.();
      this.responseSub = null;
    };
  }
}

const NotificationService = new NotificationServiceClass();
export default NotificationService;
